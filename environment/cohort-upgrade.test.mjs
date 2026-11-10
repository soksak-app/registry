// The environment check of the installed cohort (G108, core F715-6): after a core or plugin release is published, the official CLI
// upgrades the browser in a configuration whose index is the registry index under check, and the starter cohort that installation
// selects stays ready. The check gates no release. It drives the published core application through @soksak/window-check and reads
// the index that SOKSAK_REGISTRY_INDEX names (a file URL of the index.json that `make build` wrote).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { APPS, open, prepareFixture } from "@soksak/window-check/app.mjs";

const STARTER = ["browser", "files", "terminal"];
const SIDECARS = [["files", "@soksak/sidecar-files"], ["terminal", "@soksak/sidecar-vt-alacritty"]];
const SURFACES = ["browser", "terminal"];

// Installation selects the newest version that the index lists for the core under check.
const newest = (versions) => versions.map((entry) => entry.version)
  .sort((a, b) => b.split(".").map(Number).reduce((order, part, i) => order || part - Number(a.split(".")[i]), 0))[0];

for (const app of Object.values(APPS)) {
  test(`${app.name}: the browser upgrade keeps the starter cohort of the registry index ready`, async (t) => {
    const s = await open(t, app);
    await prepareFixture(s);
    const registry = process.env.SOKSAK_REGISTRY_INDEX;
    assert.ok(registry, "SOKSAK_REGISTRY_INDEX must name the index under check");
    assert.match(registry, /^file:\/\//, `the registry index is not a local file URL: ${registry}`);

    const plugins = await s.until("core.plugins", (value) => value.registry === registry && value.error === null &&
      STARTER.every((id) => {
        const plugin = value.plugins.find((row) => row.id === id);
        return plugin?.installed?.enabled === true && plugin.state === "loaded";
      }), "the first run of the application did not install and load the starter plugins browser, files and terminal from the registry index");
    const versions = Object.fromEntries(plugins.plugins
      .filter((plugin) => STARTER.includes(plugin.id))
      .map((plugin) => [plugin.id, plugin.installed.version]));
    const index = JSON.parse(readFileSync(fileURLToPath(registry), "utf8"));
    const listed = (rows, key, id) => {
      const row = rows.find((entry) => entry[key] === id);
      assert.ok(row, `the registry index lists no ${id}`);
      return newest(row.versions);
    };
    assert.deepEqual(versions, Object.fromEntries(STARTER.map((id) => [id, listed(index.plugins, "id", id)])),
      "the installed starter plugins are not the versions of the registry index");
    for (const [id, name] of SIDECARS) {
      const plugin = plugins.plugins.find((row) => row.id === id);
      assert.equal(plugin.sidecars.find((sidecar) => sidecar.name === name)?.version, listed(index.sidecars, "name", name),
        `${name} is not the version of the registry index`);
    }

    const ready = await s.until("core.surfaces", (surfaces) => SURFACES.every((plugin) =>
      surfaces.some((surface) => surface.plugin === plugin && surface.status.phase === "ready")),
    "the browser and terminal surfaces did not become ready");
    for (const plugin of SURFACES) {
      assert.ok(ready.some((surface) => surface.plugin === plugin && surface.status.phase === "ready"), `${plugin} has no ready surface`);
    }

    assert.equal(await s.get("core.workbench.error"), null, "the page reports an application error");
    assert.equal((await s.get("core.verify")).failed, 0, "the page reports failed verification checks");
  });
}
