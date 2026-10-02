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
