# Teste: site sem minicart

No ar desde 03/10/2026 com `"minicart": false` para 100% dos visitantes (commit `3aacbf9d`).

## O que faz

- O ícone do carrinho no topo leva direto para `/app/#/cart`. O painel lateral (minicart) não abre mais, nem ao adicionar produto, e o scroll da página não trava.
- Ao clicar em "Adicionar" na home, na busca/categoria ou na PDP ("Adicionar ao Carrinho"), aparece um aviso no canto da tela: "Produto adicionado ao carrinho", com foto, nome, botão **Ver carrinho** e "Continuar comprando". Some em 7 s; Esc ou × fecham; vários itens adicionados juntos viram um aviso só.
- O aviso não aparece na página do carrinho nem no checkout. O botão "Comprar" da PDP (compra direta) continua indo ao checkout.

## Configuração (`template/public/pe-cart-config.json`)

- `"minicart": true` volta ao comportamento anterior; `false` liga o teste.
- `"noMinicartPercent"`: % dos visitantes no teste (grupo fixo por navegador, `localStorage` `pe-cart-bucket-v1`). Padrão 100.
- Falha ao carregar o arquivo = minicart como antes.

## Rollback

Trocar `"minicart"` para `true`, commit e push no `master` (deploy em ~3 min). Reversão integral: `git revert` dos commits `feat(teste-sem-minicart)` e do merge.

## Medição

Eventos no `dataLayer` (sem dado pessoal): `pe_cart_ui`, `pe_cart_notice_view`, `pe_cart_notice_click` (`pe_cart_action`: `go` ou `keep`), todos com `pe_cart_ui: no_minicart | minicart`. GTM (container GTM-PC6LB8B, publicado em 04/10/2026): tag `GA4 - pe_cart`, acionador `CE - pe_cart` (regex `^pe_cart_(ui|notice_view|notice_click)$`) e variáveis `DLV - pe_cart_*`. No GA4, dimensões de evento cadastradas: `pe_cart_ui` ("Carrinho variante") e `pe_cart_action` ("Carrinho ação do aviso"). `pe_cart_count` chega ao GA4 mas não tem dimensão.

## Código

`template/js/custom-js/cart-ui.js` (flag, clique no carrinho, aviso), `js/CartQuickview.js` (`toggle` não abre com a flag), `pages.js` (import). O widget `@ecomplus/widget-minicart` continua ativo; o clique do botão é interceptado na fase de captura.
