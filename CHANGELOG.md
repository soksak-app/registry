# Changelog

## Unreleased

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
