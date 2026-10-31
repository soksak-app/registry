# 변경 기록

## 미출시

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
