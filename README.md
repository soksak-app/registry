# soksak registry

[한국어](README.ko.md)

The public plugin registry of soksak. The applications read its index at `https://soksak-app.github.io/registry/index.json` on their first start. Each plugin and sidecar has one entry file, `plugins/<id>.json` or `sidecars/<file name>.json`, that names its GitHub repository and the release assets of each version; `packs/` holds the plugin packs and `revoked.json` the versions that must not be installed. The [public registry specification](https://github.com/soksak-app/core/blob/main/docs/spec/registry.md) defines the rules, and [CONTRIBUTING.md](CONTRIBUTING.md) lists the steps to add an entry.

A pull request is checked by `validate.yml` and merged by the registry maintainers after review; each push to `main` publishes the index with `publish.yml`.

```sh
make test                     # tests of the check
make build SOK=<path to sok>  # builds index.json from the entry files, reading every archive
```

`index.json` is not committed. The checklist is [docs/features.md](docs/features.md).
