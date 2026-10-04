# soksak registry

[English](README.md)

soksak의 공개 plugin registry다. 애플리케이션은 첫 시작에서 `https://soksak-app.github.io/registry/index.json`의 index를 읽는다. plugin과 sidecar마다 항목 파일 `plugins/<id>.json`이나 `sidecars/<file name>.json`이 하나씩 있으며, 그 파일은 GitHub 저장소와 각 version의 release asset을 가리킨다. `packs/`는 plugin pack을, `revoked.json`은 설치하면 안 되는 version을 담는다. [공개 registry 명세](https://github.com/soksak-app/core/blob/main/docs/spec/registry.ko.md)가 규칙을 정하고, [CONTRIBUTING.ko.md](CONTRIBUTING.ko.md)가 항목을 더하는 순서를 적는다.

pull request는 `validate.yml`이 검사하고, 검사가 통과하면 `merge.yml`이 merge하며, merge하면 `publish.yml`이 index를 게시한다.

```sh
make test                     # 검사의 테스트
make build SOK=<sok 경로>      # 모든 archive를 읽어 항목 파일로 index.json을 만든다
```

`index.json`은 commit하지 않는다. Checklist는 [docs/features.ko.md](docs/features.ko.md)다.
