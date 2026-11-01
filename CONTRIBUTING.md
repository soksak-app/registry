# Adding a plugin or a sidecar

[한국어](CONTRIBUTING.ko.md)

The [public registry specification](https://github.com/soksak-app/core/blob/main/docs/spec/registry.md) states the rules; this page lists the steps.

1. Publish the version as a GitHub release of your repository, tagged `v<version>`. A plugin release holds `<id>-<version>.tgz` written by `sok plugin pack`; a sidecar release holds `<file name>-<version>-<platform>.tar.gz` for each platform, written by `sok sidecar release`. `sok` prints the `sha256` of each release file.
2. Add or change your entry file: `plugins/<id>.json` for a plugin, `sidecars/<file name>.json` for a sidecar, in the form of the [registry index](https://github.com/soksak-app/core/blob/main/docs/spec/installation.md#registry-index). `repository` is `https://github.com/<owner>/<repo>`, and each `url` is the release URL `https://github.com/<owner>/<repo>/releases/download/v<version>/<file>` of that repository. `node scripts/add-version.mjs plugin --registry . --package <plugin folder> --release <id>-<version>.tgz` or `node scripts/add-version.mjs sidecar --registry . --package <sidecar folder> --release <platform>=<file>` writes the entry with the new version from your package and its releases.
3. Open a pull request from your account. You own the entry when its repository belongs to your account or to an organization of which you are a public member.

The `validate` workflow checks the pull request: the changed paths, the entry rules, the published versions, your ownership, and the whole registry with `sok registry build`, which reads every release and compares its `sha256`. The validation and publication workflows use the `sok` of the application zip of the core release that `CORE_RELEASE` names, and check each listed core with the plugin API release file of that core release; they check out no core source. They do not run the development manifest check.

Run `make development-manifest-check INDEX=<registry index>` to check every unrevoked plugin release whose `engines.soksak` includes the development SDK version pinned by this repository. This command uses the development `@soksak/plugin-api` manifest reader. Its result describes compatibility with that development commit only; it does not establish compatibility with a released core tag. In particular, a same-numbered development SDK may have a different manifest contract from the released core tag. Keep development compatibility results separate from release validation, and resolve the next SDK release identity and user impact before changing public entries or revoking versions.

Run `make released-manifest-check INDEX=<registry index>` to classify those releases with the immutable released SDK fixture pinned to core v0.0.20. This is a read-only compatibility check; it does not change public entries or revocations. The development and released SDK checks use separate package dependencies and report compatibility only for their own manifest readers.

Run `make candidate-manifest-check INDEX=<registry index> CORE_PLUGIN_API_DIR=<plugin-api package directory> CANDIDATE_VERSION=<version>` to check a local core SDK candidate. The command reads only the package root declared by `exports["."]` and requires its `package.json` version to match `CANDIDATE_VERSION`. This check is separate from both the pinned development SDK and the released v0.0.20 SDK. It validates a local candidate index and does not change public entries or revocations.

Run `make candidate-release CANDIDATE_ENTRIES=<registry declarations> CORE_SOURCE_DIR=<core checkout> CORE_PLUGIN_API_DIR=<plugin-api package> OUT=<private output directory> SOK=<sok>` only after the declared component releases exist. The candidate entry directory holds only `plugins/` and `sidecars/` JSON entries. The command reads the exact projection and revocation delta from `candidate-release.json`, checks the registry and core SDK source revisions, builds a temporary registry with `sok registry build`, and checks manifest compatibility before and after the declared revocations. It writes `index.json` and `proof.json` only to the private output directory; it does not modify the registry declarations or publish the index.

The registry maintainers review a pull request whose check passes and merge it, and the merge publishes the index. A published version does not change; ask the registry maintainers to revoke a version in `revoked.json`.

Packs, `revoked.json` and the registry's own files are changed only by the registry maintainers.
