import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { laterCoreErrors, listedCoreErrors, releaseSdkLoader, selectedVersions } from "../scripts/check-listed-cores.mjs";
import { pathToFileURL } from "node:url";

// A plugin release is the pnpm pack file of the plugin: a gzip tar with plugin.json under package/.
function release(manifest) {
  const folder = mkdtempSync(join(tmpdir(), "listed-cores-release-"));
  try {
    mkdirSync(join(folder, "package"));
    writeFileSync(join(folder, "package", "plugin.json"), JSON.stringify(manifest));
    execFileSync("tar", ["-czf", join(folder, "plugin.tgz"), "-C", folder, "package/plugin.json"]);
    return readFileSync(join(folder, "plugin.tgz"));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const releases = new Map();
function version(id, number, range, form) {
  const url = `https://example.invalid/${id}-${number}.tgz`;
  const bytes = release({ id, version: number, form });
  releases.set(url, bytes);
  return { version: number, release: { url, sha256: createHash("sha256").update(bytes).digest("hex") }, engines: { soksak: range } };
}

// A range is ">=X" or "*"; an SDK of core X accepts the manifest form that it names.
const atLeast = (range, core) => range === "*" || (range.startsWith(">=") && compare(core, range.slice(2)) >= 0);
const compare = (a, b) => a.split(".").map(Number).reduce((order, part, at) => order || part - b.split(".").map(Number)[at], 0);
function sdk(core, form) {
  return {
    version: core,
    rangeContains: atLeast,
    validateManifest(manifest) {
      if (manifest.form !== form) throw new Error(`core ${core} rejects the ${manifest.form} form`);
    },
  };
}

const index = {
  plugins: [
    { id: "editor", versions: [version("editor", "0.0.4", ">=0.0.18", "old"), version("editor", "0.0.7", ">=0.0.21", "new")] },
    { id: "files", versions: [version("files", "0.0.6", "*", "old")] },
    { id: "hwp", versions: [version("hwp", "0.0.2", ">=0.0.18", "old"), version("hwp", "0.0.9", ">=0.0.30", "new")] },
  ],
  core: { versions: [{ version: "0.0.20" }, { version: "0.0.21" }, { version: "0.0.19" }] },
  revoked: { plugins: [], sidecars: [], core: [{ version: "0.0.19", reason: "withdrawn" }] },
};
const sdks = { "0.0.20": sdk("0.0.20", "old"), "0.0.21": sdk("0.0.21", "new") };
const fetchRelease = async (url) => releases.get(url);

test("installation selects for a core version the newest unrevoked plugin version whose range contains it", { timeout: 5000 }, () => {
  const selected = (core) => Object.fromEntries([...selectedVersions(index, core, atLeast)].map(([id, entry]) => [id, entry.version]));
  assert.deepEqual(selected("0.0.20"), { editor: "0.0.4", files: "0.0.6", hwp: "0.0.2" });
  // hwp 0.0.9 is newer but its range excludes 0.0.21, so 0.0.2 is the version that 0.0.21 installs.
  assert.deepEqual(selected("0.0.21"), { editor: "0.0.7", files: "0.0.6", hwp: "0.0.2" });
  const revoked = { ...index, revoked: { ...index.revoked, plugins: [{ id: "editor", version: "0.0.7", reason: "r" }] } };
  assert.equal(selectedVersions(revoked, "0.0.21", atLeast).get("editor").version, "0.0.4");
});

test("each listed core version is checked with its own SDK against the plugin versions that it installs", { timeout: 5000 }, async () => {
  const loaded = [];
  const { checked, errors } = await listedCoreErrors(index, async (core) => { loaded.push(core); return sdks[core]; }, fetchRelease);
  // The revoked core 0.0.19 is not checked; 0.0.20 accepts its three versions; 0.0.21 rejects the old forms that it selects.
  assert.deepEqual(loaded, ["0.0.20", "0.0.21"]);
  assert.equal(checked, 6);
  assert.deepEqual(errors, [
    "core 0.0.21: plugin files 0.0.6: core 0.0.21 rejects the old form",
    "core 0.0.21: plugin hwp 0.0.2: core 0.0.21 rejects the old form",
  ]);
});

test("an SDK whose version differs from the listed core, or a release whose bytes differ from the index, is an error", { timeout: 5000 }, async () => {
  await assert.rejects(listedCoreErrors(index, async () => sdk("0.0.18", "old"), fetchRelease),
    /the SDK of core 0\.0\.20 reports version 0\.0\.18/);
  const { errors } = await listedCoreErrors(index, async (core) => sdks[core], async () => Buffer.from("other"));
  assert.match(errors[0], /^core 0\.0\.20: plugin editor 0\.0\.4: release sha256 [0-9a-f]{64} differs from the index/);
});

test("an unrevoked plugin version whose range contains a core newer than the newest listed core is an error", { timeout: 5000 }, () => {
  // 0.0.21 is the newest listed core that is not withdrawn; each range is probed with 0.0.22, 0.1.0 and 1.0.0.
  assert.deepEqual(laterCoreErrors(index, atLeast), [
    "plugin editor 0.0.4: range >=0.0.18 contains core 0.0.22, newer than the newest listed core 0.0.21",
    "plugin editor 0.0.7: range >=0.0.21 contains core 0.0.22, newer than the newest listed core 0.0.21",
    "plugin files 0.0.6: range * contains core 0.0.22, newer than the newest listed core 0.0.21",
    "plugin hwp 0.0.2: range >=0.0.18 contains core 0.0.22, newer than the newest listed core 0.0.21",
    "plugin hwp 0.0.9: range >=0.0.30 contains core 0.1.0, newer than the newest listed core 0.0.21",
  ]);
  // A closed range and a revoked version are no error.
  const exact = (range, core) => range === `^${core}`;
  const closed = { ...index, plugins: [{ id: "editor", versions: [version("editor", "0.0.8", "^0.0.21", "new"), version("editor", "0.0.4", ">=0.0.18", "old")] }],
    revoked: { ...index.revoked, plugins: [{ id: "editor", version: "0.0.4", reason: "r" }] } };
  assert.deepEqual(laterCoreErrors(closed, (range, core) => exact(range, core) || atLeast(range, core)), []);
});

test("the SDK of a listed core is the plugin API release file of that core release", { timeout: 10000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), "listed-cores-sdk-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // The release file of core 0.0.26 is the pnpm pack file of packages/plugin-api: package/package.json names its entry.
  mkdirSync(join(root, "package"));
  writeFileSync(join(root, "package", "package.json"), JSON.stringify({ name: "@soksak/plugin-api", version: "0.0.26", type: "module", exports: { ".": "./index.js" } }));
  writeFileSync(join(root, "package", "index.js"), "export const rangeContains = () => true;\nexport function validateManifest() {}\n");
  mkdirSync(join(root, "v0.0.26"));
  execFileSync("tar", ["-czf", join(root, "v0.0.26", "soksak-plugin-api-0.0.26.tgz"), "-C", root, "package"]);
  const load = releaseSdkLoader(pathToFileURL(root).href, join(root, "out"));
  const sdk = await load("0.0.26");
  assert.equal(sdk.version, "0.0.26");
  assert.equal(sdk.rangeContains("^0.0.26", "0.0.26"), true);
  await assert.rejects(load("0.0.27"), /soksak-plugin-api-0\.0\.27\.tgz/);
});

test("the pull request check and the publication take sok and the SDK from core releases, not from a core checkout", { timeout: 5000 }, () => {
  for (const workflow of ["validate.yml", "publish.yml"]) {
    const text = readFileSync(new URL(`../.github/workflows/${workflow}`, import.meta.url), "utf8");
    assert.match(text, /scripts\/check-listed-cores\.mjs --index \S+ --releases https:\/\/github\.com\/soksak-app\/core\/releases\/download/, `${workflow} runs no listed core check on the core releases`);
    assert.match(text, /gh release download "\$CORE_RELEASE" --repo soksak-app\/core/, `${workflow} takes no sok from a core release`);
    assert.doesNotMatch(text, /repository: soksak-app\/core|go build/, `${workflow} checks out or builds core`);
  }
});
