# Plugin이나 sidecar 더하기

[English](CONTRIBUTING.md)

[공개 registry 명세](https://github.com/soksak-app/core/blob/main/docs/spec/registry.ko.md)가 규칙을 정하고, 이 문서는 순서를 적는다.

1. version을 자기 저장소의 GitHub release로 `v<version>` tag와 함께 게시한다. plugin release는 `sok plugin pack`이 쓴 `<id>-<version>.tgz`를, sidecar release는 platform마다 `sok sidecar release`가 쓴 `<file name>-<version>-<platform>.tar.gz`를 담는다. `sok`은 각 release 파일의 `sha256`을 출력한다.
2. 항목 파일을 더하거나 바꾼다. plugin은 `plugins/<id>.json`, sidecar는 `sidecars/<file name>.json`이며 형식은 [registry index](https://github.com/soksak-app/core/blob/main/docs/spec/installation.ko.md#registry-index)를 따른다. `repository`는 `https://github.com/<owner>/<repo>`이고, 각 `url`은 그 저장소의 release URL `https://github.com/<owner>/<repo>/releases/download/v<version>/<file>`이다. `node scripts/add-version.mjs plugin --registry . --package <plugin 폴더> --release <id>-<version>.tgz`나 `node scripts/add-version.mjs sidecar --registry . --package <sidecar 폴더> --release <platform>=<file>`가 package와 release로 새 version을 담은 항목을 쓴다.
3. 자기 계정으로 pull request를 연다. 항목의 저장소가 자기 계정에 속하거나, 자신이 공개 member인 조직에 속하면 그 항목의 소유자다.

`validate` workflow가 pull request를 검사한다. 바뀐 경로, 항목 규칙, 게시한 version, 소유권, 그리고 모든 release를 읽어 `sha256`을 비교하는 `sok registry build`로 registry 전체를 확인한다. Validation과 publication workflow는 registry entry 형식을 읽는 released core tag `v0.0.9`로 `sok`을 build한다. Development manifest check는 이 workflow에서 실행하지 않는다.

`make development-manifest-check INDEX=<registry index>`는 이 repository가 고정한 development SDK version이 `engines.soksak`에 포함되는 철회되지 않은 모든 plugin release를 검사한다. 이 명령은 development `@soksak/plugin-api` manifest reader를 사용한다. 결과는 해당 development commit과의 호환성만 나타내며 released core tag와의 호환성을 입증하지 않는다. 특히 같은 version 번호라도 development SDK와 released core tag의 manifest contract가 다를 수 있다. Development 호환성 결과를 release 검사와 분리하고, 공개 entry나 철회를 바꾸기 전에 다음 SDK release identity와 사용자 영향을 해결한다.

`make released-manifest-check INDEX=<registry index>`는 core v0.0.20의 immutable released SDK fixture로 같은 release를 분류한다. 이 검사는 public entry나 철회 항목을 바꾸지 않는다. Development와 released SDK 검사는 서로 다른 package dependency를 사용하며 각자 자신의 manifest reader에 대한 호환성만 보고한다.

registry 관리자는 검사를 통과한 pull request를 검토해 merge하고, merge가 index를 게시한다. 게시한 version은 바뀌지 않는다. version을 철회하려면 registry 관리자에게 `revoked.json`에 올려 달라고 요청한다.

pack, `revoked.json`, registry 자신의 파일은 registry 관리자만 바꾼다.
