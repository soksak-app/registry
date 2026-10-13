# 공개 registry 의 검사와 index build(core docs/spec/registry.md). build 는 core 의 sok 를 쓴다.
.PHONY: build test hooks

SOK ?= sok

# commit 한 항목 파일로 index.json 을 만든다. 모든 release 를 받아 sha256 과 내용을 확인한다.
build:
	$(SOK) registry build .

node_modules: package.json
	pnpm install
	touch node_modules

# The tests of the scripts and the record check of core (soksak-records of @soksak/plugin-api).
test: node_modules
	node --test test/
	pnpm exec soksak-records

# Sets this repository to use .githooks, which checks commit messages and records at commit time.
hooks:
	@git config core.hooksPath .githooks
