SHELL := /usr/bin/env bash

SQLITE_DB ?= ./data/mochi-table.sqlite

.DEFAULT_GOAL := help

.PHONY: help sqlite.init sqlite.smoke sqlite.verify mochi.test mochi.typecheck sqlite.reset dev.backend dev.app

help:
	@echo "Mochi Table local commands"
	@echo ""
	@echo "  make sqlite.init    Create or update the local SQLite database"
	@echo "  make sqlite.smoke   Run the SQLite repository smoke test"
	@echo "  make sqlite.verify  Run assertions for SQLite local engine"
	@echo "  make mochi.test     Run Mochi backend tests and SQLite verification"
	@echo "  make mochi.typecheck Typecheck Mochi SQLite backend and app surfaces"
	@echo "  make sqlite.reset   Remove and recreate the local SQLite database"
	@echo "  make dev.backend    Start backend with Mochi local SQLite flags"
	@echo "  make dev.app        Start Next.js local workspace UI"

sqlite.init:
	node packages/mochi-sqlite/init-sqlite.mjs $(SQLITE_DB)

sqlite.smoke:
	node packages/mochi-sqlite/examples/smoke.mjs $(SQLITE_DB)

sqlite.verify:
	node packages/mochi-sqlite/examples/verify.mjs

mochi.typecheck:
	pnpm -F @teable/backend mochi:typecheck
	pnpm --dir apps/nextjs-app typecheck

mochi.test:
	pnpm -F @mochi/table-sqlite verify
	pnpm -F @teable/backend mochi:test
	pnpm --dir apps/nextjs-app typecheck

sqlite.reset:
	rm -f $(SQLITE_DB)
	$(MAKE) sqlite.init

dev.backend:
	MOCHI_LOCAL_AUTH_DISABLED=true \
	NEXT_PUBLIC_MOCHI_LOCAL_AUTH_DISABLED=true \
	MOCHI_SQLITE_ENABLED=true \
	MOCHI_SQLITE_DATABASE_PATH=$(SQLITE_DB) \
	pnpm -F @teable/backend dev

dev.app:
	MOCHI_BACKEND_API_URL=http://localhost:3001 \
	pnpm -C apps/nextjs-app exec next dev
