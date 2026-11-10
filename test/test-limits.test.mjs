// The test run has the limit of its runner, and no test sets a time limit of its own (G109): a wait ends only by its event,
// and the runner fails a test that does not end with its name, as each core test and each plugin test has its limit.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// A time limit, a timer or a time window of a test: the timeout option of a test or of a spawned command, a timer, a pause
// of the process or a read of the clock.
const ownLimit = /\btimeout\s*:|\bset(Timeout|Interval)\s*\(|\bsleep\b|\bDate\.now\s*\(|\bperformance\.now\s*\(/;

const testFiles = ["test", "environment"].flatMap((folder) => readdirSync(join(root, folder))
  .filter((name) => name.endsWith(".test.mjs")).map((name) => `${folder}/${name}`));

test("make test runs node --test with the runner limit of 120000 ms", () => {
  const env = { ...process.env };
  delete env.MAKEFLAGS;
  const result = spawnSync("make", ["-n", "--no-print-directory", "test"], { cwd: root, encoding: "utf8", env });
  assert.equal(result.status, 0, `make -n test failed: ${result.stderr}`);
  assert.deepEqual(result.stdout.split("\n").filter((line) => line.startsWith("node --test")),
    ["node --test --test-timeout=120000 test/"]);
});

test("no test of test/ or environment/ sets a time limit, a timer or a time window of its own", () => {
  assert.ok(testFiles.length > 0, "no test file was found");
  const found = testFiles.flatMap((file) => readFileSync(join(root, file), "utf8").split("\n")
    .flatMap((line, index) => (ownLimit.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [])));
  assert.deepEqual(found, []);
});
