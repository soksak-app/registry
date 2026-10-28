#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { candidateManifestErrors } from "./check-candidate-plugin-manifests.mjs";
import { sidecarFileName } from "./validate.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PLAN_PATH = join(ROOT, "candidate-release.json");

function clone(value) {
  return structuredClone(value);
}

function identity(item, field) {
  return `${item[field]}@${item.version}`;
}

function uniqueIdentities(items, field, where) {
  if (!Array.isArray(items)) throw new Error(`${where} must be an array`);
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item[field] !== "string" || item[field] === "" || typeof item.version !== "string" || item.version === "") {
      throw new Error(`${where} contains an invalid ${field}/version identity`);
    }
    const key = identity(item, field);
    if (seen.has(key)) throw new Error(`${where} repeats ${key}`);
    seen.add(key);
  }
  return seen;
}

function listedEntries(entries, field, where) {
  if (!Array.isArray(entries)) throw new Error(`${where} must be an array`);
  const map = new Map();
  for (const entry of entries) {
    const name = entry?.[field];
    if (typeof name !== "string" || name === "") throw new Error(`${where} has an entry without ${field}`);
    if (map.has(name)) throw new Error(`${where} repeats ${name}`);
    map.set(name, entry);
  }
  return map;
}

function entryMetadata(entry) {
  const { versions: _versions, ...metadata } = entry;
  return metadata;
}

function candidateVersions(entries, expected, field, where) {
  const expectedNames = expected.map((item) => item[field]).sort();
  const actualNames = entries.map((entry) => entry?.[field]).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`${where} entries differ from the candidate declaration`);
  }
  const map = new Map();
  for (const entry of entries) {
    const key = entry[field];
    if (map.has(key)) throw new Error(`${where} repeats ${key}`);
    map.set(key, entry);
  }
  for (const item of expected) {
    const entry = map.get(item[field]);
    if (!Array.isArray(entry.versions) || entry.versions.length !== 1) {
      throw new Error(`${where} ${item[field]} must contain exactly one candidate version`);
    }
    if (entry.versions[0].version !== item.version) {
      throw new Error(`${where} ${item[field]} version ${entry.versions[0].version} differs from declared ${item.version}`);
    }
  }
  return map;
}

/** Merges declared replacement entries and the exact revocation delta into registry declarations. */
export function projectCandidateDeclarations({ base, additions, plan }) {
  if (!base || !additions || !plan) throw new Error("candidate projection needs base, additions and plan");
  if (plan.format !== 1 || !plan.candidateCore || typeof plan.candidateCore.version !== "string") {
    throw new Error("candidate-release.json has an unsupported format or missing core candidate");
  }
  const pluginExpected = plan.replacementPlugins;
  const sidecarExpected = plan.replacementSidecars;
  const pluginDelta = plan.additionalPluginRevocations;
  if (!Array.isArray(pluginExpected) || pluginExpected.length === 0) {
    throw new Error("replacement plugin projection must not be empty");
  }
  const pluginDeltaKeys = uniqueIdentities(pluginDelta, "id", "additional plugin revocations");
  uniqueIdentities(pluginExpected, "id", "replacement plugins");
  uniqueIdentities(sidecarExpected, "name", "replacement sidecars");

  const basePlugins = listedEntries(base.plugins, "id", "base plugins");
  const addedPlugins = candidateVersions(additions.plugins, pluginExpected, "id", "candidate plugins");
  const projectedPlugins = base.plugins.map(clone);
  const projectedPluginMap = new Map(projectedPlugins.map((entry) => [entry.id, entry]));
  for (const [id, addition] of addedPlugins) {
    const current = basePlugins.get(id);
    if (!current) throw new Error(`candidate plugin ${id} has no existing registry entry`);
    if (!isDeepStrictEqual(entryMetadata(current), entryMetadata(addition))) {
      throw new Error(`candidate plugin ${id} metadata differs from the registry entry`);
    }
    const target = projectedPluginMap.get(id);
    if (target.versions.some(({ version }) => version === addition.versions[0].version)) {
      throw new Error(`candidate plugin ${id} version ${addition.versions[0].version} already exists`);
    }
    target.versions.push(clone(addition.versions[0]));
  }

  const baseSidecars = listedEntries(base.sidecars, "name", "base sidecars");
  const addedSidecars = candidateVersions(additions.sidecars, sidecarExpected, "name", "candidate sidecars");
  const projectedSidecars = base.sidecars.map(clone);
  const projectedSidecarMap = new Map(projectedSidecars.map((entry) => [entry.name, entry]));
  for (const [name, addition] of addedSidecars) {
    const current = baseSidecars.get(name);
    if (!current) throw new Error(`candidate sidecar ${name} has no existing registry entry`);
    if (!isDeepStrictEqual(entryMetadata(current), entryMetadata(addition))) {
      throw new Error(`candidate sidecar ${name} metadata differs from the registry entry`);
    }
    const target = projectedSidecarMap.get(name);
    if (target.versions.some(({ version }) => version === addition.versions[0].version)) {
      throw new Error(`candidate sidecar ${name} version ${addition.versions[0].version} already exists`);
    }
    target.versions.push(clone(addition.versions[0]));
  }

  if (!base.core || !Array.isArray(base.core.versions)) throw new Error("registry core.json must declare its current versions");
  if (base.core.versions.some(({ version }) => version === plan.candidateCore.version)) {
    throw new Error(`candidate core ${plan.candidateCore.version} already has registry assets`);
  }
  const existingRevocations = base.revoked?.plugins;
  if (!Array.isArray(existingRevocations) || !Array.isArray(base.revoked.sidecars) || (Object.hasOwn(base.revoked, "core") && !Array.isArray(base.revoked.core))) {
    throw new Error("registry revoked.json must declare plugin and sidecar arrays and an optional core array");
  }
  const existingKeys = uniqueIdentities(existingRevocations, "id", "existing plugin revocations");
  for (const item of pluginDelta) {
    const key = identity(item, "id");
    if (typeof item.reason !== "string" || item.reason.trim() === "") throw new Error(`candidate revocation ${key} needs a reason`);
    if (existingKeys.has(key)) throw new Error(`candidate revocation ${key} already exists`);
    const plugin = basePlugins.get(item.id);
    if (!plugin?.versions?.some(({ version }) => version === item.version)) {
      throw new Error(`candidate revocation ${key} is not a published registry version`);
    }
  }
  const baseRevoked = clone(base.revoked);

  return {
    plugins: projectedPlugins,
    sidecars: projectedSidecars,
    packs: clone(base.packs),
    core: clone(base.core),
    revoked: { ...baseRevoked, plugins: [...baseRevoked.plugins, ...clone(pluginDelta)] },
  };
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path}: ${error.message}`);
  }
}

function readEntryDirectory(root, name) {
  const directory = join(root, name);
  if (!existsSync(directory)) throw new Error(`${directory}: directory is missing`);
  const files = readdirSync(directory).sort();
  const invalid = files.find((file) => !file.endsWith(".json"));
  if (invalid) throw new Error(`${directory}/${invalid}: expected a JSON registry declaration`);
  return files.map((file) => readJson(join(directory, file)));
}

function readRegistryDeclarations(root) {
  return {
    plugins: readEntryDirectory(root, "plugins"),
    sidecars: readEntryDirectory(root, "sidecars"),
    packs: readEntryDirectory(root, "packs"),
    core: readJson(join(root, "core.json")),
    revoked: readJson(join(root, "revoked.json")),
  };
}

function readCandidateDeclarations(root, plan) {
  const rootEntries = readdirSync(root).sort();
  if (JSON.stringify(rootEntries) !== JSON.stringify(["plugins", "sidecars"])) {
    throw new Error(`${root}: candidate entries must contain only plugins and sidecars directories`);
  }
  const pluginsDir = join(root, "plugins");
  const sidecarsDir = join(root, "sidecars");
  const plugins = plan.replacementPlugins.map(({ id }) => readJson(join(pluginsDir, `${id}.json`)));
  const sidecars = plan.replacementSidecars.map(({ name }) => readJson(join(sidecarsDir, `${sidecarFileName(name)}.json`)));
  const allowed = new Set([
    ...plan.replacementPlugins.map(({ id }) => `plugins/${id}.json`),
    ...plan.replacementSidecars.map(({ name }) => `sidecars/${sidecarFileName(name)}.json`),
  ]);
  for (const folder of ["plugins", "sidecars"]) {
    const directory = join(root, folder);
    if (!existsSync(directory)) throw new Error(`${directory}: directory is missing`);
    for (const file of readdirSync(directory)) {
      const relativePath = `${folder}/${file}`;
      if (!allowed.has(relativePath)) throw new Error(`${relativePath}: candidate entry is not declared`);
    }
  }
  return { plugins, sidecars };
}

function writeRegistryDeclarations(root, declarations) {
  for (const folder of ["plugins", "sidecars", "packs"]) {
    const directory = join(root, folder);
    mkdirSync(directory, { recursive: true });
    for (const entry of declarations[folder]) {
      const key = folder === "plugins" ? entry.id : folder === "sidecars" ? sidecarFileName(entry.name) : entry.name;
      writeFileSync(join(directory, `${key}.json`), `${JSON.stringify(entry, null, 2)}\n`);
    }
  }
  writeFileSync(join(root, "core.json"), `${JSON.stringify(declarations.core, null, 2)}\n`);
  writeFileSync(join(root, "revoked.json"), `${JSON.stringify(declarations.revoked, null, 2)}\n`);
}

function checkedVersions(report, where) {
  if (!report || !Number.isSafeInteger(report.checked) || !Array.isArray(report.errors)) {
    throw new Error(`${where}: candidate manifest checker returned an invalid result`);
  }
  return report.errors.map((message) => {
    const match = /^plugin ([^ ]+) (\d+\.\d+\.\d+): plugin \1: (surface module|state) is removed\b/.exec(message);
    if (!match) throw new Error(`${where}: unexpected candidate manifest failure: ${message}`);
    return { id: match[1], version: match[2], field: match[3] };
  });
}

function equalIdentities(left, right, field) {
  const keys = (items) => items.map((item) => identity(item, field)).sort();
  return JSON.stringify(keys(left)) === JSON.stringify(keys(right));
}

function sameRevocations(left, right) {
  if (left === null || typeof left !== "object" || right === null || typeof right !== "object") return false;
  const withoutEmptyCore = (value) => {
    const normalized = clone(value);
    if (Array.isArray(normalized.core) && normalized.core.length === 0) delete normalized.core;
    return normalized;
  };
  return isDeepStrictEqual(withoutEmptyCore(left), withoutEmptyCore(right));
}

function indexProjectionErrors(index, base, declarations, plan) {
  const errors = [];
  const coreVersions = index.core?.versions?.map(({ version }) => version) ?? [];
  const sourceCoreVersions = base.core.versions.map(({ version }) => version);
  if (JSON.stringify([...coreVersions].sort()) !== JSON.stringify([...sourceCoreVersions].sort())) errors.push("candidate index changes the current core entry set");
  if (coreVersions.includes(plan.candidateCore.version)) errors.push(`candidate index includes core ${plan.candidateCore.version} before its assets exist`);
  const expectedCore = new Map(base.core.versions.map((entry) => [entry.version, entry]));
  const actualCore = new Map((index.core?.versions ?? []).map((entry) => [entry.version, entry]));
  for (const [version, entry] of expectedCore) {
    if (!isDeepStrictEqual(actualCore.get(version), entry)) errors.push(`candidate index changes core ${version}`);
  }
  if (!sameRevocations(index.revoked, declarations.revoked)) errors.push("candidate index changes the revocation declarations");
  for (const [name, expectedEntries, actualEntries] of [
    ["plugin", declarations.plugins, index.plugins],
    ["sidecar", declarations.sidecars, index.sidecars],
  ]) {
    const expected = new Map(expectedEntries.map((entry) => [entry[name === "plugin" ? "id" : "name"], entry]));
    const actual = new Map((actualEntries ?? []).map((entry) => [entry[name === "plugin" ? "id" : "name"], entry]));
    if (expected.size !== actual.size || [...expected.keys()].some((key) => !actual.has(key))) {
      errors.push(`candidate index changes the ${name} entry set`);
      continue;
    }
    for (const [key, expectedEntry] of expected) {
      const actualEntry = actual.get(key);
      const expectedVersions = new Map(expectedEntry.versions.map((entry) => [entry.version, entry]));
      const actualVersions = new Map((actualEntry.versions ?? []).map((entry) => [entry.version, entry]));
      if (expectedVersions.size !== actualVersions.size || [...expectedVersions.keys()].some((version) => !actualVersions.has(version))) {
        errors.push(`candidate index changes the ${name} ${key} version projection`);
        continue;
      }
      for (const [version, expectedVersion] of expectedVersions) {
        if (!isDeepStrictEqual(actualVersions.get(version), expectedVersion)) errors.push(`candidate index changes ${name} ${key}@${version}`);
      }
    }
  }
  for (const expected of plan.replacementPlugins) {
    const plugin = index.plugins?.find(({ id }) => id === expected.id);
    if (!plugin?.versions?.some(({ version }) => version === expected.version)) errors.push(`candidate index is missing plugin ${expected.id}@${expected.version}`);
  }
  for (const expected of plan.replacementSidecars) {
    const sidecar = index.sidecars?.find(({ name }) => name === expected.name);
    if (!sidecar?.versions?.some(({ version }) => version === expected.version)) errors.push(`candidate index is missing sidecar ${expected.name}@${expected.version}`);
  }
  return errors;
}

/** Binds the validated candidate index to its source, SDK and declaration evidence. */
export function createCandidateProof({ plan, registrySourceRevision, sdkIdentity, indexBytes, coreBytes, index, base, declarations, rejectedVersions, candidateManifestChecked }) {
  if (!/^[0-9a-f]{40}$/.test(registrySourceRevision ?? "")) throw new Error("registry source revision must be a full Git commit id");
  if (!Array.isArray(plan.replacementPlugins) || plan.replacementPlugins.length === 0) {
    throw new Error("replacement plugin projection must not be empty");
  }
  if (!sdkIdentity || sdkIdentity.sourceRevision !== plan.candidateCore.sourceRevision || sdkIdentity.apiVersion !== plan.candidateCore.apiVersion || sdkIdentity.apiTree !== plan.candidateCore.apiTree) {
    throw new Error("candidate SDK identity differs from candidate-release.json");
  }
  if (!Buffer.isBuffer(indexBytes)) throw new Error("candidate index bytes are required");
  if (!Buffer.isBuffer(coreBytes)) throw new Error("source core.json bytes are required");
  const projectionErrors = indexProjectionErrors(index, base, declarations, plan);
  if (projectionErrors.length) throw new Error(projectionErrors.join("; "));
  if (!equalIdentities(rejectedVersions, plan.additionalPluginRevocations, "id")) {
    throw new Error("pre-revocation candidate failures differ from the declared revocation delta");
  }
  if (!Number.isSafeInteger(candidateManifestChecked) || candidateManifestChecked !== plan.replacementPlugins.length) {
    throw new Error("candidate manifest check must verify exactly the replacement plugin projection");
  }
  return {
    format: 1,
    registrySourceRevision,
    candidateSdk: sdkIdentity,
    indexSha256: sha256(indexBytes),
    candidateCoreVersion: plan.candidateCore.version,
    preservedCoreVersions: base.core.versions.map(({ version }) => version),
    preservedCoreJsonSha256: sha256(coreBytes),
    replacementPlugins: clone(plan.replacementPlugins),
    replacementSidecars: clone(plan.replacementSidecars),
    preservedRevocations: clone(base.revoked),
    additionalPluginRevocations: clone(plan.additionalPluginRevocations),
    preRevocationRejectedVersions: clone(rejectedVersions),
    candidateManifestChecked,
  };
}

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function candidateIdentity(plan, coreSourceDir, apiDir) {
  const sourceRevision = git(coreSourceDir, "rev-parse", `${plan.candidateCore.sourceRevision}^{commit}`);
  if (sourceRevision !== plan.candidateCore.sourceRevision) throw new Error("candidate core source revision differs from candidate-release.json");
  const apiRelative = relative(resolve(coreSourceDir), resolve(apiDir));
  if (apiRelative === ".." || apiRelative.startsWith(`..${sep}`) || isAbsolute(apiRelative)) {
    throw new Error("CORE_PLUGIN_API_DIR must be inside CORE_SOURCE_DIR");
  }
  const apiTree = git(coreSourceDir, "rev-parse", `${sourceRevision}:${apiRelative.split(sep).join("/")}`);
  if (apiTree !== plan.candidateCore.apiTree) throw new Error("candidate SDK API tree differs from candidate-release.json");
  const currentApiTree = git(coreSourceDir, "rev-parse", `HEAD:${apiRelative.split(sep).join("/")}`);
  if (currentApiTree !== plan.candidateCore.apiTree) throw new Error("current SDK API tree differs from candidate-release.json");
  const changed = git(coreSourceDir, "status", "--porcelain", "--", apiRelative);
  if (changed !== "") throw new Error("candidate SDK package has uncommitted changes");
  const manifest = readJson(join(apiDir, "package.json"));
  if (manifest.name !== "@soksak/plugin-api" || manifest.version !== plan.candidateCore.apiVersion) {
    throw new Error("candidate SDK package identity differs from candidate-release.json");
  }
  return { sourceRevision, apiVersion: manifest.version, apiTree };
}

function registryIdentity(registryDir) {
  const status = git(registryDir, "status", "--porcelain", "--untracked-files=all");
  if (status !== "") throw new Error("registry source has uncommitted changes");
  return git(registryDir, "rev-parse", "HEAD");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Builds and validates a private candidate using the existing registry CLI and candidate manifest checker. */
export async function buildCandidateRelease({
  registryDir = ROOT,
  candidateEntriesDir,
  coreSourceDir,
  apiDir,
  sok,
  outDir,
  plan = readJson(PLAN_PATH),
  runSok = (binary, args) => execFileSync(binary, args, { encoding: "utf8" }),
  checkManifest = candidateManifestErrors,
} = {}) {
  for (const [name, value] of Object.entries({ candidateEntriesDir, coreSourceDir, apiDir, sok, outDir })) {
    if (typeof value !== "string" || value === "") throw new Error(`${name} is required`);
  }
  const resolvedRegistry = resolve(registryDir);
  const resolvedOutput = resolve(outDir);
  const relativeOutput = relative(resolvedRegistry, resolvedOutput);
  if (relativeOutput === "" || (!relativeOutput.startsWith(`..${sep}`) && relativeOutput !== ".." && !isAbsolute(relativeOutput))) {
    throw new Error("candidate output must be outside the registry source");
  }
  const registrySourceRevision = registryIdentity(resolvedRegistry);
  const sdkIdentity = candidateIdentity(plan, resolve(coreSourceDir), resolve(apiDir));
  const base = readRegistryDeclarations(resolvedRegistry);
  const additions = readCandidateDeclarations(resolve(candidateEntriesDir), plan);
  const declarations = projectCandidateDeclarations({ base, additions, plan });

  const scratch = mkdtempSync(join(tmpdir(), "soksak-registry-candidate-"));
  const resultScratch = mkdtempSync(join(tmpdir(), "soksak-registry-candidate-result-"));
  let published = false;
  try {
    writeRegistryDeclarations(scratch, declarations);
    runSok(sok, ["registry", "build", scratch]);
    const indexBytes = readFileSync(join(scratch, "index.json"));
    const index = JSON.parse(indexBytes.toString("utf8"));
    const errors = indexProjectionErrors(index, base, declarations, plan);
    if (errors.length) throw new Error(errors.join("; "));

    const beforeRevocationIndex = clone(index);
    beforeRevocationIndex.revoked.plugins = clone(base.revoked.plugins);
    const rejected = await checkManifest(beforeRevocationIndex, { apiDir, version: plan.candidateCore.apiVersion });
    const rejectedVersions = checkedVersions(rejected, "pre-revocation candidate check");
    if (!equalIdentities(rejectedVersions, plan.additionalPluginRevocations, "id")) {
      throw new Error("pre-revocation candidate failures differ from the declared revocation delta");
    }
    if (rejected.checked !== plan.additionalPluginRevocations.length + plan.replacementPlugins.length) {
      throw new Error("pre-revocation candidate check did not inspect exactly the declared legacy and replacement plugin versions");
    }
    const accepted = await checkManifest(index, { apiDir, version: plan.candidateCore.apiVersion });
    if (accepted.errors.length !== 0) throw new Error(`candidate manifest check rejected ${accepted.errors.length} remaining plugin versions`);
    if (accepted.checked !== plan.replacementPlugins.length) throw new Error("candidate manifest check did not inspect exactly the declared replacement plugin versions");

    const proof = createCandidateProof({
      plan,
      registrySourceRevision,
      sdkIdentity,
      indexBytes,
      coreBytes: readFileSync(join(resolvedRegistry, "core.json")),
      index,
      base,
      declarations,
      rejectedVersions,
      candidateManifestChecked: accepted.checked,
    });
    writeFileSync(join(resultScratch, "index.json"), indexBytes);
    writeFileSync(join(resultScratch, "proof.json"), `${JSON.stringify(proof, null, 2)}\n`);
    if (existsSync(resolvedOutput)) throw new Error(`${resolvedOutput}: candidate output already exists`);
    renameSync(resultScratch, resolvedOutput);
    published = true;
    return { index: join(resolvedOutput, "index.json"), proof: join(resolvedOutput, "proof.json"), proofValue: proof };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    if (!published) rmSync(resultScratch, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      entries: { type: "string" },
      core: { type: "string" },
      api: { type: "string" },
      sok: { type: "string" },
      out: { type: "string" },
    },
    strict: true,
  });
  try {
    const result = await buildCandidateRelease({
      candidateEntriesDir: values.entries,
      coreSourceDir: values.core,
      apiDir: values.api,
      sok: values.sok ?? process.env.SOK,
      outDir: values.out,
    });
    console.log(`Candidate index: ${result.index}`);
    console.log(`Candidate proof: ${result.proof}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
