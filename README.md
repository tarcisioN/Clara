# Clara

Editor leve de collections Postman versionadas no repositório.

- Schema em memória = JSON Postman (v2.1), sem conversão Bruno↔Postman
- Persistência no mesmo arquivo da collection
- UI inspirada no Bruno (referência visual), projeto do zero
- Execução via Newman (fase posterior ao MVP de edição)

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

## Uso (Etapa 6)

1. `make dev`
2. **Ping** → query table (`verbose` on, `trace` disabled; `raw` sem o disabled)
3. **Root echo** (URL string) → Convert URL to object para habilitar a tabela
4. Editar query reconstrói `raw`; host/path/`variable` permanecem
5. **Save •** grava o mesmo JSON

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
| Arrastar aba | Reordenar |
| Arrastar request da árvore → barra | Abrir aba |

## Progresso

Checklist do primeiro MVP: [docs/MVP.md](./docs/MVP.md)
