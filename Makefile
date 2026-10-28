# 공개 registry 의 검사와 index build(core docs/spec/registry.md). build 는 core 의 sok 를 쓴다.
.PHONY: build test development-manifest-check released-sdk-fixture released-manifest-check candidate-manifest-check candidate-release hooks

SOK ?= sok

# commit 한 항목 파일로 index.json 을 만든다. 모든 release 를 받아 sha256 과 내용을 확인한다.
build:
	$(SOK) registry build .

# Checks releases against the development SDK pinned in package.json. This is
# separate from the public registry build and publication checks.
development-manifest-check: node_modules
	@test -n "$(INDEX)" || { echo "development-manifest-check needs INDEX=<registry index>" >&2; exit 2; }
	node scripts/check-plugin-manifests.mjs --index "$(INDEX)"

released-sdk-fixture:
	pnpm --dir test/released-core-v0.0.20 install --frozen-lockfile

released-manifest-check: released-sdk-fixture
	@test -n "$(INDEX)" || { echo "released-manifest-check needs INDEX=<registry index>" >&2; exit 2; }
	node scripts/check-released-plugin-manifests.mjs --index "$(INDEX)"

candidate-manifest-check: node_modules
	@test -n "$(INDEX)" || { echo "candidate-manifest-check needs INDEX=<registry index>" >&2; exit 2; }
	@test -n "$(CORE_PLUGIN_API_DIR)" || { echo "candidate-manifest-check needs CORE_PLUGIN_API_DIR=<plugin-api package directory>" >&2; exit 2; }
	@test -n "$(CANDIDATE_VERSION)" || { echo "candidate-manifest-check needs CANDIDATE_VERSION=<version>" >&2; exit 2; }
	CORE_PLUGIN_API_DIR="$(CORE_PLUGIN_API_DIR)" CANDIDATE_VERSION="$(CANDIDATE_VERSION)" node scripts/check-candidate-plugin-manifests.mjs --index "$(INDEX)"

# Builds a private candidate index and proof. It never publishes the index.
candidate-release: node_modules
	@test -n "$(CANDIDATE_ENTRIES)" || { echo "candidate-release needs CANDIDATE_ENTRIES=<registry declarations>" >&2; exit 2; }
	@test -n "$(CORE_SOURCE_DIR)" || { echo "candidate-release needs CORE_SOURCE_DIR=<core checkout>" >&2; exit 2; }
	@test -n "$(CORE_PLUGIN_API_DIR)" || { echo "candidate-release needs CORE_PLUGIN_API_DIR=<plugin-api package>" >&2; exit 2; }
	@test -n "$(OUT)" || { echo "candidate-release needs OUT=<private output directory>" >&2; exit 2; }
	node scripts/build-candidate-release.mjs --entries "$(CANDIDATE_ENTRIES)" --core "$(CORE_SOURCE_DIR)" --api "$(CORE_PLUGIN_API_DIR)" --sok "$(SOK)" --out "$(OUT)"

node_modules: package.json
	pnpm install
	touch node_modules

# The tests of the scripts and the record check of core (soksak-records of @soksak/plugin-api).
test: node_modules released-sdk-fixture
	node --test test/
	pnpm exec soksak-records

# Sets this repository to use .githooks, which checks commit messages and records at commit time.
hooks:
	@git config core.hooksPath .githooks
