import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildCandidateRelease, createCandidateProof, projectCandidateDeclarations } from "../scripts/build-candidate-release.mjs";

const plan = JSON.parse(readFileSync(fileURLToPath(new URL("../candidate-release.json", import.meta.url)), "utf8"));
const entry = (id, versions) => ({
  id,
  package: `@soksak/plugin-${id}`,
  name: id,
  description: `${id} plugin`,
  license: "MIT",
  repository: `https://github.com/soksak-app/plugin-${id}`,
  versions,
});
const pluginVersion = (version, engines = ">=0.0.11") => ({
  version,
  release: { url: `file:///releases/${version}.tgz`, sha256: "a".repeat(64) },
  engines: { soksak: engines },
  sidecars: {},
});
const sidecarEntry = (name, version) => ({
  name,
  repository: `https://github.com/soksak-app/${name.slice(1)}`,
  versions: [{
    version,
    protocol: 1,
    releases: { "darwin-arm64": { url: `file:///releases/${version}.tar.gz`, sha256: "b".repeat(64) } },
  }],
});

function fixture() {
  const ids = [...new Set(plan.additionalPluginRevocations.map(({ id }) => id))];
  const plugins = ids.map((id) => entry(id, plan.additionalPluginRevocations.filter((item) => item.id === id).map(({ version }) => pluginVersion(version))));
  const candidatePlugins = plan.replacementPlugins.map(({ id, version }) => entry(id, [pluginVersion(version, "^0.0.21")]));
  const sidecars = plan.replacementSidecars.map(({ name }) => sidecarEntry(name, "0.0.4"));
  const candidateSidecars = plan.replacementSidecars.map(({ name, version }) => sidecarEntry(name, version));
  const revoked = { plugins: [{ id: "editor", version: "0.0.1", reason: "Existing revocation." }], sidecars: [] };
  const core = { versions: ["0.0.9", "0.0.10", "0.0.11"].map((version) => ({ version, releases: {} })) };
  return {
    base: { plugins, sidecars, packs: [{ name: "starter", description: "Starter", plugins: ids }], core, revoked },
    additions: { plugins: candidatePlugins, sidecars: candidateSidecars },
    expectedRevoked: revoked.plugins.length + plan.additionalPluginRevocations.length,
  };
}

function writeJson(path, value) {
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function commitFixture(root) {
  execFileSync("git", ["-C", root, "init", "-q"]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "-c", "user.name=Registry Fixture", "-c", "user.email=registry-fixture@example.invalid", "commit", "--quiet", "-m", "fixture"]);
  return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

test("candidate projection appends only declared components and revocations while preserving the core baseline", { timeout: 10_000 }, () => {
  const { base, additions, expectedRevoked } = fixture();
  const projected = projectCandidateDeclarations({ base, additions, plan });

  assert.deepEqual(projected.core, base.core);
  assert.deepEqual(projected.revoked.plugins.slice(0, base.revoked.plugins.length), base.revoked.plugins);
  assert.equal(projected.revoked.plugins.length, expectedRevoked);
  assert.equal(projected.core.versions.some(({ version }) => version === plan.candidateCore.version), false);
  for (const expected of plan.replacementPlugins) {
    const actual = projected.plugins.find(({ id }) => id === expected.id);
    assert.ok(actual.versions.some(({ version }) => version === expected.version), `${expected.id}@${expected.version}`);
  }
  for (const expected of plan.replacementSidecars) {
    const actual = projected.sidecars.find(({ name }) => name === expected.name);
    assert.ok(actual.versions.some(({ version }) => version === expected.version), `${expected.name}@${expected.version}`);
  }
  assert.deepEqual(projected.revoked.plugins.slice(base.revoked.plugins.length), plan.additionalPluginRevocations);
});

test("candidate projection preserves the optional core revocation member exactly", { timeout: 10_000 }, () => {
  const { base, additions } = fixture();
  const projectedWithoutCore = projectCandidateDeclarations({ base, additions, plan });
  assert.equal(Object.hasOwn(projectedWithoutCore.revoked, "core"), false);

  const withCore = structuredClone(base);
  withCore.revoked.core = [{ version: "0.0.8", reason: "Existing core revocation." }];
  const projectedWithCore = projectCandidateDeclarations({ base: withCore, additions, plan });
  assert.deepEqual(projectedWithCore.revoked.core, withCore.revoked.core);
});

test("candidate proof accepts the index builder's omitted empty core revocations but preserves nonempty entries", { timeout: 10_000 }, () => {
  const { base, additions } = fixture();
  const baseWithEmptyCore = structuredClone(base);
  baseWithEmptyCore.revoked.core = [];
  const declarations = projectCandidateDeclarations({ base: baseWithEmptyCore, additions, plan });
  const index = { ...declarations, format: 1, revoked: structuredClone(declarations.revoked) };
  delete index.revoked.core;
  const indexBytes = Buffer.from(`${JSON.stringify(index)}\n`);
  const rejectedVersions = plan.additionalPluginRevocations.map(({ id, version }) => ({ id, version, field: "surface module" }));
  const proofInput = {
    plan,
    registrySourceRevision: "1".repeat(40),
    sdkIdentity: {
      sourceRevision: plan.candidateCore.sourceRevision,
      apiVersion: plan.candidateCore.apiVersion,
      apiTree: plan.candidateCore.apiTree,
    },
    indexBytes,
    coreBytes: Buffer.from(`${JSON.stringify(baseWithEmptyCore.core, null, 2)}\n`),
    index,
    base: baseWithEmptyCore,
    declarations,
    rejectedVersions,
    candidateManifestChecked: plan.replacementPlugins.length,
  };

  const proof = createCandidateProof(proofInput);
  assert.deepEqual(proof.preservedRevocations, baseWithEmptyCore.revoked);

  const baseWithCoreRevocation = structuredClone(baseWithEmptyCore);
  baseWithCoreRevocation.revoked.core = [{ version: "0.0.8", reason: "Existing core revocation." }];
  const nonemptyDeclarations = projectCandidateDeclarations({ base: baseWithCoreRevocation, additions, plan });
  const nonemptyIndex = { ...nonemptyDeclarations, format: 1, revoked: { ...nonemptyDeclarations.revoked } };
  delete nonemptyIndex.revoked.core;
  assert.throws(
    () => createCandidateProof({
      ...proofInput,
      index: nonemptyIndex,
      declarations: nonemptyDeclarations,
      base: baseWithCoreRevocation,
      coreBytes: Buffer.from(`${JSON.stringify(baseWithCoreRevocation.core, null, 2)}\n`),
    }),
    /candidate index changes the revocation declarations/,
  );
});

test("candidate projection refuses a component version that differs from the declaration", { timeout: 10_000 }, () => {
  const { base, additions } = fixture();
  additions.plugins[0].versions[0].version = "9.9.9";
  assert.throws(
    () => projectCandidateDeclarations({ base, additions, plan }),
    /candidate plugins browser version 9\.9\.9 differs from declared 0\.0\.7/,
  );
});

test("candidate proof binds the source core set, SDK, revocation delta and exact index bytes", { timeout: 10_000 }, () => {
  const { base, additions } = fixture();
  const declarations = projectCandidateDeclarations({ base, additions, plan });
  const index = { ...declarations, format: 1 };
  const indexBytes = Buffer.from(`${JSON.stringify(index)}\n`);
  const rejectedVersions = plan.additionalPluginRevocations.map(({ id, version }) => ({ id, version, field: "surface module" }));
  const proof = createCandidateProof({
    plan,
    registrySourceRevision: "1".repeat(40),
    sdkIdentity: {
      sourceRevision: plan.candidateCore.sourceRevision,
      apiVersion: plan.candidateCore.apiVersion,
      apiTree: plan.candidateCore.apiTree,
    },
    indexBytes,
    coreBytes: Buffer.from(`${JSON.stringify(base.core, null, 2)}\n`),
    index,
    base,
    declarations,
    rejectedVersions,
    candidateManifestChecked: plan.replacementPlugins.length,
  });

  assert.equal(proof.indexSha256.length, 64);
  assert.equal(proof.indexSha256, createHash("sha256").update(indexBytes).digest("hex"));
  assert.deepEqual(proof.preservedCoreVersions, ["0.0.9", "0.0.10", "0.0.11"]);
  assert.equal(proof.preservedCoreVersions.includes(plan.candidateCore.version), false);
  assert.deepEqual(proof.preservedRevocations, base.revoked);
  assert.deepEqual(proof.additionalPluginRevocations, plan.additionalPluginRevocations);
  assert.equal(proof.candidateManifestChecked, 5);
  assert.throws(
    () => createCandidateProof({
      plan,
      registrySourceRevision: "1".repeat(40),
      sdkIdentity: {
        sourceRevision: plan.candidateCore.sourceRevision,
        apiVersion: plan.candidateCore.apiVersion,
        apiTree: plan.candidateCore.apiTree,
      },
      indexBytes,
      coreBytes: Buffer.from(`${JSON.stringify(base.core, null, 2)}\n`),
      index,
      base,
      declarations,
      rejectedVersions,
      candidateManifestChecked: plan.replacementPlugins.length + 1,
    }),
    /candidate manifest check must verify exactly the replacement plugin projection/,
  );
  const emptyReplacementPlan = structuredClone(plan);
  emptyReplacementPlan.replacementPlugins = [];
  assert.throws(
    () => createCandidateProof({
      plan: emptyReplacementPlan,
      registrySourceRevision: "1".repeat(40),
      sdkIdentity: {
        sourceRevision: emptyReplacementPlan.candidateCore.sourceRevision,
        apiVersion: emptyReplacementPlan.candidateCore.apiVersion,
        apiTree: emptyReplacementPlan.candidateCore.apiTree,
      },
      indexBytes,
      coreBytes: Buffer.from(`${JSON.stringify(base.core, null, 2)}\n`),
      index,
      base,
      declarations,
      rejectedVersions,
      candidateManifestChecked: 0,
    }),
    /replacement plugin projection must not be empty/,
  );
  const changed = { ...index, core: { versions: [...index.core.versions, { version: plan.candidateCore.version, releases: {} }] } };
  assert.throws(
    () => createCandidateProof({
      plan,
      registrySourceRevision: "1".repeat(40),
      sdkIdentity: { sourceRevision: plan.candidateCore.sourceRevision, apiVersion: plan.candidateCore.apiVersion, apiTree: plan.candidateCore.apiTree },
      indexBytes,
      coreBytes: Buffer.from("{}\n"),
      index: changed,
      base,
      declarations,
      rejectedVersions,
      candidateManifestChecked: 5,
    }),
    /candidate index changes the current core entry set/,
  );
});

test("candidate proof rejects an empty replacement projection even when zero plugin versions were checked", { timeout: 10_000 }, () => {
  const { base, additions } = fixture();
  const emptyPlan = structuredClone(plan);
  emptyPlan.replacementPlugins = [];
  const declarations = projectCandidateDeclarations({ base, additions, plan });
  const index = { ...declarations, format: 1 };
  const indexBytes = Buffer.from(`${JSON.stringify(index)}\n`);
  const rejectedVersions = emptyPlan.additionalPluginRevocations.map(({ id, version }) => ({ id, version, field: "surface module" }));

  assert.throws(
    () => createCandidateProof({
      plan: emptyPlan,
      registrySourceRevision: "1".repeat(40),
      sdkIdentity: {
        sourceRevision: emptyPlan.candidateCore.sourceRevision,
        apiVersion: emptyPlan.candidateCore.apiVersion,
        apiTree: emptyPlan.candidateCore.apiTree,
      },
      indexBytes,
      coreBytes: Buffer.from(`${JSON.stringify(base.core, null, 2)}\n`),
      index,
      base,
      declarations,
      rejectedVersions,
      candidateManifestChecked: 0,
    }),
    /replacement plugin projection must not be empty/,
  );
});

test("candidate release uses registry build, checks both manifest projections and writes a private proof", { timeout: 10_000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), "soksak-candidate-release-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const registryDir = join(root, "registry");
  const candidateEntriesDir = join(root, "candidate-entries");
  const coreSourceDir = join(root, "core");
  const apiDir = join(coreSourceDir, "packages", "plugin-api");
  const outputDir = join(root, "private-output");
  const { base, additions } = fixture();
  for (const folder of ["plugins", "sidecars", "packs"]) {
    for (const item of base[folder]) {
      const key = folder === "plugins" ? item.id : folder === "sidecars" ? item.name.slice(1).replace("/", "-") : item.name;
      writeJson(join(registryDir, folder, `${key}.json`), item);
    }
  }
  writeJson(join(registryDir, "core.json"), base.core);
  writeJson(join(registryDir, "revoked.json"), base.revoked);
  for (const folder of ["plugins", "sidecars"]) {
    for (const item of additions[folder]) {
      const key = folder === "plugins" ? item.id : item.name.slice(1).replace("/", "-");
      writeJson(join(candidateEntriesDir, folder, `${key}.json`), item);
    }
  }
  const registrySourceRevision = commitFixture(registryDir);
  writeJson(join(apiDir, "package.json"), { name: "@soksak/plugin-api", version: plan.candidateCore.apiVersion, exports: { ".": "./index.mjs" } });
  writeFileSync(join(apiDir, "index.mjs"), "export {};\n");
  const candidateCoreRevision = commitFixture(coreSourceDir);
  const candidateApiTree = execFileSync("git", ["-C", coreSourceDir, "rev-parse", `${candidateCoreRevision}:packages/plugin-api`], { encoding: "utf8" }).trim();
  const testPlan = structuredClone(plan);
  testPlan.candidateCore.sourceRevision = candidateCoreRevision;
  testPlan.candidateCore.apiTree = candidateApiTree;
  const manifestChecks = [];

  const result = await buildCandidateRelease({
    registryDir,
    candidateEntriesDir,
    coreSourceDir,
    apiDir,
    sok: "fixture-sok",
    outDir: outputDir,
    plan: testPlan,
    runSok: (binary, args) => {
      assert.equal(binary, "fixture-sok");
      assert.deepEqual(args.slice(0, 2), ["registry", "build"]);
      const directory = args[2];
      const declarations = {};
      for (const folder of ["plugins", "sidecars", "packs"]) {
        declarations[folder] = readdirSync(join(directory, folder)).filter((file) => file.endsWith(".json")).map((file) => JSON.parse(readFileSync(join(directory, folder, file), "utf8")));
      }
      declarations.core = JSON.parse(readFileSync(join(directory, "core.json"), "utf8"));
      declarations.revoked = JSON.parse(readFileSync(join(directory, "revoked.json"), "utf8"));
      const index = {
        format: 1,
        plugins: declarations.plugins,
        sidecars: declarations.sidecars,
        packs: declarations.packs,
        core: declarations.core,
        revoked: declarations.revoked,
      };
      writeJson(join(directory, "index.json"), index);
    },
    checkManifest: async (index, options) => {
      manifestChecks.push({ revoked: index.revoked.plugins.length, options });
      if (index.revoked.plugins.length === base.revoked.plugins.length) {
        return {
          checked: plan.additionalPluginRevocations.length + plan.replacementPlugins.length,
          errors: plan.additionalPluginRevocations.map(({ id, version }) => `plugin ${id} ${version}: plugin ${id}: surface module is removed; fixture`),
        };
      }
      return { checked: plan.replacementPlugins.length, errors: [] };
    },
  });

  assert.equal(existsSync(result.index), true);
  assert.equal(existsSync(result.proof), true);
  assert.equal(result.proofValue.registrySourceRevision, registrySourceRevision);
  assert.equal(result.proofValue.candidateSdk.sourceRevision, candidateCoreRevision);
  assert.equal(result.proofValue.candidateManifestChecked, plan.replacementPlugins.length);
  assert.equal(manifestChecks.length, 2);
  assert.deepEqual(manifestChecks.map(({ revoked }) => revoked), [base.revoked.plugins.length, base.revoked.plugins.length + plan.additionalPluginRevocations.length]);
  assert.equal(result.proofValue.indexSha256, createHash("sha256").update(readFileSync(result.index)).digest("hex"));
  const generatedIndex = JSON.parse(readFileSync(result.index, "utf8"));
  assert.deepEqual(generatedIndex.revoked, {
    ...base.revoked,
    plugins: [...base.revoked.plugins, ...plan.additionalPluginRevocations],
  });

  writeFileSync(join(apiDir, "index.mjs"), "export const changedAfterCandidateCommit = true;\n");
  const laterCoreRevision = commitFixture(coreSourceDir);
  assert.notEqual(laterCoreRevision, candidateCoreRevision);
  await assert.rejects(
    buildCandidateRelease({
      registryDir,
      candidateEntriesDir,
      coreSourceDir,
      apiDir,
      sok: "fixture-sok",
      outDir: join(root, "stale-sdk-output"),
      plan: testPlan,
      runSok: (binary, args) => {
        const directory = args[2];
        const read = (name) => readdirSync(join(directory, name)).filter((file) => file.endsWith(".json")).map((file) => JSON.parse(readFileSync(join(directory, name, file), "utf8")));
        writeJson(join(directory, "index.json"), {
          format: 1,
          plugins: read("plugins"),
          sidecars: read("sidecars"),
          packs: read("packs"),
          core: JSON.parse(readFileSync(join(directory, "core.json"), "utf8")),
          revoked: JSON.parse(readFileSync(join(directory, "revoked.json"), "utf8")),
        });
      },
      checkManifest: async (candidateIndex) => candidateIndex.revoked.plugins.length === base.revoked.plugins.length
        ? {
          checked: plan.additionalPluginRevocations.length + plan.replacementPlugins.length,
          errors: plan.additionalPluginRevocations.map(({ id, version }) => `plugin ${id} ${version}: plugin ${id}: surface module is removed; fixture`),
        }
        : { checked: plan.replacementPlugins.length, errors: [] },
    }),
    /current SDK API tree differs from candidate-release.json/,
  );
});
