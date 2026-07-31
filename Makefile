.PHONY: help install dev build typecheck check check-etapa0 check-etapa1 check-etapa2 check-etapa3 check-etapa4 check-etapa5 check-etapa6 check-etapa7

help:
	@echo "Clara — available targets:"
	@echo "  make install       Install npm dependencies"
	@echo "  make dev           Start Electron + Vite"
	@echo "  make build         Production build"
	@echo "  make typecheck     TypeScript, no emit"
	@echo "  make check         Typecheck + all etapa checks"
	@echo "  make check-etapa0  Skeleton (open/save/parse)"
	@echo "  make check-etapa1  Tree (paths / folder vs request)"
	@echo "  make check-etapa2  Request editing (method / url)"
	@echo "  make check-etapa3  Headers (key / value / disabled)"
	@echo "  make check-etapa4  Body (raw / urlencoded)"
	@echo "  make check-etapa5  Auth (bearer / basic / apikey)"
	@echo "  make check-etapa6  Query params (url.query)"
	@echo "  make check-etapa7  Scripts (prerequest / test)"

install:
	npm install

dev:
	npm run dev

build:
	npm run build

typecheck:
	npm run typecheck

check: typecheck check-etapa0 check-etapa1 check-etapa2 check-etapa3 check-etapa4 check-etapa5 check-etapa6 check-etapa7

check-etapa0:
	npm run check:etapa0

check-etapa1:
	npm run check:etapa1

check-etapa2:
	npm run check:etapa2

check-etapa3:
	npm run check:etapa3

check-etapa4:
	npm run check:etapa4

check-etapa5:
	npm run check:etapa5

check-etapa6:
	npm run check:etapa6

check-etapa7:
	npm run check:etapa7
