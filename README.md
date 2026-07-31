# Clara

Editor leve de collections Postman versionadas no repositório.

- Schema em memória = JSON Postman (v2.1), sem conversão Bruno↔Postman
- Persistência no mesmo arquivo da collection
- UI inspirada no Bruno (referência visual), projeto do zero
- Execução via Newman (`Send` / `⌘Enter`; assume `newman` no PATH)

A referência visual e sua licença estão registradas em
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## Setup

```bash
make install
make dev
```

| Target | O que faz |
|--------|-----------|
| `make install` | `npm install` |
| `make dev` | Electron + Vite |
| `make build` | Build de produção |
| `make typecheck` | `tsc --noEmit` |
| `make check` | Typecheck + todas as checks de etapa |
| `make check-etapa0` | Skeleton open/save |
| `make check-etapa1` | Árvore / paths |
| `make check-etapa2` | Edição de method / URL |
| `make check-etapa3` | Headers (key / value / disabled) |
| `make check-etapa4` | Body (raw / urlencoded) |
| `make check-etapa5` | Auth (bearer / basic / apikey) |
| `make check-etapa6` | Query params (`url.query`) |
| `make check-etapa7` | Scripts (`prerequest` / `test`) |
| `make check-etapa8` | Newman run (temp collection / parse) |

## Uso (Send / Newman)

1. `make dev` — requer `newman` no `PATH` (`npm i -g newman`)
2. Abrir um request → **Send** ou `⌘/Ctrl+Enter`
3. Clara grava uma collection temporária de 1 request em `~/.clara/runs/` e chama Newman
4. O arquivo da collection no repo **não** é modificado pelo run
5. Painel **Response**: status, tempo, size, Body / Headers / Test results

## Sessão (`~/.clara`)

Clara guarda metadados de sessão em `~/.clara/session.json` (collection aberta,
abas, pasta expandida). Edits não salvos **não** entram nesse arquivo — só o
JSON da collection no disco.

## Atalhos

| Atalho | Ação |
|--------|------|
| `⌘/Ctrl+O` | Abrir collection |
| `⌘/Ctrl+S` | Salvar |
| `⌘/Ctrl+W` | Fechar aba ativa |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Próxima / anterior aba |
| `⌘/Ctrl+1…9` | Ir para a aba N |
| `⌘/Ctrl+Enter` | Send (Newman) |
| Arrastar aba | Reordenar |
| Arrastar request da árvore → barra | Abrir aba |

## Progresso

Checklist do primeiro MVP: [docs/MVP.md](./docs/MVP.md)
