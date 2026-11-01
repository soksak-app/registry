// Reads plugin releases for the manifest checks of the registry.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The bytes at url: an https or file URL. */
export async function fetchBytes(url) {
  if (url.startsWith("file:")) return readFileSync(fileURLToPath(url));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** plugin.json of a plugin release, the pnpm pack file of the plugin: a gzip tar with plugin.json under package/. */
export function releaseManifest(bytes) {
  const folder = mkdtempSync(join(tmpdir(), "soksak-registry-plugin-manifest-"));
  try {
    const path = join(folder, "plugin.tgz");
    writeFileSync(path, bytes);
    return JSON.parse(execFileSync("tar", ["-xzOf", path, "package/plugin.json"], { encoding: "utf8" }));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/** plugin.json of the release of an index version, after its bytes match the sha256 of the index. */
export async function verifiedManifest(version, fetchRelease = fetchBytes) {
  const bytes = await fetchRelease(version.release.url);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== version.release.sha256) throw new Error(`release sha256 ${digest} differs from the index ${version.release.sha256}`);
  return releaseManifest(bytes);
}

/**
 * The package folder of the release of an index version, extracted under out after its bytes match the sha256 of the index.
 * The folder is out/<sha256>/package, so a release that several core versions select is extracted once.
 */
export async function verifiedRelease(version, out, fetchRelease = fetchBytes) {
  const bytes = await fetchRelease(version.release.url);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== version.release.sha256) throw new Error(`release sha256 ${digest} differs from the index ${version.release.sha256}`);
  const folder = join(out, digest);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "plugin.tgz"), bytes);
  execFileSync("tar", ["-xzf", join(folder, "plugin.tgz"), "-C", folder]);
  return join(folder, "package");
}
