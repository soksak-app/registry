// pull request 검사(scripts/validate.mjs)를 core docs/spec/registry.md 의 규칙마다 검사한다. GitHub API 와
// `sok registry build` 는 검사가 주는 가짜다.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkCore, validate } from "../scripts/validate.mjs";

const SHA = "a".repeat(64);

function plugin(owner = "alice", repo = "plugin-probe", versions = ["0.1.0"]) {
  return {
    id: "probe", package: "@alice/plugin-probe", name: "Probe", description: "Probe.", license: "MIT",
    repository: `https://github.com/${owner}/${repo}`,
    versions: versions.map((version) => ({
      version, release: { url: `https://github.com/${owner}/${repo}/releases/download/v${version}/probe-${version}.tgz`, sha256: SHA },
      engines: { soksak: "^0.0.3" }, sidecars: {},
    })),
  };
}

function sidecar(owner = "acme", repo = "sidecar-worker") {
  return {
    name: "@acme/sidecar-worker", repository: `https://github.com/${owner}/${repo}`,
    versions: [{ version: "0.1.0", protocol: 1, releases: {
      "darwin-arm64": { url: `https://github.com/${owner}/${repo}/releases/download/v0.1.0/acme-sidecar-worker-0.1.0-darwin-arm64.tar.gz`, sha256: SHA },
    } }],
  };
}

/** base 와 head registry. files 는 경로마다 값이며 null 은 파일이 없다는 뜻이다. */
function registries(t, baseFiles, headFiles) {
  const root = mkdtempSync(join(tmpdir(), "soksak-registry-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (dir, filesByPath) => {
    for (const [path, value] of Object.entries({ "revoked.json": { plugins: [], sidecars: [] }, ...filesByPath })) {
      if (value === null) continue;
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
    }
  };
  write(join(root, "base"), baseFiles);
  write(join(root, "head"), { ...baseFiles, ...headFiles });
  return { base: join(root, "base"), head: join(root, "head") };
}

/** alice 는 사용자이고 acme 는 alice 가 공개 member 인 조직이다. */
const github = {
  async accountType(owner) { return owner === "acme" ? "Organization" : "User"; },
  async isPublicMember(org, user) { return org === "acme" && user === "alice"; },
};

async function check(t, baseFiles, headFiles, author = "alice") {
  const dirs = registries(t, baseFiles, headFiles);
  const built = [];
  const errors = await validate({ ...dirs, author, github, build: (dir) => {
    const entry = readFileSync(join(dir, "plugins/probe.json"), "utf8");
    built.push(entry);
    writeFileSync(join(dir, "index.json"), JSON.stringify({
      plugins: [JSON.parse(entry)], revoked: { plugins: [], sidecars: [] },
    }));
  } });
  return { errors, built };
}

function pluginRelease(t, manifest) {
  const root = mkdtempSync(join(tmpdir(), "soksak-registry-plugin-release-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const manifestPath = join(root, "plugin.json");
  const archivePath = join(root, "probe-0.1.0.tgz");
  writeFileSync(manifestPath, JSON.stringify(manifest));
  execFileSync("tar", ["-czf", archivePath, "-C", root, "plugin.json"]);
  const bytes = readFileSync(archivePath);
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

test("an owner adds a plugin entry and the whole registry is built", async (t) => {
  const { errors, built } = await check(t, {}, { "plugins/probe.json": plugin() });
  assert.deepEqual(errors, []);
  assert.equal(built.length, 1);
});

test("a public member of the owning organization adds a sidecar entry", async (t) => {
  const { errors } = await check(t, { "plugins/probe.json": plugin() }, { "sidecars/acme-sidecar-worker.json": sidecar() });
  assert.deepEqual(errors, []);
});

test("an author who does not own the repository is refused", async (t) => {
  const { errors, built } = await check(t, {}, { "plugins/probe.json": plugin("bob") }, "mallory");
  assert.deepEqual(errors, ["plugins/probe.json: mallory does not own https://github.com/bob/plugin-probe (the pull request entry)"]);
  assert.equal(built.length, 0);
});

test("an entry cannot move to a repository of its author", async (t) => {
  const { errors } = await check(t, { "plugins/probe.json": plugin("bob") }, { "plugins/probe.json": plugin("alice") });
  assert.ok(errors.includes("plugins/probe.json: alice does not own https://github.com/bob/plugin-probe (the base entry)"), errors.join("\n"));
});

test("a release must be published by the entry's repository", async (t) => {
  const entry = plugin();
  entry.versions[0].release.url = "https://example.invalid/probe-0.1.0.tgz";
  const { errors } = await check(t, {}, { "plugins/probe.json": entry });
  assert.deepEqual(errors, ["plugins/probe.json: version 0.1.0: release url must be https://github.com/alice/plugin-probe/releases/download/v0.1.0/probe-0.1.0.tgz"]);
  const other = sidecar();
  other.versions[0].releases["darwin-arm64"].url = other.versions[0].releases["darwin-arm64"].url.replace("acme/sidecar-worker", "acme/other");
  const { errors: sidecarErrors } = await check(t, {}, { "sidecars/acme-sidecar-worker.json": other });
  assert.match(sidecarErrors[0], /^sidecars\/acme-sidecar-worker\.json: version 0\.1\.0 darwin-arm64: url must be https:\/\/github\.com\/acme\/sidecar-worker\/releases/);
});

test("the repository must be a GitHub repository", async (t) => {
  const entry = { ...plugin(), repository: "https://example.invalid/alice/plugin-probe" };
  const { errors } = await check(t, {}, { "plugins/probe.json": entry });
  assert.deepEqual(errors, ["plugins/probe.json: repository must be https://github.com/<owner>/<repo>"]);
});

test("a file name must match its entry", async (t) => {
  const { errors } = await check(t, {}, { "plugins/other.json": plugin() });
  assert.deepEqual(errors, ["plugins/other.json: the file name must be probe.json"]);
});

test("a new version is added and a published version stays as it is", async (t) => {
  const { errors } = await check(t, { "plugins/probe.json": plugin() }, { "plugins/probe.json": plugin("alice", "plugin-probe", ["0.1.0", "0.2.0"]) });
  assert.deepEqual(errors, []);
  const changed = plugin();
  changed.versions[0].release.sha256 = "b".repeat(64);
  const { errors: changedErrors } = await check(t, { "plugins/probe.json": plugin() }, { "plugins/probe.json": changed });
  assert.deepEqual(changedErrors, ["plugins/probe.json: published version 0.1.0 is changed"]);
  const { errors: removedErrors } = await check(t, { "plugins/probe.json": plugin("alice", "plugin-probe", ["0.1.0", "0.2.0"]) }, { "plugins/probe.json": plugin() });
  assert.deepEqual(removedErrors, ["plugins/probe.json: published version 0.2.0 is removed"]);
  const { errors: deletedErrors } = await check(t, { "plugins/probe.json": plugin() }, { "plugins/probe.json": null });
  assert.deepEqual(deletedErrors, ["plugins/probe.json: a published entry is not removed; revoke its versions in revoked.json"]);
});

test("only maintainers change packs, revoked versions and the registry's own files", async (t) => {
  const { errors } = await check(t, {}, {
    "plugins/probe.json": plugin(), "packs/starter.json": { name: "starter", description: "S.", plugins: ["probe"] },
    "revoked.json": { plugins: [{ id: "probe", version: "0.1.0", reason: "r" }], sidecars: [] }, "scripts/validate.mjs": "",
  });
  assert.deepEqual(errors, [
    "packs/starter.json: only registry maintainers change this path",
    "revoked.json: only registry maintainers change this path",
    "scripts/validate.mjs: only registry maintainers change this path",
  ]);
});

test("a file that is not JSON is named", async (t) => {
  const { errors } = await check(t, {}, { "plugins/probe.json": "{" });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^plugins\/probe\.json: not valid JSON: /);
});

test("a failed registry build fails the check with its reason", async (t) => {
  const dirs = registries(t, {}, { "plugins/probe.json": plugin() });
  const errors = await validate({ ...dirs, author: "alice", github, build: () => { throw new Error("sha256 differs"); } });
  assert.deepEqual(errors, ["sok registry build: sha256 differs"]);
});

test("the compatibility check validates the current form and skips revoked or out-of-range releases", { timeout: 10000 }, async (t) => {
  const { registryManifestErrors } = await import("../scripts/check-plugin-manifests.mjs");
  assert.equal(typeof registryManifestErrors, "function");
  const base = {
    id: "probe", name: "Probe", description: "Sample.", mark: "P", icon: "<svg></svg>",
    surface: { composition: { kind: "view", page: "ui/page.html" } },
  };
  const bytes = new Map([
    ["current", pluginRelease(t, base).bytes],
    ["module", pluginRelease(t, { ...base, surface: { ...base.surface, module: "ui/plugin.js" } }).bytes],
    ["state", pluginRelease(t, { ...base, state: {} }).bytes],
    ["old", pluginRelease(t, { ...base, surface: { module: "ui/plugin.js" } }).bytes],
    ["revoked", pluginRelease(t, { ...base, surface: { module: "ui/plugin.js" } }).bytes],
  ]);
  const versions = ["current", "module", "state", "old", "revoked"].map((key, index) => ({
    version: `0.1.${index + 1}`,
    release: { url: key, sha256: createHash("sha256").update(bytes.get(key)).digest("hex") },
    engines: { soksak: key === "old" ? "^0.0.11" : ">=0.0.20" },
    sidecars: {},
  }));
  const index = {
    plugins: [{ id: "probe", versions }],
    revoked: { plugins: [{ id: "probe", version: "0.1.5", reason: "Fixture revocation." }], sidecars: [] },
  };
  const requested = [];
  const result = await registryManifestErrors(index, async (key) => {
    requested.push(key);
    return bytes.get(key);
  });
  assert.equal(result.checked, 3);
  assert.deepEqual(requested.sort(), ["current", "module", "state"]);
  assert.deepEqual(result.errors, [
    "plugin probe 0.1.2: plugin probe: surface module is removed; a surface is a view (docs/spec/plugins.md#view-surfaces)",
    "plugin probe 0.1.3: plugin probe: state is removed; a plugin keeps project data through its host (docs/spec/plugins.md#project-data)",
  ]);
});

test("the GitHub API answers decide the account type and the public membership", async (t) => {
  const { createServer } = await import("node:http");
  const { githubAPI } = await import("../scripts/validate.mjs");
  const server = createServer((request, response) => {
    const answers = {
      "/users/acme": [200, { type: "Organization" }],
      "/orgs/acme/public_members/alice": [204, null],
      "/orgs/acme/public_members/mallory": [404, null],
      "/orgs/acme/public_members/limited": [403, null],
    };
    const [status, body] = answers[request.url] ?? [404, null];
    response.writeHead(status, body ? { "content-type": "application/json" } : {});
    response.end(body ? JSON.stringify(body) : undefined);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const api = `http://127.0.0.1:${server.address().port}`;
  const github = githubAPI(api);
  assert.equal(await github.accountType("acme"), "Organization");
  assert.equal(await github.isPublicMember("acme", "alice"), true);
  assert.equal(await github.isPublicMember("acme", "mallory"), false);
  await assert.rejects(github.isPublicMember("acme", "limited"), new RegExp(`^Error: ${api}/orgs/acme/public_members/limited: HTTP 403$`));
  await assert.rejects(github.accountType("nobody"), new RegExp(`^Error: ${api}/users/nobody: HTTP 404$`));
});

const CORE_URL = (version, key) => `https://github.com/soksak-app/core/releases/download/v${version}/soksak-${version}-${key}.zip`;

test("the core releases follow the release rules of the core repository", () => {
  const good = { versions: [{ version: "0.0.9", releases: { "darwin-arm64-wailsv3": { url: CORE_URL("0.0.9", "darwin-arm64-wailsv3"), sha256: SHA } } }] };
  assert.deepEqual(checkCore(good), []);
  const other = structuredClone(good);
  other.versions[0].releases["darwin-arm64-wailsv3"].url = "https://example.invalid/soksak-0.0.9-darwin-arm64-wailsv3.zip";
  assert.deepEqual(checkCore(other), [`core.json: version 0.0.9 darwin-arm64-wailsv3: url must be ${CORE_URL("0.0.9", "darwin-arm64-wailsv3")}`]);
  const unlisted = structuredClone(good);
  unlisted.versions[0].releases["darwin-arm64-wailsv3"].url = CORE_URL("0.0.9", "darwin-arm64-tauriv2");
  assert.equal(checkCore(unlisted).length, 1);
});

test("core.json is a registry maintainer path and its releases reach the build", async () => {
  const base = mkdtempSync(join(tmpdir(), "soksak-core-base-"));
  const head = mkdtempSync(join(tmpdir(), "soksak-core-head-"));
  try {
    writeFileSync(join(head, "core.json"), JSON.stringify({ versions: [] }));
    const built = [];
    const errors = await validate({ base, head, author: "alice", github: {}, build: (dir) => built.push(readFileSync(join(dir, "core.json"), "utf8")) });
    // A pull request does not change core.json, and the build still gets the file of an unchanged registry.
    assert.deepEqual(errors, ["core.json: only registry maintainers change this path"]);
    writeFileSync(join(base, "core.json"), JSON.stringify({ versions: [] }));
    assert.deepEqual(await validate({ base, head, author: "alice", github: {}, build: (dir) => built.push(readFileSync(join(dir, "core.json"), "utf8")) }), []);
    assert.deepEqual(built, ['{"versions":[]}']);
  } finally {
    rmSync(base, { recursive: true, force: true });
    rmSync(head, { recursive: true, force: true });
  }
});
