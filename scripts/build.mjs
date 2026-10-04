#!/usr/bin/env node
// registry 를 build 한다(docs/features.md). registry.json 이 이 repository 기준 상대 폴더로 선언한 plugin 과 sidecar
// repository 에서 plugins/<id>.json 과 sidecars/<file name>.json 을 쓰고 `sok registry build` 로 index.json 을 만든다.
// packs/ 와 revoked.json 은 이 repository 가 관리하는 원본이다.
//
// 로컬 build 는 plugin repository 의 `make pack` 과 sidecar repository 의 `make release` 로 releases/ 에 archive 를
// 쓰고 그 file: 주소를 항목에 쓴다. 게시 build(--published)는 tag 에서 받은 각 repository 의 package.json 이 정한
// GitHub release asset 의 https 주소와, 그 asset 을 받아 계산한 sha256 을 항목에 쓴다. 생성한 파일은 commit 하지
// 않는다.
//
//   node scripts/build.mjs --sok <sok 실행 파일> [--published --platform <platform>...]
import { createHash } from "node:crypto";
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

/** GitHub repository 주소의 release asset 주소. GitHub 이 아닌 repository 는 오류다. */
export function releaseAssetURL(owner, repository, version, asset) {
  const match = /^(?:git\+)?https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/.exec(repository);
  if (!match) throw new Error(`${owner}: the repository ${repository} is not a GitHub repository`);
  return `https://github.com/${match[1]}/${match[2]}/releases/download/v${version}/${asset}`;
}

/** 게시 build 의 archive: release asset 을 받아 그 주소와 sha256 을 돌려준다. */
async function publishedArchive(download, owner, repository, version, asset) {
  const url = releaseAssetURL(owner, repository, version, asset);
  const body = await download(url);
  return { url, sha256: createHash("sha256").update(body).digest("hex") };
}

/** 받은 본문을 돌려준다. 200 이 아니면 오류다. */
async function downloadBody(url) {
  const response = await fetch(url);
  if (response.status !== 200) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * plugins/<id>.json 과 sidecars/<file name>.json 을 쓴다. published 가 없으면 로컬 build 이고, 있으면
 * { download, platforms } 로 release asset 의 주소를 쓰는 게시 build 다.
 */
export async function entries(root, sok, published = null) {
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
    let archive;
    if (published) {
      archive = await publishedArchive(published.download, `plugin ${manifest.id}`, repositoryText(pkg.repository), pkg.version,
        `${manifest.id}-${pkg.version}.tgz`);
    } else {
      const pack = make(repository, "pack", { OUT: releases, SOK: sok });
      archive = { url: pathToFileURL(pack.archive).href, sha256: pack.sha256 };
    }
    write(join(root, "plugins", `${manifest.id}.json`), {
      id: manifest.id, package: pkg.name, name: manifest.name, description: pkg.description, license: pkg.license,
      repository: repositoryText(pkg.repository),
      versions: [{
        version: pkg.version, package: archive,
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
    const pkg = read(join(folder, "package.json"));
    const sidecar = read(join(folder, "sidecar.json"));
    const file = name.startsWith("@") ? name.slice(1).replace("/", "-") : name;
    const assets = {};
    if (published) {
      for (const platform of published.platforms) {
        assets[platform] = await publishedArchive(published.download, `sidecar ${name}`, repositoryText(pkg.repository), pkg.version,
          `${file}-${pkg.version}-${platform}.tar.gz`);
      }
    } else {
      const release = make(repository, "release", { OUT: releases, SOK: sok });
      assets[release.platform] = { url: pathToFileURL(release.archive).href, sha256: release.sha256 };
    }
    write(join(root, "sidecars", `${file}.json`), {
      name: pkg.name, repository: repositoryText(pkg.repository),
      versions: [{ version: pkg.version, protocol: sidecar.protocol, assets }],
    });
  }
}

/** 항목을 쓰고 `sok registry build` 로 index.json 을 만든다. */
export async function build(sok, root = ROOT, published = null) {
  await entries(root, sok, published);
  return JSON.parse(execFileSync(sok, ["registry", "build", root], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = process.argv.indexOf("--sok");
  if (at < 0 || at + 1 >= process.argv.length) throw new Error("--sok is required");
  const platforms = process.argv.flatMap((value, index) => (process.argv[index - 1] === "--platform" ? [value] : []));
  const published = process.argv.includes("--published");
  if (published && platforms.length === 0) throw new Error("--published needs at least one --platform");
  if (!published && platforms.length > 0) throw new Error("--platform is used only with --published");
  const result = await build(resolve(process.argv[at + 1]), ROOT, published ? { download: downloadBody, platforms } : null);
  console.log(`Registry: ${result.index} (${result.plugins} plugins, ${result.sidecars} sidecars, ${result.packs} packs)`);
}
