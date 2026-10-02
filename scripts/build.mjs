#!/usr/bin/env node
// 로컬 registry 를 build 한다(docs/features.md). registry.json 이 이 repository 기준 상대 폴더로 선언한 plugin
// repository 는 자기 `make pack` 으로, sidecar repository 는 자기 `make release` 로 releases/ 에 archive 를 쓴다.
// 그 결과로 plugins/<id>.json 과 sidecars/<file name>.json 을 쓰고 `sok registry build` 로 index.json 을 만든다.
// packs/ 와 revoked.json 은 이 repository 가 관리하는 원본이다. 항목의 url 은 이 컴퓨터의 file: 주소이므로
// 생성한 파일은 commit 하지 않는다.
//
//   node scripts/build.mjs --sok <sok 실행 파일>
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const relative = (value) => typeof value === "string" && value !== "" && !value.startsWith("/");

/** registry.json 을 검사한다. plugins 는 plugin repository 폴더, sidecars 는 {repository, folder} 다. */
export function checkDeclaration(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("registry.json: expected an object");
  if (Object.keys(value).sort().join() !== "plugins,sidecars") throw new Error("registry.json: expected the keys plugins and sidecars");
  if (!Array.isArray(value.plugins) || !value.plugins.every(relative)) throw new Error("registry.json: plugins must be relative folders");
  if (new Set(value.plugins).size !== value.plugins.length) throw new Error("registry.json: a plugin folder is repeated");
  if (!Array.isArray(value.sidecars) || !value.sidecars.every((item) => item && relative(item.repository) && relative(item.folder)
    && Object.keys(item).sort().join() === "folder,repository")) {
    throw new Error("registry.json: sidecars must be { repository, folder } with relative folders");
  }
  return value;
}

/** package.json repository 의 주소. 문자열이거나 { url } 이다. */
function repositoryText(repository) {
  const url = typeof repository === "string" ? repository : repository?.url;
  if (typeof url !== "string" || url === "") throw new Error("package.json repository has no url");
  return url;
}

/** repository 의 make target 을 실행하고 그 출력의 JSON 을 읽는다. -s 는 명령 줄을 출력하지 않는다. */
function make(repository, target, values) {
  const args = ["-s", "-C", repository, target, ...Object.entries(values).map(([key, value]) => `${key}=${value}`)];
  return JSON.parse(execFileSync("make", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
}

function write(path, value) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function build(sok, root = ROOT) {
  const declaration = checkDeclaration(read(join(root, "registry.json")));
  const releases = join(root, "releases");
  for (const name of ["plugins", "sidecars", "releases"]) rmSync(join(root, name), { recursive: true, force: true });
  mkdirSync(releases, { recursive: true });
  const declared = new Map();
  for (const item of declaration.sidecars) {
    const repository = resolve(root, item.repository);
    const folder = join(repository, item.folder);
    declared.set(read(join(folder, "package.json")).name, { repository, folder });
  }
  const used = new Set();
  for (const relativeFolder of declaration.plugins) {
    const repository = resolve(root, relativeFolder);
    const manifest = read(join(repository, "plugin.json"));
    const pkg = read(join(repository, "package.json"));
    const pack = make(repository, "pack", { OUT: releases, SOK: sok });
    write(join(root, "plugins", `${manifest.id}.json`), {
      id: manifest.id, package: pkg.name, name: manifest.name, description: pkg.description, license: pkg.license,
      repository: repositoryText(pkg.repository),
      versions: [{
        version: pkg.version, package: { url: pathToFileURL(pack.archive).href, sha256: pack.sha256 },
        // 기본값: sidecar 를 쓰지 않는 plugin 은 package.json 에 soksak 이 없고 sidecar 범위도 없다.
        engines: { soksak: pkg.engines?.soksak }, sidecars: pkg.soksak?.sidecars ?? {},
      }],
    });
    // 기본값: sidecar 를 쓰지 않는 plugin 의 package.json 에는 soksak.sidecars 가 없다.
    for (const name of Object.keys(pkg.soksak?.sidecars ?? {})) {
      if (!declared.has(name)) throw new Error(`registry.json: plugin ${manifest.id} uses ${name}, which no declared sidecar folder holds`);
      used.add(name);
    }
  }
  for (const name of used) {
    const { repository, folder } = declared.get(name);
    const release = make(repository, "release", { OUT: releases, SOK: sok });
    const pkg = read(join(folder, "package.json"));
    const sidecar = read(join(folder, "sidecar.json"));
    const file = name.startsWith("@") ? name.slice(1).replace("/", "-") : name;
    write(join(root, "sidecars", `${file}.json`), {
      name: pkg.name, repository: repositoryText(pkg.repository),
      versions: [{
        version: pkg.version, protocol: sidecar.protocol,
        assets: { [release.platform]: { url: pathToFileURL(release.archive).href, sha256: release.sha256 } },
      }],
    });
  }
  return JSON.parse(execFileSync(sok, ["registry", "build", root], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = process.argv.indexOf("--sok");
  if (at < 0 || at + 1 >= process.argv.length) throw new Error("--sok is required");
  const result = build(resolve(process.argv[at + 1]));
  console.log(`Registry: ${result.index} (${result.plugins} plugins, ${result.sidecars} sidecars, ${result.packs} packs)`);
}
