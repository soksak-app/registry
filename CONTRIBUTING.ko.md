# Plugin이나 sidecar 더하기

[English](CONTRIBUTING.md)

[공개 registry 명세](https://github.com/soksak-app/core/blob/main/docs/spec/registry.ko.md)가 규칙을 정하고, 이 문서는 순서를 적는다.

1. version을 자기 저장소의 GitHub release로 `v<version>` tag와 함께 게시한다. plugin release는 `sok plugin pack`이 쓴 `<id>-<version>.tgz`를, sidecar release는 platform마다 `sok sidecar release`가 쓴 `<file name>-<version>-<platform>.tar.gz`를 담는다. `sok`은 각 archive의 `sha256`을 출력한다.
2. 항목 파일을 더하거나 바꾼다. plugin은 `plugins/<id>.json`, sidecar는 `sidecars/<file name>.json`이며 형식은 [registry index](https://github.com/soksak-app/core/blob/main/docs/spec/installation.ko.md#registry-index)를 따른다. `repository`는 `https://github.com/<owner>/<repo>`이고, 각 `url`은 그 저장소의 release asset URL `https://github.com/<owner>/<repo>/releases/download/v<version>/<asset>`이다.
3. 자기 계정으로 pull request를 연다. 항목의 저장소가 자기 계정에 속하거나, 자신이 공개 member인 조직에 속하면 그 항목의 소유자다.

`validate` workflow가 pull request를 검사한다. 바뀐 경로, 항목 규칙, 게시한 version, 소유권, 그리고 모든 archive를 읽어 `sha256`을 비교하는 `sok registry build`로 registry 전체를 확인한다. 검사가 통과하면 `merge` workflow가 pull request를 merge하고 index를 게시한다. 게시한 version은 바뀌지 않는다. version을 거두려면 registry 관리자에게 `revoked.json`에 올려 달라고 요청한다.

pack, `revoked.json`, registry 자신의 파일은 registry 관리자만 바꾼다.
