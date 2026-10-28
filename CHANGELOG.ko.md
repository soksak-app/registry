# 변경 기록

## 미출시

- G53.3은 하나의 registry 선언에서 비공개 candidate index와 proof를 만든다.
  Proof는 candidate SDK API tree가 선언된 source commit 및 현재 checkout과
  모두 일치하는지, 대체 plugin 호환성 검사가 비어 있지 않고 정확한지 요구한다.
  source drift, 빈 projection, 초과 검사 사례를 포함한 owning test 5개가 통과한다.
  Candidate artifact 생성과 게시는 대기 중이다.
- G54는 component 게시를 계속 기다린다. Candidate projection은 browser 0.0.7,
  editor 0.0.7, files 0.0.8, hwp 0.0.5, terminal 0.0.21, sidecar-files
  0.0.8, sidecar-vt 0.0.17을 기록한다. Registry entry나 게시 상태는 바뀌지 않았다.
