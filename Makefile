# 공개 registry 의 검사와 index build(core docs/spec/registry.md). build 는 core 의 sok 를 쓴다.
.PHONY: build test check-development-manifest check-push install-hooks

SOK ?= sok

# commit 한 항목 파일로 index.json 을 만든다. 모든 release 를 받아 sha256 과 내용을 확인한다.
build:
	$(SOK) registry build .

# Checks releases against the development SDK pinned in package.json. This is
# separate from the public registry build and publication checks.
check-development-manifest: node_modules
	@test -n "$(INDEX)" || { echo "check-development-manifest needs INDEX=<registry index>" >&2; exit 2; }
	node scripts/check-plugin-manifests.mjs --index "$(INDEX)"

node_modules: package.json
	pnpm install
	touch node_modules

# The tests of the scripts and the document check (sok-check docs of the kit).
test: node_modules
	node --test test/
	pnpm exec sok-check docs
	pnpm exec sok-check commands

# The checks that a push needs: the commit messages and the checklist history of the pushed range, because a published
# commit is kept; CI runs the tests on the pushed commits.
# RANGE holds the commits of the pushed refs; the pre-push hook sets it, and it defaults to origin/main..HEAD.
check-push:
	pnpm exec sok-check commits "$(or $(RANGE),origin/main..HEAD)"
	pnpm exec sok-check docs --range "$(or $(RANGE),origin/main..HEAD)"

# Sets this repository to use .githooks, which checks commit messages and records at commit time.
install-hooks:
	@git config core.hooksPath .githooks
