# Quadros personalizados da home

Fileira de quadros brancos logo abaixo do banner da home, como a do Mercado Livre, **com o mesmo tamanho** (medido nos prints do Rafael, 04/10): quadro de **184 × 286 px**, 16 px entre quadros, 6 visíveis em 1184 px; banner de **283 px** de altura no computador, com 18 px até os quadros (do menu até os quadros são 301 px, como no ML). **Celular** (print do Rafael): quadro de **149 × 225 px** com 13 px entre quadros (~2 visíveis, rola de lado) e banner em cartão de cantos arredondados, 16 px de margem, proporção 8:3 (358 × 134 em 390 px). Cada quadro mostra **1 produto** (título do quadro, foto, nome em 2 linhas, preço; com preço antigo riscado e % OFF quando está em promoção, e a linha "em até Nx de R$ X" + "sem juros" quando a loja não cobra juros). As parcelas usam a configuração de pagamento da loja (`window.storefront.info.list_payments.installments_option`, a mesma do tema: mínimo de R$ 5 por parcela e máximo da loja); sem ela, ou com preço baixo demais, a linha fica vazia. Seta para rolar de lado no computador; no celular, rola com o dedo. A linha "Frete grátis" **não existe de propósito**: o frete grátis depende do CEP e do mínimo do carrinho, e a home não sabe isso por produto.

**Status (04/10/2026):** código no ar desde `7efb2336`; artes novas dos banners (1920×380 e 1000×375) e **chave ligada** em seguida, no mesmo dia (commit `feat(quadros): liga quadros personalizados`). Banners: `banner-florzinhas-*` e `banner-caixas-bolos-premium-*` em `template/public/img/uploads/`, referenciados no `banner-slider` de `content/home.json` (`img` computador, `mobile_img` celular). Setas do banner reduzidas e coladas na borda (as do tema cobriam o texto das artes).

**Backup antes da entrega:** branch `backup/antes-quadros-20261004`, SHA `70194aeffd905e8cd9a91d57257d4421ce6a2d04` (o `master` de 04/10/2026).

## Quadros

Até 9 quadros, nesta ordem; o que não tiver produto exibível é pulado e nenhum produto aparece em dois quadros.

| Quadro | De onde vem | Aparece |
|---|---|---|
| Visto recentemente | produtos abertos pelo cliente (PDP), o mais recente primeiro | cliente com histórico |
| Sua busca | último termo buscado (`/search?term=`) | cliente que já buscou |
| Também te interessa | `recommended.json` dos 2 últimos vistos, sem os que ele já viu | cliente com histórico |
| Mais vendidos | `EcomSearch` com `sort: sales` | sempre |
| Promoções | `EcomSearch` com `sort: offers`, só os que estão em promoção (`onPromotion`) | sempre |
| Novidades | `EcomSearch` com `sort: news` (id decrescente) | sempre |
| Caixas p/ Transporte, Caixas para presente, Forminhas | o mais vendido de cada categoria (mesmos ids e nomes das prateleiras da home) | sempre; completam a fileira em 6 quadros para o visitante novo, como no ML |

Cliente novo vê os 6 de reserva (preenchem a largura; com mais de 6 aparece a seta). Um produto só é exibido se estiver disponível, visível, com estoque, preço maior que zero, foto e slug. Se nada for exibível, a seção se esconde.

## Privacidade

Tudo fica só no navegador (`localStorage`): `pe-boxes-viewed` (até 12 ids de produto) e `pe-boxes-term` (último termo, até 80 caracteres). Nada é enviado a servidor e nenhum evento de analytics leva dado pessoal. Não há botão de "limpar histórico" (decisão do Rafael). **O registro vale em todas as páginas mesmo com a seção desligada** (decisão do Rafael, 04/10: quem já navegou chega à home personalizada no dia em que ligar); só a exibição depende da chave.

## Chave liga/desliga

`content/home.json` → seção `{ "type": "personalized-boxes", "enabled": false }`, logo depois do `banner-slider`. A home é gerada no build: depois de mudar, é preciso commit, push no `master` e esperar o **Build and deploy**. A seção também está registrada no painel (`template/js/cms/sections.js`) para o editor da home não estranhar o tipo.

- **Ligar:** `"enabled": true`, num commit só para isso (`feat(quadros): liga quadros personalizados`), depois de o merge com `false` ter terminado o deploy.
- **Rollback:** voltar `"enabled"` para `false`, commit e push no `master`.
- **Reversão integral:** `git revert` dos commits `feat(quadros):`, do mais recente para o mais antigo. Nunca `reset --hard` com push forçado.

Com `false` a home sai **idêntica** à do `master` anterior (conferido: build das duas, HTML normalizado, 0 diferenças fora da prateleira "Forminhas", que embaralha de propósito). Só o JS e o CSS ganham código novo (o JS grava o histórico; o CSS fica sob `.pe-boxes`).

## Onde está

| Arquivo | Papel |
|---|---|
| `content/home.json` | seção `personalized-boxes` (a chave). |
| `template/pages/@/sections/personalized-boxes.ejs` | contêiner vazio com as setas; o `<noscript>` esconde a área sem JS. |
| `template/js/custom-js/personalized-boxes/core.js` | funções puras: histórico (`addViewed`, `readViewed`, `saveTerm`, `readTerm`), `composeBoxes`, `sortByViewed`, `escapeHtml`. Testadas. |
| `template/js/custom-js/personalized-boxes/index.js` | registra a visita (PDP e `/search`), busca os produtos (`EcomSearch`, `graphs`) e monta os quadros. Importado em `custom-js/pages.js`. |
| `template/scss/custom-css/_personalized-boxes.scss` | todo o CSS, sob `.pe-boxes` (importado no fim de `_styles.scss`). Quadro de largura fixa (184 px) em qualquer tela e altura reservada de 296 px antes do JS montar (CLS 0). Também fixa o banner em 280 px no computador **só quando os quadros estão na página** (`.pe-h2.banner-slider:has(~ .pe-boxes)`). |
| `template/js/cms/sections.js` | registra o tipo no painel. |
| `tests/freight.test.cjs` | testes `quadros:` (limite, duplicados, JSON quebrado, storage bloqueado, escape, chave desligada). |

## Cores e texto (marca)

Cartão branco com borda `#e9eef6` e raio 16 px; texto marrom `#3F2D25`; "% OFF" em `#874015` (o mesmo tom de destaque do topo v2, com contraste sobre branco). Quicksand herdada do tema. Sem verde. Títulos dos quadros neutros para Ana Paula (B2C) e Marcos (B2B).

## Validação

`node --test tests/freight.test.cjs` e `npm run build -- --prerender=index,app/index,search,404,blog,admin/index --prerender-limit=0`.

Conferido com a chave ligada só localmente (`npm run serve`, nunca commitada): cliente novo (3 quadros de reserva), cliente com histórico (produto aberto + busca "fita de cetim" → 6 quadros), seta do computador, rolagem no celular sem rolagem lateral da página, imagens carregando, preço do quadro "Promoções" igual ao da API da loja (R$ 1,00, base R$ 2,74, sem vigência), CLS 0.

## Limitações conhecidas

- **Banner novo precisa de arte própria.** Com os quadros ligados o banner do computador tem 280 px e do celular é um cartão 8:3. Artes antigas (1920×500, 1597×700, 1080×1080) ficam cortadas; as novas (1920×380 e 1000×375, zona segura x 60–1000 / y 50–330 e margem de 60 px) já foram feitas para esses formatos. Qualquer banner novo deve seguir os gabaritos.
- **Banner do celular sem o "espiar" do próximo slide:** o ML mostra um pedaço do slide seguinte; aqui o banner é um cartão único (o carrossel é o do tema).
- **Promoção vencida:** o índice de busca não devolve `price_effective_date`; então o quadro "Promoções" só testa `base_price > price`. Hoje não há esse caso (a ficha 18 limpou as vencidas), mas se voltar a existir, a correção é buscar o produto em `/products/<id>.json` antes de exibir.

## Fora do escopo

"Compre novamente" (precisa de login/compras do cliente); botão de limpar histórico; linha "Frete grátis" e quadros informativos do visitante sem login; qualquer mudança no checkout.

## Ajustes de 04/10/2026 (conferência com os prints do ML)
- **Título espremido:** o quadro "Promoções" (uma linha a mais: preço antigo) estourava os 286 px e o título virava 3 px de altura. Agora o título nunca encolhe e quem cede espaço é a foto (`flex: 1 1 108px`, mínimo 56 px).
- **Fileira que não preenchia a largura:** sem histórico eram 3 quadros (5 com histórico), deixando vazio à direita. Entraram 3 quadros de categoria como reserva (até 9 no total) e a fileira fica centralizada quando sobra espaço.
- **Altura:** banner 283 px e margem de 18 px, somando 301 px do menu até os quadros (medido no ML).

## Quadros maiores (04/10/2026)
Pedido do Rafael ("aumenta o tamanho dos quadros e joga as categorias um pouco mais pra baixo"): quadro do computador de 184 × 286 para **224 × 350 px** (5 por linha; título 16 px, nome 15 px, preço 22 px, foto até 140 px; reserva de altura 360 px) e margem de **40 px** abaixo da fileira (era 8 px), empurrando as bolinhas de categorias. O celular não mudou (149 × 225). Backup antes: `backup/antes-quadros-maiores-20261004` (`d2021f96`).

## Configuração pelo painel (04/10/2026)
Na home do painel, a seção "Quadros personalizados (histórico do navegador)" tem campos para: **máximo de quadros** (3 a 12, padrão 9), **o título de cada um dos 6 quadros automáticos** (vazio = padrão) e a lista **"Quadros de categoria"** (até 6; cada item = categoria da loja + título opcional, vazio = nome da categoria; mostra o mais vendido da categoria). O conteúdo em si continua automático (histórico do cliente, mais vendidos, promoções, novidades). Valores atuais gravados em `content/home.json` (iguais ao que estava no ar: nada muda ao salvar sem editar).

Como funciona: `personalized-boxes.ejs` grava a configuração no atributo `data-config` da seção; `index.js` lê e passa por `normalizeConfig` (`core.js`, testada): campo ausente ou inválido cai no padrão, título limitado a 40 caracteres, máximo entre 1 e 12, lista de categorias vazia = sem quadros de categoria. Categoria do painel vem como `<id>:categories:<nome>:<caminho>` (mesmo formato das prateleiras). Mudança no painel gera commit no `master` e o deploy normal (~3 min).

## Painel: seções da loja carregadas (04/10/2026)
O painel (`/admin/`, login pela E-Com Plus) **não carregava** `template/js/cms/sections.js`: mostrava "Error: item has illegal 'type' property" para `personalized-boxes` e também para `categories-carousel` (que já existia). Agora `template/js/admin.js` monta a configuração do tema e troca só os tipos de seção da home pelos do tema + os da loja (`review-carousel`, `categories-carousel`, `personalized-boxes`). Se isso falhar, o painel abre como o do tema (sem as seções da loja), nunca em branco.
Cuidados: o campo `category_ids` do carrossel de categorias era obrigatório e a home não o preenche, o que travaria o botão de publicar: agora é opcional ("vazio = todas") e `categories-carousel.ejs` trata lista vazia como "todas". Antes da correção, salvar a home no painel já era seguro: as seções desconhecidas eram preservadas (conferido no histórico: `categories-carousel` sobreviveu a todos os "Update Páginas home" desde 2024).
Conferência feita sem login: a configuração do painel local lista 17 tipos (produção tinha 14), com todos os campos da seção e 96 categorias para escolher; HTML da home idêntico ao do site real. A tela com login só o Rafael abre.
