#!/usr/bin/env node
// Checks plugin releases against the manifest reader of the SDK pinned by this registry.
//   node scripts/check-plugin-manifests.mjs --index <registry index>
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rangeContains as developmentRangeContains, validateManifest as developmentValidateManifest } from "@soksak/plugin-api";

const API_ENTRY = fileURLToPath(import.meta.resolve("@soksak/plugin-api"));
export const PLUGIN_API_VERSION = JSON.parse(readFileSync(join(dirname(API_ENTRY), "package.json"), "utf8")).version;

async function fetchBytes(url) {
  if (url.startsWith("file:")) return readFileSync(fileURLToPath(url));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function releaseManifest(bytes) {
  const folder = mkdtempSync(join(tmpdir(), "soksak-registry-plugin-manifest-"));
  try {
    const path = join(folder, "plugin.tgz");
    writeFileSync(path, bytes);
    return JSON.parse(execFileSync("tar", ["-xzOf", path, "plugin.json"], { encoding: "utf8" }));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/** Errors for unrevoked releases whose engine range includes the pinned plugin API version. */
export async function registryManifestErrors(index, fetchRelease = fetchBytes, reader = {}) {
  const sdkVersion = reader.version ?? PLUGIN_API_VERSION;
  const rangeContains = reader.rangeContains ?? developmentRangeContains;
  const validateManifest = reader.validateManifest ?? developmentValidateManifest;
  const revoked = new Set(index.revoked.plugins.map((entry) => `${entry.id}@${entry.version}`));
  const errors = [];
  let checked = 0;
  for (const plugin of index.plugins) {
    for (const version of plugin.versions) {
      if (revoked.has(`${plugin.id}@${version.version}`) || !rangeContains(version.engines.soksak, sdkVersion)) continue;
      checked += 1;
      const where = `plugin ${plugin.id} ${version.version}`;
      try {
        const bytes = await fetchRelease(version.release.url);
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (digest !== version.release.sha256) throw new Error(`release sha256 ${digest} differs from the index ${version.release.sha256}`);
        validateManifest(releaseManifest(bytes));
      } catch (error) {
        errors.push(`${where}: ${error.message}`);
      }
    }
  }
  return { checked, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== "--index") {
    console.error("usage: node scripts/check-plugin-manifests.mjs --index <registry index>");
    process.exit(2);
  }
  const indexPath = process.argv[3];
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  const { checked, errors } = await registryManifestErrors(index);
  if (errors.length) {
    console.error(errors.join("\n"));
    console.error(`${errors.length} of ${checked} unrevoked plugin versions whose engines include development SDK ${PLUGIN_API_VERSION} have manifests rejected by @soksak/plugin-api`);
    process.exit(1);
  }
  console.log(`Registry manifest check passed: @soksak/plugin-api ${PLUGIN_API_VERSION} accepts ${checked} compatible plugin versions`);
}
