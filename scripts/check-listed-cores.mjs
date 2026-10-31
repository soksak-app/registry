#!/usr/bin/env node
// Checks, for every core version that core.json lists and revoked.json does not withdraw, the plugin version that installation
// selects for it with the manifest reader of that core release (core docs/spec/registry.md#check). Installation selects the
// newest unrevoked version whose engines.soksak contains the core version (core docs/spec/installation.md#version-selection).
// The SDK of a core release is packages/plugin-api of its tag v<version> in a core checkout that holds the tags.
//   node scripts/check-listed-cores.mjs --index <registry index> --core <core checkout>
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { fetchBytes, verifiedManifest } from "./plugin-release.mjs";

/** The order of two plain x.y.z versions; a version of another form is an error. */
export function compareVersions(a, b) {
  const parts = (version) => {
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`version ${version} is not of the form x.y.z`);
    return version.split(".").map(Number);
  };
  const [left, right] = [parts(a), parts(b)];
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

/** The version entry that installation selects for core, for each plugin that has one, by plugin id. */
export function selectedVersions(index, core, rangeContains) {
  const revoked = new Set(index.revoked.plugins.map((entry) => `${entry.id}@${entry.version}`));
  const selected = new Map();
  for (const plugin of index.plugins) {
    const candidates = plugin.versions.filter((entry) => !revoked.has(`${plugin.id}@${entry.version}`)
      && rangeContains(entry.engines.soksak, core));
    if (candidates.length === 0) continue;
    selected.set(plugin.id, candidates.reduce((newest, entry) => (compareVersions(entry.version, newest.version) > 0 ? entry : newest)));
  }
  return selected;
}

/**
 * The errors of the listed core versions: `core <version>: plugin <id> <version>: <reason>`. loadSdk(version) returns
 * { version, rangeContains, validateManifest } of that core release; an SDK of another version is an error.
 */
export async function listedCoreErrors(index, loadSdk, fetchRelease = fetchBytes) {
  // default: an index without revoked.core withdraws no core version.
  const withdrawn = new Set((index.revoked.core ?? []).map((entry) => entry.version));
  const manifests = new Map();
  const errors = [];
  let checked = 0;
  for (const { version: core } of index.core.versions) {
    if (withdrawn.has(core)) continue;
    const sdk = await loadSdk(core);
    if (sdk.version !== core) throw new Error(`the SDK of core ${core} reports version ${sdk.version}`);
    for (const [id, entry] of selectedVersions(index, core, sdk.rangeContains)) {
      checked += 1;
      try {
        // Each release is read once; the same version is selected by many core versions.
        if (!manifests.has(entry.release.url)) manifests.set(entry.release.url, verifiedManifest(entry, fetchRelease));
        sdk.validateManifest(await manifests.get(entry.release.url));
      } catch (error) {
        errors.push(`core ${core}: plugin ${id} ${entry.version}: ${error.message}`);
      }
    }
  }
  return { checked, errors };
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
 * The errors of the unrevoked plugin versions whose range contains a core newer than the newest listed core that is not
 * withdrawn: `plugin <id> <version>: range <range> contains core <core>, newer than the newest listed core <newest>`.
 * Core releases publish before the plugin releases for them, so such a core would select that version although its manifest
 * reader was not checked against it. Each range is probed with the next patch, minor and major version of the newest core.
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
      const core = later.find((version) => rangeContains(entry.engines.soksak, version));
      if (core) errors.push(`plugin ${plugin.id} ${entry.version}: range ${entry.engines.soksak} contains core ${core}, newer than the newest listed core ${newest}`);
    }
  }
  return errors;
}

/** Loads packages/plugin-api of the tag v<version> of the core checkout from a folder under out. */
export function coreSdkLoader(core, out) {
  return async (version) => {
    const folder = join(out, `v${version}`);
    const git = (...args) => execFileSync("git", ["-C", core, ...args], { maxBuffer: 64 * 1024 * 1024 });
    // Each file of packages/plugin-api at the tag is written under the folder; the core checkout is not changed.
    for (const path of git("ls-tree", "-r", "-z", "--name-only", `v${version}`, "--", "packages/plugin-api").toString("utf8").split("\0").filter(Boolean)) {
      mkdirSync(dirname(join(folder, path)), { recursive: true });
      writeFileSync(join(folder, path), git("show", `v${version}:${path}`));
    }
    const api = join(folder, "packages/plugin-api");
    const manifest = JSON.parse(readFileSync(join(api, "package.json"), "utf8"));
    const sdk = await import(pathToFileURL(join(api, manifest.exports["."])).href);
    return { version: manifest.version, rangeContains: sdk.rangeContains, validateManifest: sdk.validateManifest };
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { index: { type: "string" }, core: { type: "string" } }, strict: true });
  if (!values.index || !values.core) {
    console.error("usage: node scripts/check-listed-cores.mjs --index <registry index> --core <core checkout>");
    process.exit(2);
  }
  const index = JSON.parse(readFileSync(values.index, "utf8"));
  const out = mkdtempSync(join(tmpdir(), "soksak-registry-core-sdks-"));
  try {
    const load = coreSdkLoader(values.core, out);
    const { checked, errors } = await listedCoreErrors(index, load);
    // The ranges are read with the range rule of the newest listed core.
    const later = laterCoreErrors(index, (await load(newestListedCore(index))).rangeContains);
    if (later.length) {
      console.error(later.join("\n"));
      console.error(`${later.length} unrevoked plugin versions have ranges that contain a core newer than the newest listed core`);
      process.exit(1);
    }
    if (errors.length) {
      console.error(errors.join("\n"));
      console.error(`${errors.length} of ${checked} plugin versions that the listed core versions install have manifests that the core rejects`);
      process.exit(1);
    }
    console.log(`Listed core check passed: ${index.core.versions.length} listed core versions accept the ${checked} plugin versions that they install`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}
