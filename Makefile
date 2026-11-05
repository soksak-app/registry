# 공개 registry 의 검사와 index build(core docs/spec/registry.md). build 는 core 의 sok 를 쓴다.
.PHONY: build test check-development-manifest build-released-sdk-fixture check-released-manifest check-candidate-manifest install-hooks

SOK ?= sok

# commit 한 항목 파일로 index.json 을 만든다. 모든 release 를 받아 sha256 과 내용을 확인한다.
build:
	$(SOK) registry build .

# Checks releases against the development SDK pinned in package.json. This is
# separate from the public registry build and publication checks.
check-development-manifest: node_modules
	@test -n "$(INDEX)" || { echo "check-development-manifest needs INDEX=<registry index>" >&2; exit 2; }
	node scripts/check-plugin-manifests.mjs --index "$(INDEX)"

build-released-sdk-fixture:
	pnpm --dir test/released-core-v0.0.20 install --frozen-lockfile

check-released-manifest: build-released-sdk-fixture
	@test -n "$(INDEX)" || { echo "check-released-manifest needs INDEX=<registry index>" >&2; exit 2; }
	node scripts/check-released-plugin-manifests.mjs --index "$(INDEX)"

check-candidate-manifest: node_modules
	@test -n "$(INDEX)" || { echo "check-candidate-manifest needs INDEX=<registry index>" >&2; exit 2; }
	@test -n "$(CORE_PLUGIN_API_DIR)" || { echo "check-candidate-manifest needs CORE_PLUGIN_API_DIR=<plugin-api package directory>" >&2; exit 2; }
	@test -n "$(CANDIDATE_VERSION)" || { echo "check-candidate-manifest needs CANDIDATE_VERSION=<version>" >&2; exit 2; }
	CORE_PLUGIN_API_DIR="$(CORE_PLUGIN_API_DIR)" CANDIDATE_VERSION="$(CANDIDATE_VERSION)" node scripts/check-candidate-plugin-manifests.mjs --index "$(INDEX)"

node_modules: package.json
	pnpm install
	touch node_modules

# The tests of the scripts and the document check (sok-check docs of the kit).
test: node_modules build-released-sdk-fixture
	node --test test/
	pnpm exec sok-check docs
	pnpm exec sok-check commands

# Sets this repository to use .githooks, which checks commit messages and records at commit time.
install-hooks:
	@git config core.hooksPath .githooks
