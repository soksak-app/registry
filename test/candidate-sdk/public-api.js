export function rangeContains(range, version) {
  return range === `^${version}`;
}

export function validateManifest(manifest) {
  if (manifest.surface?.module !== undefined) throw new Error("surface.module is not supported by this SDK");
}
