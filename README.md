# soksak registry

[한국어](README.ko.md)

The local plugin registry of soksak 0.0.2. `registry.json` declares the plugin and sidecar repositories, `packs/` holds the plugin packs, and `revoked.json` lists the versions that must not be installed. The [plugin installation formats](../core/docs/spec/installation.md) define the files.

```sh
make build SOK=<path to sok>   # writes releases/, plugins/, sidecars/ and index.json
make test
sok registry use "$PWD/index.json"
```

The generated entries hold `file:` URLs of this computer and are not committed. The checklist is [docs/features.md](docs/features.md).
