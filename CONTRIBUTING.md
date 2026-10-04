# Adding a plugin or a sidecar

[한국어](CONTRIBUTING.ko.md)

The [public registry specification](https://github.com/soksak-app/core/blob/main/docs/spec/registry.md) states the rules; this page lists the steps.

1. Publish the version as a GitHub release of your repository, tagged `v<version>`. A plugin release holds `<id>-<version>.tgz` written by `sok plugin pack`; a sidecar release holds `<file name>-<version>-<platform>.tar.gz` for each platform, written by `sok sidecar release`. `sok` prints the `sha256` of each archive.
2. Add or change your entry file: `plugins/<id>.json` for a plugin, `sidecars/<file name>.json` for a sidecar, in the form of the [registry index](https://github.com/soksak-app/core/blob/main/docs/spec/installation.md#registry-index). `repository` is `https://github.com/<owner>/<repo>`, and each `url` is the release asset URL `https://github.com/<owner>/<repo>/releases/download/v<version>/<asset>` of that repository.
3. Open a pull request from your account. You own the entry when its repository belongs to your account or to an organization of which you are a public member.

The `validate` workflow checks the pull request: the changed paths, the entry rules, the published versions, your ownership, and the whole registry with `sok registry build`, which reads every archive and compares its `sha256`. When the check passes, the `merge` workflow merges the pull request and publishes the index. A published version does not change; ask the registry maintainers to revoke a version in `revoked.json`.

Packs, `revoked.json` and the registry's own files are changed only by the registry maintainers.
