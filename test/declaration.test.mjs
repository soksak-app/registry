import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkDeclaration } from "../scripts/build.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));

test("registry.json declares relative plugin and sidecar repositories", () => {
  const declaration = checkDeclaration(read("registry.json"));
  assert.ok(declaration.plugins.length > 0);
  assert.throws(() => checkDeclaration({ ...declaration, plugins: ["/absolute"] }), /relative folders/);
  assert.throws(() => checkDeclaration({ ...declaration, extra: [] }), /expected the keys/);
});

test("the starter pack names only plugins whose repositories the registry declares", () => {
  const starter = read("packs/starter.json");
  assert.equal(starter.name, "starter");
  const declared = read("registry.json").plugins.map((folder) => {
    const manifest = JSON.parse(readFileSync(new URL(`../${folder}/plugin.json`, import.meta.url), "utf8"));
    return manifest.id;
  });
  assert.deepEqual(starter.plugins.filter((id) => !declared.includes(id)), []);
});

test("published entries name the release asset of each component and its sha256", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createHash } = await import("node:crypto");
  const { entries } = await import("../scripts/build.mjs");
  const base = mkdtempSync(join(tmpdir(), "soksak-registry-"));
  try {
    const write = (path, value) => {
      mkdirSync(join(base, path, ".."), { recursive: true });
      writeFileSync(join(base, path), typeof value === "string" ? value : JSON.stringify(value));
    };
    write("registry/registry.json", { plugins: ["../plugins/probe"], sidecars: [{ repository: "../sidecars/worker", folder: "." }] });
    write("plugins/probe/plugin.json", { id: "probe", name: "Probe" });
    write("plugins/probe/package.json", { name: "@scope/plugin-probe", version: "0.0.3", description: "Probe.", license: "MIT",
      repository: { url: "git+https://github.com/owner/plugin-probe.git" }, engines: { soksak: "^0.0.3" },
      soksak: { sidecars: { "@scope/sidecar-worker": "^0.0.3" } } });
    write("sidecars/worker/package.json", { name: "@scope/sidecar-worker", version: "0.0.3",
      repository: { type: "git", url: "git+https://github.com/owner/sidecar-worker.git" } });
    write("sidecars/worker/sidecar.json", { executable: "build/worker", protocol: 1 });
    const bodies = new Map([
      ["https://github.com/owner/plugin-probe/releases/download/v0.0.3/probe-0.0.3.tgz", Buffer.from("plugin")],
      ["https://github.com/owner/sidecar-worker/releases/download/v0.0.3/scope-sidecar-worker-0.0.3-darwin-arm64.tar.gz", Buffer.from("sidecar")],
    ]);
    const requested = [];
    const download = async (url) => {
      requested.push(url);
      if (!bodies.has(url)) throw new Error(`${url}: HTTP 404`);
      return bodies.get(url);
    };
    const sha = (text) => createHash("sha256").update(text).digest("hex");
    await entries(join(base, "registry"), "unused-sok", { download, platforms: ["darwin-arm64"] });
    const plugin = JSON.parse(readFileSync(join(base, "registry/plugins/probe.json"), "utf8"));
    assert.deepEqual(plugin.versions[0].package, {
      url: "https://github.com/owner/plugin-probe/releases/download/v0.0.3/probe-0.0.3.tgz", sha256: sha("plugin"),
    });
    assert.equal(plugin.repository, "git+https://github.com/owner/plugin-probe.git");
    const sidecar = JSON.parse(readFileSync(join(base, "registry/sidecars/scope-sidecar-worker.json"), "utf8"));
    assert.deepEqual(sidecar.versions[0].assets, { "darwin-arm64": {
      url: "https://github.com/owner/sidecar-worker/releases/download/v0.0.3/scope-sidecar-worker-0.0.3-darwin-arm64.tar.gz",
      sha256: sha("sidecar") } });
    assert.deepEqual(requested.sort(), [...bodies.keys()].sort());
    // GitHub 이 아닌 repository 는 release asset 주소를 정할 수 없다.
    write("plugins/probe/package.json", { name: "@scope/plugin-probe", version: "0.0.3", repository: "git+https://example.invalid/probe.git",
      engines: { soksak: "^0.0.3" } });
    await assert.rejects(entries(join(base, "registry"), "unused-sok", { download, platforms: ["darwin-arm64"] }),
      /plugin probe: the repository git\+https:\/\/example\.invalid\/probe\.git is not a GitHub repository/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
