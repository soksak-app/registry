# Changelog

## Unreleased

- G66: The registry lists core 0.0.28 and the plugin releases for core 0.0.27 and 0.0.28.
- G65: The registry lists terminal 0.0.27 with VT `^0.0.19`.
- G64: The registry lists the sidecar releases files 0.0.10 and VT 0.0.19.
- G62: The registry lists core 0.0.27 with browser 0.0.12, editor 0.0.12, files 0.0.13, hwp 0.0.10 and terminal 0.0.26, and the workflows use `CORE_RELEASE` `v0.0.27`.
- G61: The listed core check runs `checkPluginRepository` of the plugin API release of each listed core on the extracted plugin releases that it installs, so a plugin repository checks its exposed names against core declarations without pinning a core release. Red: `each listed core version checks the exposure names of the plugin releases that it installs with its own SDK` failed. Green: it passes, and the check of the published index passes.
- G60: The registry lists core 0.0.26 and the releases of the `pnpm pack` and `npm pack` form that it installs: browser 0.0.11, editor 0.0.11, files 0.0.12, hwp 0.0.9, terminal 0.0.25, files sidecar 0.0.9 and VT 0.0.18. The earlier releases and their revoked entries are removed, because core 0.0.26 does not install their form; a core before 0.0.26 updates to 0.0.26. The workflows use the `sok` of the core release v0.0.26 and the plugin API release file of each listed core instead of a core checkout.
- G59: The listed core check fails on an unrevoked plugin version whose range contains a core newer than the newest listed core, and `revoked.json` withdraws the 22 such versions, which core 0.0.24 refuses.
- G58: The registry lists core 0.0.24 and the plugin releases browser 0.0.8 and 0.0.9, editor 0.0.8 and 0.0.9, files 0.0.9 and 0.0.10, hwp 0.0.6 and 0.0.7, and terminal 0.0.22 and 0.0.23.
- G57: The registry no longer lists core 0.0.21, because it does not start with an installed sidecar of the earlier `sidecar.json` form.
- G56: The registry lists the core release 0.0.21.
- G54: The registry lists browser 0.0.7, editor 0.0.7, files 0.0.8, hwp 0.0.5, terminal 0.0.21, sidecar-files 0.0.8 and sidecar-vt 0.0.17 with the release asset and `sha256` of each published release.
- G54.1: The release boundary of sidecar-files 0.0.8 and sidecar-vt 0.0.17 is recorded: both are listed unchanged; on core 0.0.20 a fresh files sidecar selection fails with `sidecar.json: unknown field displayName`, which the release notes state as a named exception, and vt 0.0.17 is never selected there.
- G55: The pull request check and the publication check, for each listed core version, the plugin versions that installation selects for it with the SDK of that core release.
- G53.5 updates the candidate SDK source revision and API tree after the
  package changed. The earlier eight-test run included seven passing behavior
  tests and one data-only mirror assertion, which was removed because it
  duplicated the declaration. This metadata update changes no behavior and
  does not claim public fetchability; no candidate artifact was generated or
  published.
- G53.4 preserves the current optional core revocation list shape. The
  projection accepts an omitted list, treats its empty list as equivalent to
  the index builder's canonical omission, and rejects loss of nonempty core
  revocations. The seven candidate-release owner tests pass; the registry
  schema and public data do not change.
- G53.3 defines a private candidate index and proof from one registry
  declaration. The proof requires the candidate SDK API tree to match both
  its declared source commit and the current checkout, and records an exact
  nonempty replacement-plugin compatibility check. The five owning tests
  pass, including cases for source drift, empty projections and extra checks.
  Candidate artifact generation and publication remain pending.
- G54 continues to wait for component publications. Its candidate projection lists
  browser 0.0.7, editor 0.0.7, files 0.0.8, hwp 0.0.5, terminal 0.0.21,
  sidecar-files 0.0.8 and sidecar-vt 0.0.17. No registry entry or published
  state changed.
