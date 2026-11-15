#!/usr/bin/env node
// Checks that no unrevoked plugin version has an engines.soksak range that contains a core newer than the newest core version
// that core.json lists (core docs/spec/registry.md#check). A listed core enters core.json without a check of the plugins that
// it installs: each plugin keeps its own compatibility, and a core refuses a plugin that it does not accept alone. The ranges
// are read with the range rule of the newest listed core, from its plugin API release file
// v<version>/soksak-plugin-api-<version>.tgz under the release download address of core.
//   node scripts/check-listed-cores.mjs --index <registry index> --releases <release download address of core>
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { fetchBytes } from "./plugin-release.mjs";

/** The order of two plain x.y.z versions; a version of another form is an error. */
export function compareVersions(a, b) {
  const parts = (version) => {
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`version ${version} is not of the form x.y.z`);
    return version.split(".").map(Number);
  };
  const [left, right] = [parts(a), parts(b)];
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

/** The newest core version that core.json lists and revoked.json does not withdraw. */
export function newestListedCore(index) {
  // default: an index without revoked.core withdraws no core version.
  const withdrawn = new Set((index.revoked.core ?? []).map((entry) => entry.version));
  const listed = index.core.versions.map((entry) => entry.version).filter((version) => !withdrawn.has(version));
  if (listed.length === 0) throw new Error("core.json lists no core version that revoked.json does not withdraw");
  return listed.reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b));
}

/**
 * Whether core is a 0.0 version that a caret range of a 0.0 version in range admits: `^0.0.z` is from 0.0.z below 0.1.0
 * (core docs/spec/installation.md#versions-and-ranges), because a patch release of core is a compatible release. Such a
 * range is the whole range or a part of a union `<range> || <range>`. The containment itself is the rule of the SDK; this
 * names only the later cores that a range admits by intent.
 */
export function zeroCaretAdmits(range, core) {
  return range.split(" || ").some((part) => {
    const match = /^\^0\.0\.(\d+)$/.exec(part);
    return match !== null && compareVersions(core, `0.0.${match[1]}`) >= 0 && compareVersions(core, "0.1.0") < 0;
  });
}

/**
 * The errors of the unrevoked plugin versions whose range contains a core newer than the newest listed core that is not
 * withdrawn: `plugin <id> <version>: range <range> contains core <core>, newer than the newest listed core <newest>`.
 * Core releases publish before the plugin releases for them, so such a core would select that version although its manifest
 * reader was not checked against it. Each range is probed with the next patch, minor and major version of the newest core.
 * A later 0.0 core that a caret range of a 0.0 version, or such a part of a union, admits is no error, because that range
 * admits the later patch releases of its line by intent.
 */
export function laterCoreErrors(index, rangeContains) {
  const newest = newestListedCore(index);
  const [major, minor, patch] = newest.split(".").map(Number);
  const later = [`${major}.${minor}.${patch + 1}`, `${major}.${minor + 1}.0`, `${major + 1}.0.0`];
  const revoked = new Set(index.revoked.plugins.map((entry) => `${entry.id}@${entry.version}`));
  const errors = [];
  for (const plugin of index.plugins) {
    for (const entry of plugin.versions) {
      if (revoked.has(`${plugin.id}@${entry.version}`)) continue;
      const range = entry.engines.soksak;
      const core = later.find((version) => rangeContains(range, version) && !zeroCaretAdmits(range, version));
      if (core) errors.push(`plugin ${plugin.id} ${entry.version}: range ${range} contains core ${core}, newer than the newest listed core ${newest}`);
    }
  }
  return errors;
}

/**
 * Loads the plugin API of core <version> from its release file `<releases>/v<version>/soksak-plugin-api-<version>.tgz`, the pnpm
 * pack file of the package, extracted into a folder under out.
 */
export function releaseSdkLoader(releases, out, fetchRelease = fetchBytes) {
  return async (version) => {
    const url = `${releases}/v${version}/soksak-plugin-api-${version}.tgz`;
    let bytes;
    try {
      bytes = await fetchRelease(url);
    } catch (error) {
      throw new Error(`the SDK of core ${version} at ${url}: ${error.message}`);
    }
    const folder = join(out, `v${version}`);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "plugin-api.tgz"), bytes);
    execFileSync("tar", ["-xzf", join(folder, "plugin-api.tgz"), "-C", folder]);
    const api = join(folder, "package");
    const manifest = JSON.parse(readFileSync(join(api, "package.json"), "utf8"));
    const sdk = await import(pathToFileURL(join(api, manifest.exports["."])).href);
    if (manifest.version !== version) throw new Error(`the SDK of core ${version} at ${url} reports version ${manifest.version}`);
    return { version: manifest.version, rangeContains: sdk.rangeContains };
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { index: { type: "string" }, releases: { type: "string" } }, strict: true });
  if (!values.index || !values.releases) {
    console.error("usage: node scripts/check-listed-cores.mjs --index <registry index> --releases <release download address of core>");
    process.exit(2);
  }
  const index = JSON.parse(readFileSync(values.index, "utf8"));
  const out = mkdtempSync(join(tmpdir(), "soksak-registry-core-sdks-"));
  try {
    const load = releaseSdkLoader(values.releases, out);
    // The ranges are read with the range rule of the newest listed core.
    const later = laterCoreErrors(index, (await load(newestListedCore(index))).rangeContains);
    if (later.length) {
      console.error(later.join("\n"));
      console.error(`${later.length} unrevoked plugin versions have ranges that contain a core newer than the newest listed core`);
      process.exit(1);
    }
    console.log(`Listed core check passed: no plugin range contains a core newer than ${newestListedCore(index)}`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}
