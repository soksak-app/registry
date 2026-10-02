# soksak registry

[English](README.md)

soksak 0.0.2의 로컬 plugin registry다. `registry.json`은 plugin과 sidecar repository를 선언하고, `packs/`는 plugin pack을, `revoked.json`은 설치하면 안 되는 version을 담는다. [Plugin 설치 형식](../core/docs/spec/installation.ko.md)이 이 파일을 정한다.

```sh
make build SOK=<sok 경로>   # releases/, plugins/, sidecars/, index.json을 쓴다
make test
sok registry use "$PWD/index.json"
```

생성한 항목은 이 컴퓨터의 `file:` URL을 담으므로 commit하지 않는다. Checklist는 [docs/features.ko.md](docs/features.ko.md)다.
