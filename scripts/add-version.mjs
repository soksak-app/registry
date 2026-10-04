#!/usr/bin/env node
// component release 의 version 을 registry 항목에 더한다(core docs/spec/registry.md). plugin 은 package.json 과
// plugin.json 을, sidecar 는 package.json 과 sidecar.json 을 읽고, archive 의 sha256 과 그 저장소의 GitHub release
// asset 주소로 새 version 을 쓴다. 항목 파일이 없으면 만든다. 게시한 version 은 바뀌지 않으므로 이미 있는 version 은
// 오류다.
//
//   node scripts/add-version.mjs plugin --registry <dir> --package <plugin dir> --archive <tgz>
//   node scripts/add-version.mjs sidecar --registry <dir> --package <sidecar dir> --asset <platform>=<tar.gz>...
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** package.json 의 repository 를 `https://github.com/<owner>/<repo>` 로 읽는다. GitHub 이 아니면 오류다. */
export function githubRepository(pkg) {
  const url = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  const match = typeof url === "string" && /^(?:git\+)?https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/.exec(url);
  if (!match) throw new Error(`package.json repository must be a GitHub repository: ${url}`);
  return `https://github.com/${match[1]}/${match[2]}`;
}

/** sidecar 이름의 파일 이름. `@scope/name` 은 `scope-name` 이다. */
function fileName(name) {
  return name.startsWith("@") ? name.slice(1).replace("/", "-") : name;
}

/** 항목을 읽거나 새로 만들고 version 을 더해 쓴다. */
function addVersion(path, created, version) {
  const entry = existsSync(path) ? read(path) : created;
  if (entry.versions.some((item) => item.version === version.version)) {
    throw new Error(`${path}: version ${version.version} is already published`);
  }
  entry.versions.push(version);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(entry, null, 2)}\n`);
  return path;
}

/** plugin 폴더와 그 archive 로 plugins/<id>.json 에 version 을 더한다. */
export function addPlugin(registry, folder, archive) {
  const pkg = read(join(folder, "package.json"));
  const manifest = read(join(folder, "plugin.json"));
  const repository = githubRepository(pkg);
  const asset = `${manifest.id}-${pkg.version}.tgz`;
  if (basename(archive) !== asset) throw new Error(`${archive}: the plugin archive must be named ${asset}`);
  return addVersion(join(registry, "plugins", `${manifest.id}.json`), {
    id: manifest.id, package: pkg.name, name: manifest.name, description: pkg.description, license: pkg.license, repository, versions: [],
  }, {
    version: pkg.version,
    package: { url: `${repository}/releases/download/v${pkg.version}/${asset}`, sha256: sha256(archive) },
    // 기본값: sidecar 를 쓰지 않는 plugin 은 package.json 에 soksak 이 없고 sidecar 범위도 없다.
    engines: { soksak: pkg.engines?.soksak }, sidecars: pkg.soksak?.sidecars ?? {},
  });
}

/** sidecar 폴더와 platform 마다의 archive 로 sidecars/<file name>.json 에 version 을 더한다. */
export function addSidecar(registry, folder, assets) {
  const pkg = read(join(folder, "package.json"));
  const sidecar = read(join(folder, "sidecar.json"));
  const repository = githubRepository(pkg);
  const file = fileName(pkg.name);
  if (Object.keys(assets).length === 0) throw new Error("a sidecar version needs at least one --asset <platform>=<archive>");
  const urls = {};
  for (const [platform, archive] of Object.entries(assets)) {
    const asset = `${file}-${pkg.version}-${platform}.tar.gz`;
    if (basename(archive) !== asset) throw new Error(`${archive}: the ${platform} archive must be named ${asset}`);
    urls[platform] = { url: `${repository}/releases/download/v${pkg.version}/${asset}`, sha256: sha256(archive) };
  }
  return addVersion(join(registry, "sidecars", `${file}.json`), { name: pkg.name, repository, versions: [] },
    { version: pkg.version, protocol: sidecar.protocol, assets: urls });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [kind, ...rest] = process.argv.slice(2);
  const values = (name) => rest.flatMap((value, index) => (rest[index - 1] === `--${name}` ? [value] : []));
  const one = (name) => {
    const found = values(name);
    if (found.length !== 1) throw new Error(`--${name} is required once`);
    return found[0];
  };
  let path;
  if (kind === "plugin") {
    path = addPlugin(one("registry"), one("package"), one("archive"));
  } else if (kind === "sidecar") {
    const assets = Object.fromEntries(values("asset").map((value) => {
      const at = value.indexOf("=");
      if (at <= 0) throw new Error(`--asset must be <platform>=<archive>: ${value}`);
      return [value.slice(0, at), value.slice(at + 1)];
    }));
    path = addSidecar(one("registry"), one("package"), assets);
  } else {
    throw new Error("usage: add-version.mjs plugin|sidecar --registry <dir> --package <dir> (--archive <tgz> | --asset <platform>=<tar.gz>...)");
  }
  console.log(path);
}
