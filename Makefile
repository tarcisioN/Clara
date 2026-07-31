.PHONY: help install dev build typecheck check check-stage0 check-stage1 check-stage2 check-stage3 check-stage4 check-stage5 check-stage6 check-stage7 check-stage8 check-stage9 check-stage10 check-stage11 check-stage12 check-stage13 check-stage14 check-stage15 check-stage16 check-stage17

help:
	@echo "Clara — available targets:"
	@echo "  make install       Install npm dependencies"
	@echo "  make dev           Start Electron + Vite"
	@echo "  make build         Production build"
	@echo "  make typecheck     TypeScript, no emit"
	@echo "  make check         Typecheck + all stage checks"
	@echo "  make check-stage0  Skeleton (open/save/parse)"
	@echo "  make check-stage1  Tree (paths / folder vs request)"
	@echo "  make check-stage2  Request editing (method / url)"
	@echo "  make check-stage3  Headers (key / value / disabled)"
	@echo "  make check-stage4  Body (raw / urlencoded)"
	@echo "  make check-stage5  Auth (bearer / basic / apikey)"
	@echo "  make check-stage6  Query params (url.query)"
	@echo "  make check-stage7  Scripts (prerequest / test)"
	@echo "  make check-stage8  Newman run (temp collection / parse)"
	@echo "  make check-stage9  Variables + tree structure (rename/delete/duplicate)"
	@echo "  make check-stage10 Multi-collection (tab keys / session v3→v4)"
	@echo "  make check-stage11 Environments (parse/edit/dirty / session v4)"
	@echo "  make check-stage12 Git compare plumbing (discover / show at ref)"
	@echo "  make check-stage13 Git structural tree diff (markers / changed-only)"
	@echo "  make check-stage14 Git semantic request diff (section badges)"
	@echo "  make check-stage15 Git change list flatten / navigation order"
	@echo "  make check-stage16 Git compare base selector / session bases"
	@echo "  make check-stage17 Git restore from base + env/variable keyed diff"

install:
	npm install

dev:
	npm run dev

build:
	npm run build

typecheck:
	npm run typecheck

check: typecheck check-stage0 check-stage1 check-stage2 check-stage3 check-stage4 check-stage5 check-stage6 check-stage7 check-stage8 check-stage9 check-stage10 check-stage11 check-stage12 check-stage13 check-stage14 check-stage15 check-stage16 check-stage17

check-stage0:
	npm run check:stage0

check-stage1:
	npm run check:stage1

check-stage2:
	npm run check:stage2

check-stage3:
	npm run check:stage3

check-stage4:
	npm run check:stage4

check-stage5:
	npm run check:stage5

check-stage6:
	npm run check:stage6

check-stage7:
	npm run check:stage7

check-stage8:
	npm run check:stage8

check-stage9:
	npm run check:stage9

check-stage10:
	npm run check:stage10

check-stage11:
	npm run check:stage11

check-stage12:
	npm run check:stage12

check-stage13:
	npm run check:stage13

check-stage14:
	npm run check:stage14

check-stage15:
	npm run check:stage15

check-stage16:
	npm run check:stage16

check-stage17:
	npm run check:stage17
