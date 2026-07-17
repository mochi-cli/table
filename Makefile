SHELL := /usr/bin/env bash

SQLITE_DB ?= ./data/mochi-table.sqlite

.DEFAULT_GOAL := help

.PHONY: help sqlite.init sqlite.smoke sqlite.reset dev.backend

help:
	@echo "Mochi Table local commands"
	@echo ""
	@echo "  make sqlite.init    Create or update the local SQLite database"
	@echo "  make sqlite.smoke   Run the SQLite repository smoke test"
	@echo "  make sqlite.reset   Remove and recreate the local SQLite database"
	@echo "  make dev.backend    Start backend with Mochi local SQLite flags"

sqlite.init:
	node packages/mochi-sqlite/init-sqlite.mjs $(SQLITE_DB)

sqlite.smoke:
	node packages/mochi-sqlite/examples/smoke.mjs $(SQLITE_DB)

sqlite.reset:
	rm -f $(SQLITE_DB)
	$(MAKE) sqlite.init

dev.backend:
	MOCHI_LOCAL_AUTH_DISABLED=true \
	NEXT_PUBLIC_MOCHI_LOCAL_AUTH_DISABLED=true \
	MOCHI_SQLITE_ENABLED=true \
	MOCHI_SQLITE_DATABASE_PATH=$(SQLITE_DB) \
	pnpm -F @teable/backend dev
