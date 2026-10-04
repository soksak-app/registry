# 공개 registry 의 검사와 index build(core docs/spec/registry.md). build 는 core 의 sok 를 쓴다.
.PHONY: build test

SOK ?= sok

# commit 한 항목 파일로 index.json 을 만든다. 모든 archive 를 받아 sha256 과 내용을 확인한다.
build:
	$(SOK) registry build .

test:
	node --test test/
