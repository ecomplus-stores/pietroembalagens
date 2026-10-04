# Quadros personalizados da home

Fileira de quadros brancos logo abaixo do banner da home, como a do Mercado Livre, **com o mesmo tamanho** (medido nos prints do Rafael, 04/10): quadro de **184 × 286 px**, 16 px entre quadros, 6 visíveis em 1184 px; banner de **280 px** de altura no computador. **Celular** (print do Rafael): quadro de **149 × 225 px** com 13 px entre quadros (~2 visíveis, rola de lado) e banner em cartão de cantos arredondados, 16 px de margem, proporção 8:3 (358 × 134 em 390 px). Cada quadro mostra **1 produto** (título do quadro, foto, nome em 2 linhas, preço; com preço antigo riscado e % OFF quando está em promoção, e a linha "em até Nx de R$ X" + "sem juros" quando a loja não cobra juros). As parcelas usam a configuração de pagamento da loja (`window.storefront.info.list_payments.installments_option`, a mesma do tema: mínimo de R$ 5 por parcela e máximo da loja); sem ela, ou com preço baixo demais, a linha fica vazia. Seta para rolar de lado no computador; no celular, rola com o dedo. A linha "Frete grátis" **não existe de propósito**: o frete grátis depende do CEP e do mínimo do carrinho, e a home não sabe isso por produto.

**Backup antes da entrega:** branch `backup/antes-quadros-20261004`, SHA `70194aeffd905e8cd9a91d57257d4421ce6a2d04` (o `master` de 04/10/2026).

## Quadros

Até 6 quadros, nesta ordem; o que não tiver produto exibível é pulado e nenhum produto aparece em dois quadros.

| Quadro | De onde vem | Aparece |
|---|---|---|
| Visto recentemente | produtos abertos pelo cliente (PDP), o mais recente primeiro | cliente com histórico |
| Sua busca | último termo buscado (`/search?term=`) | cliente que já buscou |
| Também te interessa | `recommended.json` dos 2 últimos vistos, sem os que ele já viu | cliente com histórico |
| Mais vendidos | `EcomSearch` com `sort: sales` | sempre |
| Promoções | `EcomSearch` com `sort: offers`, só os que estão em promoção (`onPromotion`) | sempre |
| Novidades | `EcomSearch` com `sort: news` (id decrescente) | sempre |

Cliente novo vê os 3 últimos. Um produto só é exibido se estiver disponível, visível, com estoque, preço maior que zero, foto e slug. Se nada for exibível, a seção se esconde.

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

- **Banner mais baixo corta a arte.** Com os quadros ligados o banner do computador cai de ~504 para 280 px (como o ML). As artes atuais (1920×500 e 1597×700) são cortadas embaixo (o botão "Ver coleção" some). O ideal é refazer as artes em ~1920×380 (1410×280 de caixa), com o texto no meio vertical.
- **Banner do celular sem o "espiar" do próximo slide:** o ML mostra um pedaço do slide seguinte; aqui o banner é um cartão único (o carrossel é o do tema).
- **Promoção vencida:** o índice de busca não devolve `price_effective_date`; então o quadro "Promoções" só testa `base_price > price`. Hoje não há esse caso (a ficha 18 limpou as vencidas), mas se voltar a existir, a correção é buscar o produto em `/products/<id>.json` antes de exibir.

## Fora do escopo

"Compre novamente" (precisa de login/compras do cliente); botão de limpar histórico; linha "Frete grátis" e quadros informativos do visitante sem login; qualquer mudança no checkout.
