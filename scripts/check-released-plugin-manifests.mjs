#!/usr/bin/env node
// Checks plugin releases against the immutable core v0.0.20 plugin API fixture.
//   node scripts/check-released-plugin-manifests.mjs --index <registry index>
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registryManifestErrors } from "./check-plugin-manifests.mjs";

const fixtureManifest = new URL("../test/released-core-v0.0.20/package.json", import.meta.url);
const fixturePackage = JSON.parse(readFileSync(fixtureManifest, "utf8"));
const releasedApiDependency = fixturePackage.devDependencies?.["@soksak/plugin-api"];
if (releasedApiDependency !== "git+https://github.com/soksak-app/core.git#v0.0.20&path:/packages/plugin-api") {
  throw new Error(`released SDK fixture must pin core v0.0.20, found ${releasedApiDependency}`);
}
const fixtureRequire = createRequire(fixtureManifest);
const apiEntry = fixtureRequire.resolve("@soksak/plugin-api");
const apiPackage = JSON.parse(readFileSync(join(dirname(apiEntry), "package.json"), "utf8"));
const RELEASED_CORE_VERSION = "0.0.20";
if (apiPackage.version !== RELEASED_CORE_VERSION) {
  throw new Error(`released SDK fixture must be core ${RELEASED_CORE_VERSION}, found ${apiPackage.version}`);
}
const releasedApi = await import(pathToFileURL(apiEntry).href);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== "--index") {
    console.error("usage: node scripts/check-released-plugin-manifests.mjs --index <registry index>");
    process.exit(2);
  }
  const index = JSON.parse(readFileSync(process.argv[3], "utf8"));
  const { checked, errors } = await registryManifestErrors(index, undefined, {
    version: apiPackage.version,
    rangeContains: releasedApi.rangeContains,
    validateManifest: releasedApi.validateManifest,
  });
  if (errors.length) {
    console.error(errors.join("\n"));
    console.error(`${errors.length} of ${checked} unrevoked plugin versions whose engines include released core ${RELEASED_CORE_VERSION} have manifests rejected by its SDK`);
    process.exit(1);
  }
  console.log(`Released manifest check passed: core ${RELEASED_CORE_VERSION} SDK accepts ${checked} compatible plugin versions`);
}
