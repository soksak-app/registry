#!/usr/bin/env node
// Checks a local core SDK candidate through its declared package root export.
//   CORE_PLUGIN_API_DIR=<package> CANDIDATE_VERSION=<version> node scripts/check-candidate-plugin-manifests.mjs --index <registry index>
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registryManifestErrors } from "./check-plugin-manifests.mjs";

export async function candidateManifestErrors(index, { apiDir, version, fetchRelease } = {}) {
  if (typeof apiDir !== "string" || apiDir.length === 0) throw new Error("CORE_PLUGIN_API_DIR must name a plugin-api package directory");
  if (typeof version !== "string" || version.length === 0) throw new Error("CANDIDATE_VERSION must name the expected SDK version");
  const packageDir = resolve(apiDir);
  const packageManifestPath = `${packageDir}${sep}package.json`;
  const packageManifest = JSON.parse(readFileSync(packageManifestPath, "utf8"));
  if (packageManifest.name !== "@soksak/plugin-api") {
    throw new Error(`${packageManifestPath}: expected @soksak/plugin-api, found ${packageManifest.name}`);
  }
  if (packageManifest.version !== version) {
    throw new Error(`candidate SDK package version ${packageManifest.version} differs from requested ${version}`);
  }
  const publicEntry = packageManifest.exports?.["."];
  if (typeof publicEntry !== "string" || !publicEntry.startsWith("./")) {
    throw new Error(`${packageManifestPath}: exports["."] must name a package-relative entry`);
  }
  const entryPath = resolve(packageDir, publicEntry);
  const entryRelative = relative(packageDir, entryPath);
  if (entryRelative === ".." || entryRelative.startsWith(`..${sep}`) || isAbsolute(entryRelative)) {
    throw new Error(`${packageManifestPath}: exports["."] must stay inside the package`);
  }
  const sdk = await import(pathToFileURL(entryPath).href);
  if (typeof sdk.rangeContains !== "function" || typeof sdk.validateManifest !== "function") {
    throw new Error(`${packageManifestPath}: exports["."] must export rangeContains and validateManifest`);
  }
  const result = await registryManifestErrors(index, fetchRelease, {
    version: packageManifest.version,
    rangeContains: sdk.rangeContains,
    validateManifest: sdk.validateManifest,
  });
  return { version: packageManifest.version, ...result };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== "--index") {
    console.error("usage: node scripts/check-candidate-plugin-manifests.mjs --index <registry index>");
    process.exit(2);
  }
  const version = process.env.CANDIDATE_VERSION;
  const apiDir = process.env.CORE_PLUGIN_API_DIR;
  const index = JSON.parse(readFileSync(process.argv[3], "utf8"));
  const { checked, errors } = await candidateManifestErrors(index, { apiDir, version });
  if (errors.length) {
    console.error(errors.join("\n"));
    console.error(`${errors.length} of ${checked} unrevoked plugin versions whose engines include candidate SDK ${version} have manifests rejected by its package root export`);
    process.exit(1);
  }
  console.log(`Candidate manifest check passed: @soksak/plugin-api ${version} accepts ${checked} compatible plugin versions`);
}
