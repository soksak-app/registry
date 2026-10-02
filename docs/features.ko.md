# 기능

[English](features.md)

- [o] G1 — P1: soksak 0.0.2의 로컬 registry를 담는다. 2026-10-02 core checklist 항목 R1-6을 위해 만들었다. `registry.json`이 plugin repository `browser`, `files`, `terminal`과 `files`, `vt`의 sidecar 폴더를 선언하고, `packs/starter.json`이 starter pack을 정하며, `make build SOK=<sok>`가 각 repository의 `make pack`이나 `make release`를 실행해 항목을 쓰고 `sok registry build`를 실행한다. macOS arm64에서 `make test`와 `make build`가 통과한다(plugin 3, sidecar 2, pack 1).
