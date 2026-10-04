# Campanhas sazonais no site (Natal, Black Friday e outras)

Roteiro para trocar o destaque do site a cada campanha. Vale para o **topo v2** (`content/header.json` → `pe_header_v2`, ver `docs/TOPO-V2.md`) ligado com `enabled: true`. Quase tudo é editar JSON, sem mexer em código.

Fluxo de qualquer troca: `git pull --ff-only` (o painel da E-Com Plus também commita no `master`) → editar → commit → push no `master` → esperar o **Build and deploy** (~3 min) → conferir no site. O topo é gerado no build: mudar o JSON não aparece antes do deploy.

## O que muda em cada campanha

| Peça | Onde | O que trocar |
|---|---|---|
| Item sazonal do menu (hoje "Natal" com a etiqueta "NOVO") | `header.json` → `pe_header_v2.seasonal` | `label`, `tag`, `link` (categoria da campanha), `bolinha` (PNG do círculo); `enabled: false` tira o item do menu e dos stories |
| Cápsula de promoções (à direita da busca, alterna as mensagens) | `header.json` → `pe_header_v2.promos` (e `promo_rotate_ms`) | Cada mensagem: `icon`, `title`, `text`, `short` (uma linha, para o celular) e `link`. Pode ter 2, 3 ou mais; acrescente a da campanha no começo da lista |
| Banners da home | `content/home.json` → seção `banner-slider` → `slides` | Um slide por banner: `img` (computador), `mobile_img` (celular), `link`, `alt`, `start` e `end` (datas: o slide só aparece dentro do período) |
| Benefícios em pílula | `header.json` → `pe_header_v2.benefits` | Só se a campanha mudar a oferta (ex.: frete) |
| Bolinhas ("stories") | `header.json` → `pe_header_v2.stories` e o PNG em `template/public/img/uploads/` | Normalmente só o item sazonal (primeiro) muda |

## Antes de começar (pré-requisitos)

1. **Categoria da campanha** criada no admin da loja, com produtos. Hoje existe `Natal` (`/caixas-tema-natal`, filha de "Datas especiais"). **Não existe categoria de Black Friday**: criar uma (ex.: `/black-friday`) ou usar `Promoções` (`/caixas-em-promocao`).
2. **Artes dos banners** (todas do mesmo tamanho, senão a altura do banner pula entre slides):
   - computador: **1920×500** (WebP); celular: **1080×1080** (WebP). Slides sem `mobile_img` mostram a arte do computador no celular.
3. **Bolinha** da campanha: PNG com o círculo da arte no topo (as bolinhas atuais são 130×160); o texto embutido no PNG fica escondido pelo recorte.
4. Texto e regras da oferta aprovados (cupom, data de fim, mínimo de frete) e o público: Ana Paula (B2C) ou Marcos (B2B).

## Passo a passo

1. Subir as imagens para `template/public/img/uploads/` (WebP, nome em minúsculas e sem espaço).
2. `home.json`: acrescentar o slide da campanha **no começo** de `slides` com `start` e `end`. Deixar o slide antigo; ele volta sozinho depois do `end`.
3. `header.json`: trocar `seasonal` (`label`, `tag`, `link`, `bolinha`) e acrescentar a mensagem da campanha em `promos`.
4. Build local (`npm run build -- --prerender=index,app/index,search,404,blog,admin/index --prerender-limit=0`), conferir a home com 390 px e 1440 px.
5. Commit com mensagem tipo `feat(campanha): natal 2026 — banner, menu e promoções`, push no `master`, esperar o deploy e conferir no site.
6. Registrar em `site/alteracoes-no-site/` (ficha da alteração) e, se virou rotina nova, atualizar este arquivo.

## Calendário de referência (confirmar com a Daiana e o Rafael)

| Campanha | Data | Sugestão de início do destaque |
|---|---|---|
| Black Friday 2026 | sexta, 27/11/2026 | semana anterior (a partir de ~16/11) |
| Natal 2026 | 25/12/2026 | já em destaque; manter até a virada, tirar em janeiro |

Datas de início e fim são decisão de negócio: este calendário é só referência.

## Como desfazer

- Item sazonal ou promoção: voltar o valor anterior no `header.json`, commit e push no `master`.
- Banner: apagar o slide da campanha em `home.json` (ou esperar o `end`).
- Tudo do topo v2: `"enabled": false` em `pe_header_v2` (ver `docs/TOPO-V2.md`).

## Cuidados

- O `seasonal.link` precisa existir (conferir que responde 200 antes de publicar).
- Não usar texto branco sobre o laranja do cabeçalho (contraste): o texto do cabeçalho é marrom `#3F2D25`.
- A cor verde não faz parte da marca (ver `marca/design-guide.md` no workspace). Black Friday costuma pedir preto e amarelo: **não** usar sem a aprovação do Rafael; o padrão é laranja, azul, creme e marrom.
