SHELL := /usr/bin/env bash

SQLITE_DB ?= $(CURDIR)/data/mochi-table.sqlite

.DEFAULT_GOAL := help

.PHONY: help sqlite.init sqlite.smoke sqlite.verify mochi.test mochi.typecheck mochi.local.verify mochi.browser.verify mochi.browser-workflows.verify mochi.integrity.verify mochi.realtime.verify mochi.table-metadata.verify mochi.field-header.verify mochi.view-lifecycle.verify mochi.selection.verify mochi.history.verify mochi.base-node.verify mochi.computed.verify mochi.cleanup sqlite.reset dev.backend dev.app

help:
	@echo "Mochi Table local commands"
	@echo ""
	@echo "  make sqlite.init    Create or update the local SQLite database"
	@echo "  make sqlite.smoke   Run the SQLite repository smoke test"
	@echo "  make sqlite.verify  Run assertions for SQLite local engine"
	@echo "  make mochi.test     Run Mochi backend tests and SQLite verification"
	@echo "  make mochi.typecheck Typecheck Mochi SQLite backend and app surfaces"
	@echo "  make mochi.local.verify Run all local Mochi non-browser checks"
	@echo "  make mochi.browser.verify Verify local header table UI in Playwright"
	@echo "  make mochi.browser-workflows.verify Verify local view/selection/history/realtime UI workflows"
	@echo "  make mochi.integrity.verify Verify local SQLite integrity guards"
	@echo "  make mochi.realtime.verify Verify local view header realtime setView path"
	@echo "  make mochi.table-metadata.verify Verify local table metadata update path"
	@echo "  make mochi.field-header.verify Verify local field header update path"
	@echo "  make mochi.view-lifecycle.verify Verify local view create/duplicate/delete path"
	@echo "  make mochi.selection.verify Verify local selection copy/paste/clear/delete/duplicate path"
	@echo "  make mochi.history.verify Verify local record history API path"
	@echo "  make mochi.base-node.verify Verify local base-node and login-free stub paths"
	@echo "  make mochi.computed.verify Verify local formula, lookup/rollup, and computed job API paths"
	@echo "  make mochi.cleanup  Remove known local smoke-test tables/views"
	@echo "  make sqlite.reset   Remove and recreate the local SQLite database"
	@echo "  make dev.backend    Start backend with Mochi local SQLite flags"
	@echo "  make dev.app        Start Next.js local workspace UI"

sqlite.init:
	node packages/mochi-sqlite/init-sqlite.mjs "$(SQLITE_DB)"

sqlite.smoke:
	node packages/mochi-sqlite/examples/smoke.mjs "$(SQLITE_DB)"

sqlite.verify:
	node packages/mochi-sqlite/examples/verify.mjs

mochi.typecheck:
	pnpm -F @teable/backend mochi:typecheck
	pnpm --dir apps/nextjs-app typecheck

mochi.test:
	pnpm -F @mochi/table-sqlite verify
	pnpm -F @teable/backend mochi:test
	pnpm --dir apps/nextjs-app typecheck

mochi.local.verify:
	$(MAKE) mochi.test
	pnpm --dir apps/nextjs-app exec vitest run src/pages/mochi/local-data-mutation.spec.ts
	$(MAKE) mochi.realtime.verify
	$(MAKE) mochi.table-metadata.verify
	$(MAKE) mochi.field-header.verify
	$(MAKE) mochi.view-lifecycle.verify
	$(MAKE) mochi.selection.verify
	$(MAKE) mochi.history.verify
	$(MAKE) mochi.base-node.verify
	$(MAKE) mochi.computed.verify

mochi.browser.verify:
	node scripts/verify-mochi-local-browser.cjs

mochi.browser-workflows.verify:
	node scripts/verify-mochi-local-browser-workflows.cjs

mochi.integrity.verify:
	node scripts/verify-mochi-local-integrity.cjs "$(SQLITE_DB)"

mochi.realtime.verify:
	node scripts/verify-mochi-local-realtime.cjs

mochi.table-metadata.verify:
	node scripts/verify-mochi-local-table-metadata.cjs

mochi.field-header.verify:
	node scripts/verify-mochi-local-field-header.cjs

mochi.view-lifecycle.verify:
	node scripts/verify-mochi-local-view-lifecycle.cjs

mochi.selection.verify:
	node scripts/verify-mochi-local-selection.cjs

mochi.history.verify:
	node scripts/verify-mochi-local-history.cjs

mochi.base-node.verify:
	node scripts/verify-mochi-local-base-node.cjs

mochi.computed.verify:
	node scripts/verify-mochi-local-computed.cjs

mochi.cleanup:
	node scripts/cleanup-mochi-local-smoke-data.cjs "$(SQLITE_DB)"

sqlite.reset:
	rm -f "$(SQLITE_DB)"
	$(MAKE) sqlite.init

dev.backend:
	MOCHI_LOCAL_AUTH_DISABLED=true \
	NEXT_PUBLIC_MOCHI_LOCAL_AUTH_DISABLED=true \
	MOCHI_SQLITE_ENABLED=true \
	MOCHI_SQLITE_DATABASE_PATH="$(SQLITE_DB)" \
	pnpm -F @teable/backend mochi:dev

dev.app:
	MOCHI_BACKEND_API_URL=http://localhost:3001 \
	pnpm -C apps/nextjs-app exec next dev
