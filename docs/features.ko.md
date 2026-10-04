# 기능

[English](features.md)

- [o] G1 — P1: soksak 0.0.2의 로컬 registry를 담는다. 2026-10-02 core checklist 항목 R1-6을 위해 만들었다. `registry.json`이 plugin repository `browser`, `files`, `terminal`과 `files`, `vt`의 sidecar 폴더를 선언하고, `packs/starter.json`이 starter pack을 정하며, `make build SOK=<sok>`가 각 repository의 `make pack`이나 `make release`를 실행해 항목을 쓰고 `sok registry build`를 실행한다. macOS arm64에서 `make test`와 `make build`가 통과한다(plugin 3, sidecar 2, pack 1).
- [~] G2 — P0: core 체크리스트 항목 R2-4-2를 위해 release asset으로 게시용 index를 만든다. `node scripts/build.mjs --sok <sok> --published --platform <platform>`은 각 항목을 component release asset의 `https://github.com/<owner>/<repository>/releases/download/v<version>/<asset>` URL과 받은 asset의 sha256으로 쓰고, `sok registry build`가 모든 archive를 https로 다시 읽는다. workflow가 index를 GitHub Pages로 게시한다. 2026-10-04 진행: 게시 build와 `.github/workflows/publish.yml`이 있고 `make test`가 통과한다. `publish.yml`의 build-machine rehearsal은 "Build the index"까지 실행했고, 아직 component release가 없으므로 `https://github.com/soksak-app/plugin-browser/releases/download/v0.0.3/browser-0.0.3.tgz: HTTP 404`에서 멈췄다.
