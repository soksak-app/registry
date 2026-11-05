# 변경 기록

## 미출시

- G105: changelog가 기록 없이 체크리스트에서 빠진 G10의 폐기를 기록한다.
- 체크리스트 항목 `G10` 폐기: 체크리스트 항목은 프로젝트 작업을 담는데, 이 항목은 record 규칙의 적용을 담았다.
- G104: listed core 검사가 plugin release의 선언된 contract 사본을 각 listed core의 `checkPluginRepository`에 넘기고, 다른 사본을 그 core와 함께 보고함을 test로 고정했다.
- G102: core 0.0.20 fixture와 함께 released manifest check를 지웠다. 범위가 0.0.20을 포함하는 올린 plugin version이 없고, listed core 검사가 각 listed core를 그 core의 plugin API로 검사하기 때문이다.
- G103: candidate manifest 검사를 제거했다. target `candidate-manifest-check`, 그 script, test, fixture와 `CONTRIBUTING.md`의 해당 절이다. 어떤 workflow나 다른 target도 이 검사를 부르지 않기 때문이다.
- G82: core 0.0.35와 그에 맞는 plugin release를 올린다.
- G79: 모든 release가 항목을 직접 올리므로 candidate release 경로를 제거했다.
- G81: core 0.0.34, VT 0.0.25, sidecar alacritty 0.0.6과 그에 맞는 plugin release를 올린다.
- G80: core 0.0.33, VT 0.0.24, sidecar alacritty 0.0.5와 그에 맞는 plugin release를 올린다.
- G78: plugin browser 0.0.18을 등록했다. 조건이 이미 지나갔으므로 G3과 G53.3을 닫고 G5와 G53을 완료했다.
- G77: VT 0.0.23, sidecar alacritty 0.0.4, plugin terminal 0.0.35, plugin term 0.0.4를 올렸다.
- G76: sidecar alacritty 0.0.3과 plugin term 0.0.3을 올렸다.
- G75: sidecar alacritty 0.0.2와 plugin term 0.0.2를 등록했다.
- G74: sidecar alacritty 0.0.1과 plugin term 0.0.1을 등록했다.
- G73: validator와 `add-version.mjs`는 plugin과 sidecar가 게시하는 release 파일 이름을 쓴다.
- G72: core 0.0.32와 그 plugin을 올린다.
- G71: core 0.0.31과 그 plugin을 올린다.
- G70: VT 0.0.22와 terminal 0.0.32를 올린다.
- G69: VT 0.0.21과 terminal 0.0.31을 올린다.
- G68: core 0.0.30, VT 0.0.20과 core 0.0.30을 위한 plugin을 나열한다.
- G67: registry는 core 0.0.29와 그 plugin release를 올린다.
- G66: registry는 core 0.0.28과 core 0.0.27, 0.0.28용 plugin release를 올린다.
- G65: registry는 VT `^0.0.19`와 함께 terminal 0.0.27을 올린다.
- G64: registry는 sidecar release files 0.0.10과 VT 0.0.19를 올린다.
- G62: registry는 browser 0.0.12, editor 0.0.12, files 0.0.13, hwp 0.0.10, terminal 0.0.26과 함께 core 0.0.27을 올리고, workflow는 `CORE_RELEASE` `v0.0.27`을 쓴다.
- G61: listed core 검사는 각 listed core의 plugin API release의 `checkPluginRepository`를 그것이 설치하는 plugin release를 푼 폴더에 실행하므로, plugin repository는 core release를 pin하지 않고 exposed 이름을 core 선언과 비교받는다. Red: `each listed core version checks the exposure names of the plugin releases that it installs with its own SDK`가 실패했다. Green: 통과하고, 게시된 index의 검사가 통과한다.
- G60: registry는 core 0.0.26과 그것이 설치하는 `pnpm pack`, `npm pack` 형태의 release를 적는다: browser 0.0.11, editor 0.0.11, files 0.0.12, hwp 0.0.9, terminal 0.0.25, files sidecar 0.0.9, VT 0.0.18. 이전 release와 그 revoked 항목은 지웠다. core 0.0.26이 그 형태를 설치하지 않기 때문이다. 0.0.26 이전 core는 0.0.26으로 update한다. workflow는 core checkout 대신 core release v0.0.26의 `sok`와 각 listed core의 plugin API release 파일을 쓴다.
- G59: listed core 검사가 범위가 가장 새 listed core보다 새 core를 포함하는 철회되지 않은 plugin version에서 실패하고, `revoked.json`이 core 0.0.24가 거부하는 그런 version 22개를 철회한다.
- G58: registry가 core 0.0.24와 plugin release browser 0.0.8과 0.0.9, editor 0.0.8과 0.0.9, files 0.0.9와 0.0.10, hwp 0.0.6과 0.0.7, terminal 0.0.22와 0.0.23을 올린다.
- G57: registry가 core 0.0.21을 더는 올리지 않는다. 이전 `sidecar.json` 형식의 sidecar가 설치돼 있으면 시작하지 않기 때문이다.
- G56: registry가 core release 0.0.21을 올린다.
- G54: registry가 browser 0.0.7, editor 0.0.7, files 0.0.8, hwp 0.0.5, terminal 0.0.21, sidecar-files 0.0.8, sidecar-vt 0.0.17을 게시된 각 release의 asset과 `sha256`으로 올린다.
- G54.1: sidecar-files 0.0.8과 sidecar-vt 0.0.17의 release 경계를 기록했다. 둘 다 바꾸지 않고 올린다. core 0.0.20에서 files sidecar를 새로 선택하면 `sidecar.json: unknown field displayName`으로 실패하며 release note가 이를 이름 붙은 예외로 밝힌다. vt 0.0.17은 그곳에서 선택되지 않는다.
- G55: pull request 검사와 게시는 올린 core version마다 설치가 고르는 plugin version을 그 core release의 SDK로 검사한다.
- G53.5는 package 변경 후 candidate SDK source revision과 API tree를 갱신한다.
  이전 8-test 실행에는 통과한 동작 test 7개와 declaration을 복사한 data-only
  mirror assertion 1개가 포함됐다. 중복 assertion은 제거했다. Metadata 갱신은
  동작을 바꾸지 않고 public fetchability를 주장하지 않는다. Candidate artifact를
  생성하거나 게시하지 않았다.
- G53.4는 선택적인 core revocation 목록 형식을 보존한다. Projection은
  목록 생략을 허용하고, 빈 목록은 index builder의 정규 생략 형식과 같게
  처리하며, 비어 있지 않은 core revocation이 사라지는 것은 거부한다.
  Candidate-release owner test 7개가 통과하고 registry schema와 public data는 바뀌지 않는다.
- G53.3은 하나의 registry 선언에서 비공개 candidate index와 proof를 만든다.
  Proof는 candidate SDK API tree가 선언된 source commit 및 현재 checkout과
  모두 일치하는지, 대체 plugin 호환성 검사가 비어 있지 않고 정확한지 요구한다.
  source drift, 빈 projection, 초과 검사 사례를 포함한 owning test 5개가 통과한다.
  Candidate artifact 생성과 게시는 대기 중이다.
- G54는 component 게시를 계속 기다린다. Candidate projection은 browser 0.0.7,
  editor 0.0.7, files 0.0.8, hwp 0.0.5, terminal 0.0.21, sidecar-files
  0.0.8, sidecar-vt 0.0.17을 기록한다. Registry entry나 게시 상태는 바뀌지 않았다.
