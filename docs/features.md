# Features

[한국어](features.ko.md)

- [o] G1 — P1: Hold the local registry of soksak 0.0.2. Created on 2026-10-02 for the core checklist item R1-6: `registry.json` declares the plugin repositories `browser`, `files` and `terminal` and the sidecar folders of `files` and `vt`, `packs/starter.json` names the starter pack, and `make build SOK=<sok>` runs each repository's own `make pack` or `make release`, writes the entries and runs `sok registry build`. `make test` and `make build` pass on macOS arm64 (3 plugins, 2 sidecars, 1 pack).
