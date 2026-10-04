# soksak registry

[한국어](README.ko.md)

The public plugin registry of soksak. The applications read its index at `https://soksak-app.github.io/registry/index.json` on their first start. `registry.json` declares the plugin and sidecar repositories, `packs/` holds the plugin packs, and `revoked.json` lists the versions that must not be installed. The [plugin installation formats](https://github.com/soksak-app/core/blob/main/docs/spec/installation.md) define the files.

A `v*` tag runs `.github/workflows/publish.yml`: it checks out every component repository at that tag, builds the index from their GitHub release assets and deploys it to GitHub Pages.

A local registry for development builds each component from its sibling checkout:

```sh
make build SOK=<path to sok>   # writes releases/, plugins/, sidecars/ and index.json
make test
sok registry use "$PWD/index.json"
```

The published build reads the release assets instead: `node scripts/build.mjs --sok <path to sok> --published --platform darwin-arm64`. The generated files are not committed. The checklist is [docs/features.md](docs/features.md).
