#!/usr/bin/env node
// Checks plugin releases against the manifest reader of the SDK pinned by this registry.
//   node scripts/check-plugin-manifests.mjs --index <registry index>
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rangeContains as developmentRangeContains, validateManifest as developmentValidateManifest } from "@soksak/plugin-api";
import { fetchBytes, verifiedManifest } from "./plugin-release.mjs";

const API_ENTRY = fileURLToPath(import.meta.resolve("@soksak/plugin-api"));
export const PLUGIN_API_VERSION = JSON.parse(readFileSync(join(dirname(API_ENTRY), "package.json"), "utf8")).version;

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
        validateManifest(await verifiedManifest(version, fetchRelease));
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
