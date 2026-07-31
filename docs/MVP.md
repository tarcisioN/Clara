# Clara — MVP 1 (editar collection Postman)

Objetivo: abrir um `*.postman_collection.json` do repo, editar HTTP básico em memória no schema Postman, salvar no mesmo arquivo. Sem Newman nesta fase.

**Fora de escopo do MVP 1:** drag-drop, scripts/tests, OAuth avançado, GraphQL/gRPC, autosave, workspaces, sync cloud, multipart com arquivo, fork/código do Bruno.

**Como marcar progresso:** ao concluir requisito + validação, troque `- [ ]` por `- [x]`.

---

## Etapa 0 — Skeleton

App mínimo que lê e grava o JSON sem alterar a estrutura.

### Requisitos
- [x] Projeto Electron + React (ou equivalente) inicializado em `clara`
- [x] Abrir arquivo `.json` via diálogo / path
- [x] Parsear como collection Postman v2.1 (validação mínima de `info` + `item`)
- [x] Exibir `info.name` e contagem de requests/folders
- [x] Salvar o objeto em memória de volta no mesmo path
- [x] Controle de whitespace/formatação definido (ex.: 2 spaces, newline final) para diffs previsíveis

### Validação
- [x] Abrir collection real do repo de uso _(fixture `fixtures/smoke.postman_collection.json`; validar também com a collection do seu repo via UI)_
- [x] Salvar sem editar → `git diff` vazio (ou só newline/format acordado) _(save com `dirty: no` regrava o `raw` original)_
- [x] JSON continua válido para Postman/Newman _(smoke: `npm run check:etapa0`)_

---

## Etapa 1 — Árvore

Sidebar navegável com `item[]` aninhado.

### Requisitos
- [x] Renderizar pastas e requests a partir de `item[]`
- [x] Expandir/colher pasta
- [x] Selecionar request (estado: request ativo)
- [x] Distinção visual pasta vs request
- [x] Sem drag-drop, rename ou create/delete nesta etapa

### Validação
- [x] Collection grande do repo navega sem travar _(smoke fixture + UI; validar collection real via `make dev`)_
- [x] Seleção aponta para o nó correto no objeto em memória _(paths `0`, `0.0`, `1` — `make check-etapa1`)_
- [x] Reload do arquivo reconstrói a mesma árvore _(reabrir via Open reconstrói expanded + tree)_

---

## Etapa 2 — Request shell (method + URL)

Painel do request selecionado.

### Requisitos
- [x] Exibir e editar `request.method`
- [x] Exibir e editar URL:
  - [x] Se `request.url` for string → editar string
  - [x] Se for objeto → editar pelo menos `url.raw` (e manter o resto intacto no save)
- [x] Mudanças refletem no objeto Postman em memória
- [x] Ação Save explícita grava o arquivo

### Validação
- [x] Alterar method/URL → save → reopen → valores preservados
- [x] Campos não editados do `url` (host, path, query, variable) não são apagados quando só `raw` muda (ou política documentada e testada)
- [x] `newman run` (CLI) na collection salva ainda reconhece o request _(members re-derivados do raw; ver política abaixo)_

### Política de URL (decisão desta etapa)

O SDK do Postman — e portanto o Newman — resolve o request pelos **membros estruturados**
(`protocol`, `host`, `port`, `path`, `query`), não por `raw`. Editar só `raw` produziria um
arquivo que a UI mostra de um jeito e o Newman executa de outro.

Ao editar a URL, Clara reescreve `raw` **e** re-deriva os membros. É preservado o que `raw` não
consegue expressar:

- `variable` (path variables como `:id`)
- query params com `disabled: true`

`{{variáveis}}` sobrevivem ao split de host, inclusive com pontos dentro (`{{base.url}}`).

Requests gravados como string (`"request": "https://..."`) continuam string quando só a URL muda;
editar o **method** expande para objeto, porque a forma string implica `GET`.

---

## Etapa 3 — Headers

Tabela no shape Postman.

### Requisitos
- [x] Listar `request.header[]` (`key`, `value`, `disabled`, `description` se existir)
- [x] Adicionar header
- [x] Editar key/value
- [x] Toggle `disabled`
- [x] Remover header
- [x] Não inventar campos fora do schema Postman

### Validação
- [x] Edit → save → reopen → headers idênticos _(imutável + serialize; `make check-etapa3`)_
- [x] Header com `disabled: true` preservado _(omitido quando enabled; `disabled: true` quando off)_
- [x] Diff no git mostra só o que foi editado _(description e campos extras do header são preservados)_

---

## Etapa 4 — Body

Modos usados no fluxo real.

### Requisitos
- [x] Ler/escrever `request.body.mode`
- [x] Suporte `raw` (editor texto/JSON)
- [x] Suporte `urlencoded` (lista key/value/disabled)
- [ ] (Opcional MVP) `formdata` sem file upload _(adiado)_
- [x] Preservar `body.options` / language quando existirem e não forem editados

### Validação
- [x] Collection com bodies reais do repo: save não corrompe body _(fixture + `make check-etapa4`)_
- [x] Trocar conteúdo `raw` → reopen OK
- [x] Modos não usados na UI permanecem intactos no JSON _(troca de mode preserva payloads irmãos; graphql fica read-only)_

### Política de body

Trocar `mode` **não apaga** `raw` / `urlencoded` / `formdata` / `graphql` / `options`. Só muda
qual payload o Newman envia. Modos fora de `none|raw|urlencoded` aparecem como read-only até
você escolher um modo editável.

---

## Etapa 5 — Auth básico

Só o necessário para o fluxo atual.

### Requisitos
- [x] Suportar `request.auth` nos tipos: `bearer`, `basic`, `apikey` (marque os que forem implementados)
  - [x] bearer
  - [x] basic
  - [x] apikey
- [x] Editar no formato Postman (`type` + array de `{key, value}`)
- [x] Permitir `auth: null` / herança de pasta sem destruir auth de pasta/collection

### Validação
- [x] Token/credencial salvos no JSON no formato Postman _(arrays `bearer`/`basic`/`apikey` com `key`/`value`/`type`)_
- [x] `newman run` autentica como antes (smoke no CLI) _(shape idêntico ao Postman; smoke automatizado no check)_
- [x] Request sem auth permanece sem auth _(Inherit remove `request.auth`)_

### Política de auth

| UI | JSON |
|----|------|
| Inherit auth | sem `request.auth` → herda pasta/collection |
| No auth | `{ "type": "noauth" }` |
| Bearer / Basic / API key | `{ "type": "...", "<type>": [ { key, value, type } ] }` |

Trocar o tipo **não apaga** arrays irmãos (`bearer` permanece ao mudar para `basic`). Auth de pasta/collection não é editável nesta etapa — só preservado.

---

## Etapa 6 — Query params

### Requisitos
- [x] Quando `url` for objeto: editar `url.query[]` (`key`, `value`, `disabled`)
- [x] Add / edit / toggle / remove
- [x] Política clara se `url` for string (ex.: não oferecer query editor até converter, ou só editar via `raw`)

### Validação
- [x] Params não corrompem `url.raw` / `host` / `path` (ou sync documentado e testado)
- [x] Save → reopen → query idêntica _(imutável + serialize; `make check-etapa6`)_

### Política de query

- URL **objeto**: tabela edita `query[]` e **reconstrói `raw`** a partir dos membros (params
  `disabled` ficam em `query[]` mas saem do `raw`). `host` / `path` / `variable` intactos.
- URL **string**: sem tabela; dá para editar query no campo URL, ou clicar
  **Convert URL to object** (promove para objeto estruturado) e usar a tabela.

---

## Etapa 7 — Scripts (prerequest / test)

### Requisitos
- [x] Tabs **Pre-request** e **Tests** no request pane
- [x] Editar `item.event[]` com `listen: prerequest` e `listen: test`
- [x] `script.exec[]` ↔ textarea (join/split por `\n`)
- [x] Preservar campos irmãos (`id`, `type`, outros events)
- [x] Indicador na tab quando o script tem conteúdo

### Validação
- [x] Save → reopen → scripts idênticos _(imutável + serialize; `make check-etapa7`)_
- [x] Request sem `event` ganha entries ao editar; siblings intactos

---

## Etapa UX — Shell Bruno-inspired (obrigatória)

A UI deve ter a densidade e o fluxo de trabalho de um API client desktop, não aparência de
formulário genérico.

### Requisitos
- [x] Janela inteira: title bar compacta + sidebar + workspace + status bar
- [x] Sidebar de collection densa, com estados hover/selected e cores por método
- [x] Barra com múltiplas tabs de request abertas (abrir, focar, fechar)
- [x] Dirty state por request, não global — cada tab mostra o próprio indicador
- [x] Arrastar request da árvore para a barra de tabs abre uma nova tab
- [x] Nome longo na tab desvanece no final em vez de cortar com reticências
- [x] Sessão persistida em `~/.clara/session.json` (collection, abas, expanded)
- [x] Atalhos: Open/Save/Close tab/Next/Prev/Tab 1–9
- [x] Arrastar abas para reordenar
- [x] Toolbar method + URL + Send (Newman)
- [x] Tabs internas `Params | Body | Headers | Auth | Pre-request | Tests`
- [x] Paleta light inspirada no Bruno (laranja de marca, superfícies neutras, bordas discretas)
- [x] Tabelas key/value compactas, sem cards empilhados
- [x] Chrome nativo integrado no macOS (`hiddenInset`)

### Validação visual
- [ ] Fluxo principal utilizável sem scroll vertical entre Params/Body/Headers/Auth
- [ ] Hierarquia visual comparável ao Bruno: collection → request tab → request toolbar → pane
- [ ] Densidade da sidebar e das tabelas adequada para collection real
- [ ] Open/Save e dirty state fáceis de localizar

---

## Etapa 8 — Environments (opcional no MVP 1)

Pode ficar para um mini-MVP 1.1 se atrasar o resto.

### Requisitos
- [ ] Abrir `.postman_environment.json` separado
- [ ] Listar `values[]` (key, value, enabled)
- [ ] Seletor de environment ativo
- [ ] (Opcional) preview de `{{var}}` na URL — interpolação real fica com Newman

### Validação
- [ ] Env do repo carrega e valores batem com Postman
- [ ] Save do env (se editável) não corrompe o arquivo

---

## Definition of Done — MVP 1

- [ ] Etapas 0–6 concluídas (7 opcional)
- [ ] Etapa UX validada
- [ ] Fluxo: abrir collection do repo → editar method/URL/headers/body/auth/query → save
- [ ] Diffs git legíveis; sem campos Bruno ou metadados inventados
- [ ] Smoke: `newman run <collection.json>` na collection editada funciona no terminal
- [ ] README atualizado com como abrir/salvar

---

## MVP 2 — Run com Newman

Pressuposto: `newman` está no `PATH` do usuário. Ajuda de instalação fica para depois.

### Etapa R0 — Send de um request
- [x] Botão **Send** habilitado (atalho `⌘/Ctrl+Enter`)
- [x] Montar collection temporária com **1 item** (estado em memória, não o arquivo do repo)
- [x] Copiar `collection.variable` / `collection.auth`; se o request herda auth de pasta, materializar no temp
- [x] Escrever em `~/.clara/runs/`, spawn `newman run … --reporters json`
- [x] Collection do repo **não** é alterada pelo run
- [x] Painel de response: status, tempo, size, headers, body
- [x] Falhas / stderr do Newman visíveis
- [x] `make check-etapa8`

### Etapa R1 — (depois) Environment + collection run
- [ ] `-e` com environment aberto
- [ ] Run da collection / folder inteira
- [ ] Detectar Newman ausente e orientar instalação

### Validação
- [x] Resultado alinhado ao `newman` no terminal para o mesmo request _(parse + temp collection; smoke manual na UI)_
- [x] Edits não salvos entram no run (temp usa memória)

---

## Referência rápida — schema em memória

Fonte da verdade: Postman Collection v2.1.

```
Collection
├── info
├── item[]          # folder | request
│   ├── name
│   ├── item[]?     # pasta
│   └── request?    # method, url, header[], body, auth
├── variable[]?
└── auth?
```

UI inspira-se no Bruno (layout split, tabelas key/value, response pane). Store e persistência são Postman-only.
