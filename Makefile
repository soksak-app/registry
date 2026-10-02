# 로컬 registry 의 build 와 test(docs/features.md). build 는 core 의 sok 를 쓴다.
.PHONY: build test

SOK ?= sok

# 선언된 plugin 과 sidecar repository 의 archive 를 releases/ 에 쓰고 index.json 을 만든다.
build:
	node scripts/build.mjs --sok $(SOK)

test:
	node --test test/
