#!/usr/bin/env node
// pull request 의 registry 를 검사한다(core docs/spec/registry.md). base 는 base branch 의 checkout, head 는 pull
// request 의 checkout 이며 head 의 파일은 데이터로만 읽는다. 검사는 바뀐 경로, 항목 규칙, 게시한 version 의 불변,
// 항목 소유권을 보고, 마지막으로 head 의 registry 전체에 `sok registry build` 를 실행한다.
//
//   node scripts/validate.mjs --base <dir> --head <dir> --author <login> --sok <sok> [--api <url>]
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

/** 항목 파일의 경로. 이 경로만 pull request 가 바꾼다. */
const ENTRY = /^(plugins|sidecars)\/[^/]+\.json$/;
/** GitHub 저장소 주소. */
const REPOSITORY = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/;
/** 비교하지 않는 폴더. */
const SKIPPED = new Set([".git", "node_modules"]);

/** dir 아래 파일의 상대 경로. */
function files(dir, at = dir) {
  if (!existsSync(at)) return [];
  return readdirSync(at).flatMap((name) => {
    if (SKIPPED.has(name)) return [];
    const path = join(at, name);
    return statSync(path).isDirectory() ? files(dir, path) : [relative(dir, path)];
  });
}

/** base 와 head 사이에 더해지거나 바뀌거나 지워진 파일의 경로를 정렬해 돌려준다. */
export function changedFiles(base, head) {
  const paths = new Set([...files(base), ...files(head)]);
  return [...paths].sort().filter((path) => {
    const before = existsSync(join(base, path)) ? readFileSync(join(base, path)) : null;
    const after = existsSync(join(head, path)) ? readFileSync(join(head, path)) : null;
    return before === null || after === null || !before.equals(after);
  });
}

/** sidecar 이름의 파일 이름. `@scope/name` 은 `scope-name` 이다. */
export function sidecarFileName(name) {
  return name.startsWith("@") ? name.slice(1).replace("/", "-") : name;
}

/** 항목 파일을 읽는다. 없으면 null 이고, JSON 이 아니거나 객체가 아니면 오류다. */
function readEntry(dir, path) {
  if (!existsSync(join(dir, path))) return null;
  let value;
  try {
    value = JSON.parse(readFileSync(join(dir, path), "utf8"));
  } catch (error) {
    throw new Error(`${path}: not valid JSON: ${error.message}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: expected an object`);
  return value;
}

/** 항목의 저장소 owner 와 이름. GitHub 저장소 주소가 아니면 오류다. */
function repositoryOf(path, entry) {
  const match = typeof entry.repository === "string" && REPOSITORY.exec(entry.repository);
  if (!match) throw new Error(`${path}: repository must be https://github.com/<owner>/<repo>`);
  return { owner: match[1], repo: match[2] };
}

/** 항목의 이름, 파일 이름, 항목 규칙을 검사한다(docs/spec/registry.md#entry-rules). */
export function checkEntry(path, entry) {
  const errors = [];
  const [folder, file] = path.split("/");
  const { owner, repo } = repositoryOf(path, entry);
  const release = (version) => `https://github.com/${owner}/${repo}/releases/download/v${version}/`;
  const versions = Array.isArray(entry.versions) ? entry.versions : [];
  if (folder === "plugins") {
    if (file !== `${entry.id}.json`) errors.push(`${path}: the file name must be ${entry.id}.json`);
    for (const version of versions) {
      const want = `${release(version.version)}${entry.id}-${version.version}.tgz`;
      if (version.release?.url !== want) errors.push(`${path}: version ${version.version}: release url must be ${want}`);
    }
  } else {
    const name = typeof entry.name === "string" ? sidecarFileName(entry.name) : null;
    if (file !== `${name}.json`) errors.push(`${path}: the file name must be ${name}.json`);
    for (const version of versions) {
      for (const [platform, asset] of Object.entries(version.releases ?? {})) {
        const want = `${release(version.version)}${name}-${version.version}-${platform}.tar.gz`;
        if (asset?.url !== want) errors.push(`${path}: version ${version.version} ${platform}: url must be ${want}`);
      }
    }
  }
  return errors;
}

/** base 항목의 version 이 head 에 그대로 있는지 검사한다. head 가 null 이면 항목을 지운 것이다. */
export function checkPublishedVersions(path, before, after) {
  if (after === null) return [`${path}: a published entry is not removed; revoke its versions in revoked.json`];
  const versions = new Map((Array.isArray(after.versions) ? after.versions : []).map((version) => [version.version, version]));
  return (Array.isArray(before.versions) ? before.versions : []).flatMap((version) => {
    if (!versions.has(version.version)) return [`${path}: published version ${version.version} is removed`];
    return isDeepStrictEqual(versions.get(version.version), version) ? [] : [`${path}: published version ${version.version} is changed`];
  });
}

/** The repository that publishes the releases of core. */
const CORE_REPOSITORY = "https://github.com/soksak-app/core";

/** core.json 의 release 주소 규칙을 검사한다. 이 파일은 registry maintainer 가 바꾼다(core docs/spec/registry.md). */
export function checkCore(core) {
  const errors = [];
  for (const version of Array.isArray(core.versions) ? core.versions : []) {
    for (const [key, release] of Object.entries(version.releases ?? {})) {
      const want = `${CORE_REPOSITORY}/releases/download/v${version.version}/soksak-${version.version}-${key}.zip`;
      if (release?.url !== want) errors.push(`core.json: version ${version.version} ${key}: url must be ${want}`);
    }
  }
  return errors;
}

/** author 가 owner 의 저장소를 소유하는지. 사용자 계정이면 같은 login, 조직이면 그 조직의 공개 member 다. */
async function owns(github, author, owner) {
  if (owner.toLowerCase() === author.toLowerCase()) return true;
  return (await github.accountType(owner)) === "Organization" && github.isPublicMember(owner, author);
}

/** GitHub API 의 계정 조회. api 는 https://api.github.com 이며, 검사는 테스트 소유의 server 를 준다. */
export function githubAPI(api) {
  const request = async (path) => {
    const response = await fetch(`${api}${path}`, { headers: { accept: "application/vnd.github+json" } });
    return response;
  };
  return {
    async accountType(owner) {
      const response = await request(`/users/${encodeURIComponent(owner)}`);
      if (response.status !== 200) throw new Error(`${api}/users/${owner}: HTTP ${response.status}`);
      return (await response.json()).type;
    },
    async isPublicMember(org, user) {
      const response = await request(`/orgs/${encodeURIComponent(org)}/public_members/${encodeURIComponent(user)}`);
      if (response.status === 204) return true;
      if (response.status === 404) return false;
      throw new Error(`${api}/orgs/${org}/public_members/${user}: HTTP ${response.status}`);
    },
  };
}

/**
 * pull request 를 검사하고 오류 문장의 배열을 돌려준다. build 는 head 의 registry 를 복사한 폴더로 `sok registry build`
 * 를 실행하고 실패하면 던진다.
 */
export async function validate({ base, head, author, github, build }) {
  const errors = [];
  const changed = changedFiles(base, head);
  for (const path of changed.filter((path) => !ENTRY.test(path))) errors.push(`${path}: only registry maintainers change this path`);
  for (const path of changed.filter((path) => ENTRY.test(path))) {
    try {
      const before = readEntry(base, path);
      const after = readEntry(head, path);
      if (before) errors.push(...checkPublishedVersions(path, before, after));
      if (after) errors.push(...checkEntry(path, after));
      for (const [label, entry] of [["base", before], ["pull request", after]]) {
        if (!entry) continue;
        const { owner } = repositoryOf(path, entry);
        if (!(await owns(github, author, owner))) errors.push(`${path}: ${author} does not own ${entry.repository} (the ${label} entry)`);
      }
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (errors.length) return errors;
  const work = mkdtempSync(join(tmpdir(), "soksak-registry-"));
  try {
    for (const path of ["plugins", "sidecars", "packs", "revoked.json", "core.json"]) {
      if (existsSync(join(head, path))) cpSync(join(head, path), join(work, path), { recursive: true });
    }
    build(work);
  } catch (error) {
    errors.push(`sok registry build: ${error.message}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === "--check-core") {
  // node scripts/validate.mjs --check-core <core.json>
  const errors = checkCore(JSON.parse(readFileSync(process.argv[3], "utf8")));
  for (const error of errors) console.error(error);
  if (errors.length) process.exit(1);
  console.log("core.json check passed");
} else if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const option = (name) => {
    const at = process.argv.indexOf(`--${name}`);
    if (at < 0 || at + 1 >= process.argv.length) throw new Error(`--${name} is required`);
    return process.argv[at + 1];
  };
  const api = process.argv.includes("--api") ? option("api") : "https://api.github.com";
  const sok = option("sok");
  const errors = await validate({
    base: option("base"), head: option("head"), author: option("author"), github: githubAPI(api),
    build: (dir) => execFileSync(sok, ["registry", "build", dir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
  });
  for (const error of errors) console.error(error);
  if (errors.length) process.exit(1);
  console.log("registry check passed");
}
