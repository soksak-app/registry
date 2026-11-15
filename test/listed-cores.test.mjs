import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as listedCores from "../scripts/check-listed-cores.mjs";
import { laterCoreErrors, releaseSdkLoader } from "../scripts/check-listed-cores.mjs";
import { pathToFileURL } from "node:url";

// A plugin release is the pnpm pack file of the plugin: a gzip tar with plugin.json under package/, and the other root files
// that the release holds.
function release(manifest, view = "", files = {}) {
  const folder = mkdtempSync(join(tmpdir(), "listed-cores-release-"));
  try {
    mkdirSync(join(folder, "package", "ui"), { recursive: true });
    writeFileSync(join(folder, "package", "plugin.json"), JSON.stringify(manifest));
    writeFileSync(join(folder, "package", "ui", "view.js"), view);
    for (const [name, text] of Object.entries(files)) writeFileSync(join(folder, "package", name), text);
    const members = ["package/plugin.json", "package/ui/view.js", ...Object.keys(files).map((name) => `package/${name}`)];
    execFileSync("tar", ["-czf", join(folder, "plugin.tgz"), "-C", folder, ...members]);
    return readFileSync(join(folder, "plugin.tgz"));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const releases = new Map();
function version(id, number, range, form, view = "", files = {}) {
  const url = `https://example.invalid/${id}-${number}.tgz`;
  const bytes = release({ id, version: number, form }, view, files);
  releases.set(url, bytes);
  return { version: number, release: { url, sha256: createHash("sha256").update(bytes).digest("hex") }, engines: { soksak: range } };
}

// A range is ">=X" or "*".
const atLeast = (range, core) => range === "*" || (range.startsWith(">=") && compare(core, range.slice(2)) >= 0);
const compare = (a, b) => a.split(".").map(Number).reduce((order, part, at) => order || part - b.split(".").map(Number)[at], 0);
const index = {
  plugins: [
    { id: "editor", versions: [version("editor", "0.0.4", ">=0.0.18", "old"), version("editor", "0.0.7", ">=0.0.21", "new")] },
    { id: "files", versions: [version("files", "0.0.6", "*", "old")] },
    { id: "hwp", versions: [version("hwp", "0.0.2", ">=0.0.18", "old"), version("hwp", "0.0.9", ">=0.0.30", "new")] },
  ],
  core: { versions: [{ version: "0.0.20" }, { version: "0.0.21" }, { version: "0.0.19" }] },
  revoked: { plugins: [], sidecars: [], core: [{ version: "0.0.19", reason: "withdrawn" }] },
};
const fetchRelease = async (url) => releases.get(url);
/** A folder for the extracted releases of one test, removed when the test ends. */
function out(t) {
  const folder = mkdtempSync(join(tmpdir(), "listed-cores-out-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  return folder;
}

test("an unrevoked plugin version whose range contains a core newer than the newest listed core is an error", () => {
  // 0.0.21 is the newest listed core that is not withdrawn; each range is probed with 0.0.22, 0.1.0 and 1.0.0.
  assert.deepEqual(laterCoreErrors(index, atLeast), [
    "plugin editor 0.0.4: range >=0.0.18 contains core 0.0.22, newer than the newest listed core 0.0.21",
    "plugin editor 0.0.7: range >=0.0.21 contains core 0.0.22, newer than the newest listed core 0.0.21",
    "plugin files 0.0.6: range * contains core 0.0.22, newer than the newest listed core 0.0.21",
    "plugin hwp 0.0.2: range >=0.0.18 contains core 0.0.22, newer than the newest listed core 0.0.21",
    "plugin hwp 0.0.9: range >=0.0.30 contains core 0.1.0, newer than the newest listed core 0.0.21",
  ]);
  // A caret range of a 0.0 version and a revoked version are no error.
  const closed = { ...index, plugins: [{ id: "editor", versions: [version("editor", "0.0.8", "^0.0.21", "new"), version("editor", "0.0.4", ">=0.0.18", "old")] }],
    revoked: { ...index.revoked, plugins: [{ id: "editor", version: "0.0.4", reason: "r" }] } };
  assert.deepEqual(laterCoreErrors(closed, (range, core) => caret(range, core) || atLeast(range, core)), []);
});

// The caret rule of core: `^0.0.z` is from 0.0.z below 0.1.0, `^0.y.z` (y > 0) below 0.(y+1).0, `^x.y.z` (x > 0) below
// (x+1).0.0.
function caret(range, core) {
  if (!range.startsWith("^")) return false;
  const [x, y] = range.slice(1).split(".").map(Number);
  const below = x > 0 ? `${x + 1}.0.0` : y > 0 ? `0.${y + 1}.0` : "0.1.0";
  return compare(core, range.slice(1)) >= 0 && compare(core, below) < 0;
}

test("a caret range of a 0.0 version admits the later 0.0 cores, and an open range or a caret of a later line does not", () => {
  // 0.0.21 is the newest listed core; a patch release of core is a compatible release, so ^0.0.21 and ^0.0.18 contain 0.0.22
  // by intent, while >=0.0.21 and * contain 0.1.0 and 1.0.0 as well, and ^0.1.0 contains 0.1.0.
  const ranges = { ...index, plugins: [{ id: "editor", versions: [
    version("editor", "0.0.8", "^0.0.21", "new"), version("editor", "0.0.9", "^0.0.18", "new"), version("editor", "0.0.10", "^0.1.0", "new"),
    version("editor", "0.0.11", ">=0.0.21", "new"), version("editor", "0.0.12", "*", "new")] }] };
  assert.deepEqual(laterCoreErrors(ranges, (range, core) => caret(range, core) || atLeast(range, core)), [
    "plugin editor 0.0.10: range ^0.1.0 contains core 0.1.0, newer than the newest listed core 0.0.21",
    "plugin editor 0.0.11: range >=0.0.21 contains core 0.0.22, newer than the newest listed core 0.0.21",
    "plugin editor 0.0.12: range * contains core 0.0.22, newer than the newest listed core 0.0.21",
  ]);
});

// The range rule of an SDK of core: a union `<range> || <range>` contains a core that one of its parts contains.
const union = (range, core) => range.split(" || ").some((one) => caret(one, core) || atLeast(one, core));

test("a 0.0 caret part of a union admits the later 0.0 cores, and another part that contains a later core is an error", () => {
  const unions = { ...index, plugins: [{ id: "editor", versions: [
    version("editor", "0.0.8", "^0.0.18 || ^0.0.21", "new"), version("editor", "0.0.9", "^0.1.0 || >=0.0.21", "new"),
    version("editor", "0.0.10", "^0.0.21 || >=0.0.30", "new"), version("editor", "0.0.11", "^0.0.21 || *", "new")] }] };
  assert.deepEqual(laterCoreErrors(unions, union), [
    "plugin editor 0.0.9: range ^0.1.0 || >=0.0.21 contains core 0.0.22, newer than the newest listed core 0.0.21",
    "plugin editor 0.0.10: range ^0.0.21 || >=0.0.30 contains core 0.1.0, newer than the newest listed core 0.0.21",
    "plugin editor 0.0.11: range ^0.0.21 || * contains core 0.1.0, newer than the newest listed core 0.0.21",
  ]);
});

test("the SDK of a listed core is the plugin API release file of that core release", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "listed-cores-sdk-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // The release file of core 0.0.26 is the pnpm pack file of packages/plugin-api: package/package.json names its entry.
  mkdirSync(join(root, "package"));
  writeFileSync(join(root, "package", "package.json"), JSON.stringify({ name: "@soksak/plugin-api", version: "0.0.26", type: "module", exports: { ".": "./index.js" } }));
  writeFileSync(join(root, "package", "index.js"), "export const rangeContains = () => true;\n");
  mkdirSync(join(root, "v0.0.26"));
  execFileSync("tar", ["-czf", join(root, "v0.0.26", "soksak-plugin-api-0.0.26.tgz"), "-C", root, "package"]);
  const load = releaseSdkLoader(pathToFileURL(root).href, join(root, "out"));
  const sdk = await load("0.0.26");
  assert.equal(sdk.version, "0.0.26");
  assert.equal(sdk.rangeContains("^0.0.26", "0.0.26"), true);
  await assert.rejects(load("0.0.27"), /soksak-plugin-api-0\.0\.27\.tgz/);
});

test("the pull request check and the publication take sok and the SDK from core releases, not from a core checkout", () => {
  for (const workflow of ["validate.yml", "publish.yml"]) {
    const text = readFileSync(new URL(`../.github/workflows/${workflow}`, import.meta.url), "utf8");
    assert.match(text, /scripts\/check-listed-cores\.mjs --index \S+ --releases https:\/\/github\.com\/soksak-app\/core\/releases\/download/, `${workflow} runs no listed core check on the core releases`);
    assert.match(text, /gh release download "\$CORE_RELEASE" --repo soksak-app\/core/, `${workflow} takes no sok from a core release`);
    assert.doesNotMatch(text, /repository: soksak-app\/core|go build/, `${workflow} checks out or builds core`);
  }
});


// A core version enters core.json without a check of the plugins that it installs (core docs/spec/registry.md#check): a plugin
// keeps its own compatibility with a new core, and a listed core refuses a plugin that it does not accept alone.
test("the check of the listed cores reads no plugin release that a listed core installs", () => {
  assert.equal(listedCores.listedCoreErrors, undefined, "the check validates the plugin releases that a listed core installs");
  assert.equal(listedCores.selectedVersions, undefined, "the check selects the plugin releases that a listed core installs");
});
