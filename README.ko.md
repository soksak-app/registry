# soksak registry

[English](README.md)

soksak의 공개 plugin registry다. 애플리케이션은 첫 시작에서 `https://soksak-app.github.io/registry/index.json`의 index를 읽는다. `registry.json`은 plugin과 sidecar repository를 선언하고, `packs/`는 plugin pack을, `revoked.json`은 설치하면 안 되는 version을 담는다. [Plugin 설치 형식](https://github.com/soksak-app/core/blob/main/docs/spec/installation.ko.md)이 이 파일을 정한다.

`v*` tag는 `.github/workflows/publish.yml`을 실행한다. 이 workflow는 모든 component repository를 그 tag로 checkout하고, 각 GitHub release asset으로 index를 만들어 GitHub Pages에 배포한다.

개발용 로컬 registry는 형제 checkout의 각 component를 빌드해 만든다.

```sh
make build SOK=<sok 경로>   # releases/, plugins/, sidecars/, index.json을 쓴다
make test
sok registry use "$PWD/index.json"
```

게시 build는 그 대신 release asset을 읽는다: `node scripts/build.mjs --sok <sok 경로> --published --platform darwin-arm64`. 생성한 파일은 commit하지 않는다. Checklist는 [docs/features.ko.md](docs/features.ko.md)다.
