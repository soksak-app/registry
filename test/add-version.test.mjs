// component release 의 version 을 항목에 더하는 scripts/add-version.mjs 를 검사한다. 쓴 항목은 같은 규칙을 검사하는
// scripts/validate.mjs 의 checkEntry 를 통과해야 한다.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addCore, addPlugin, addSidecar, githubRepository } from "../scripts/add-version.mjs";
import { checkCore, checkEntry } from "../scripts/validate.mjs";

function folder(t) {
  const root = mkdtempSync(join(tmpdir(), "soksak-add-version-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, value) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), typeof value === "string" ? value : JSON.stringify(value));
  };
  return { root, write };
}

const sha = (text) => createHash("sha256").update(text).digest("hex");

test("a plugin release records the sidecar ranges of its plugin.json dependencies", (t) => {
  const { root, write } = folder(t);
  write("plugin/package.json", { name: "@soksak/plugin-terminal", version: "0.0.3", description: "Terminal.", license: "MIT",
    repository: { url: "git+https://github.com/soksak-app/plugin-terminal.git" }, engines: { soksak: "^0.0.3" } });
  write("plugin/plugin.json", { id: "terminal", name: "터미널", dependencies: { "@soksak/sidecar-vt-alacritty": "^0.0.3" } });
  write("dist/terminal-0.0.3.tgz", "archive");
  const entry = JSON.parse(readFileSync(addPlugin(join(root, "registry"), join(root, "plugin"), join(root, "dist/terminal-0.0.3.tgz")), "utf8"));
  assert.deepEqual(entry.versions[0].sidecars, { "@soksak/sidecar-vt-alacritty": "^0.0.3" });
});

test("a plugin release adds its version with the release asset of its repository", (t) => {
  const { root, write } = folder(t);
  write("plugin/package.json", { name: "@soksak/plugin-browser", version: "0.0.3", description: "Browser.", license: "MIT",
    repository: { url: "git+https://github.com/soksak-app/plugin-browser.git" }, engines: { soksak: "^0.0.3" } });
  write("plugin/plugin.json", { id: "browser", name: "브라우저" });
  write("dist/browser-0.0.3.tgz", "archive");
  const path = addPlugin(join(root, "registry"), join(root, "plugin"), join(root, "dist/browser-0.0.3.tgz"));
  const entry = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(entry, {
    id: "browser", package: "@soksak/plugin-browser", name: "브라우저", description: "Browser.", license: "MIT",
    repository: "https://github.com/soksak-app/plugin-browser",
    versions: [{
      version: "0.0.3",
      release: { url: "https://github.com/soksak-app/plugin-browser/releases/download/v0.0.3/browser-0.0.3.tgz", sha256: sha("archive") },
      engines: { soksak: "^0.0.3" }, sidecars: {},
    }],
  });
  assert.deepEqual(checkEntry("plugins/browser.json", entry), []);
  assert.throws(() => addPlugin(join(root, "registry"), join(root, "plugin"), join(root, "dist/browser-0.0.3.tgz")), /version 0\.0\.3 is already published/);
  write("dist/other.tgz", "archive");
  assert.throws(() => addPlugin(join(root, "registry"), join(root, "plugin"), join(root, "dist/other.tgz")), /must be named browser-0\.0\.3\.tgz/);
});

test("a sidecar release adds its version with an asset per platform", (t) => {
  const { root, write } = folder(t);
  write("sidecar/package.json", { name: "@soksak/sidecar-vt-alacritty", version: "0.0.3",
    repository: { url: "git+https://github.com/soksak-app/sidecar-vt.git", directory: "vt-alacritty" } });
  write("sidecar/sidecar.json", { executable: "build/x", protocol: 1 });
  write("dist/soksak-sidecar-vt-alacritty-0.0.3-darwin-arm64.tar.gz", "mac");
  const path = addSidecar(join(root, "registry"), join(root, "sidecar"),
    { "darwin-arm64": join(root, "dist/soksak-sidecar-vt-alacritty-0.0.3-darwin-arm64.tar.gz") });
  const entry = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(path, join(root, "registry/sidecars/soksak-sidecar-vt-alacritty.json"));
  assert.deepEqual(entry.versions, [{ version: "0.0.3", protocol: 1, releases: { "darwin-arm64": {
    url: "https://github.com/soksak-app/sidecar-vt/releases/download/v0.0.3/soksak-sidecar-vt-alacritty-0.0.3-darwin-arm64.tar.gz", sha256: sha("mac") } } }]);
  assert.deepEqual(checkEntry("sidecars/soksak-sidecar-vt-alacritty.json", entry), []);
  assert.throws(() => addSidecar(join(root, "registry"), join(root, "sidecar"), {}), /at least one --asset/);
});

test("a repository outside GitHub is refused", () => {
  assert.equal(githubRepository({ repository: "https://github.com/alice/plugin-probe" }), "https://github.com/alice/plugin-probe");
  assert.throws(() => githubRepository({ repository: { url: "https://example.invalid/alice/probe.git" } }), /must be a GitHub repository/);
});

test("a core release adds its version with the application zip of each platform and host", (t) => {
  const { root, write } = folder(t);
  write("dist/soksak-0.0.9-darwin-arm64-wailsv3.zip", "wails bundle");
  write("dist/soksak-0.0.9-darwin-arm64-tauriv2.zip", "tauri bundle");
  const releases = {
    "darwin-arm64-tauriv2": join(root, "dist/soksak-0.0.9-darwin-arm64-tauriv2.zip"),
    "darwin-arm64-wailsv3": join(root, "dist/soksak-0.0.9-darwin-arm64-wailsv3.zip"),
  };
  const path = addCore(join(root, "registry"), "0.0.9", releases);
  const core = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(path, join(root, "registry", "core.json"));
  assert.deepEqual(core, { versions: [{ version: "0.0.9", releases: {
    "darwin-arm64-tauriv2": { url: "https://github.com/soksak-app/core/releases/download/v0.0.9/soksak-0.0.9-darwin-arm64-tauriv2.zip", sha256: sha("tauri bundle") },
    "darwin-arm64-wailsv3": { url: "https://github.com/soksak-app/core/releases/download/v0.0.9/soksak-0.0.9-darwin-arm64-wailsv3.zip", sha256: sha("wails bundle") },
  } }] });
  assert.deepEqual(checkCore(core), []);
  // A second version is added after the first, and a version that is listed is not added again.
  write("dist/soksak-0.0.10-darwin-arm64-wailsv3.zip", "newer");
  addCore(join(root, "registry"), "0.0.10", { "darwin-arm64-wailsv3": join(root, "dist/soksak-0.0.10-darwin-arm64-wailsv3.zip") });
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")).versions.map((item) => item.version), ["0.0.9", "0.0.10"]);
  assert.throws(() => addCore(join(root, "registry"), "0.0.9", releases), /core version 0.0.9 is already listed/);
});

test("a core release archive that does not carry its name is refused", (t) => {
  const { root, write } = folder(t);
  write("dist/bundle.zip", "bundle");
  assert.throws(() => addCore(join(root, "registry"), "0.0.9", { "darwin-arm64-wailsv3": join(root, "dist/bundle.zip") }),
    /the darwin-arm64-wailsv3 archive must be named soksak-0.0.9-darwin-arm64-wailsv3.zip/);
});
