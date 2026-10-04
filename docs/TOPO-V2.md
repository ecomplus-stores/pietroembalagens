# Topo da home v2

Redesenho do topo do site e do início da home (cabeçalho laranja com busca em destaque e uma cápsula marrom de promoções ao lado dela, benefícios em pílula e categorias em "stories"). A tarja marrom do topo foi **substituída pela cápsula**: o topo fica mais estreito e cabem 2, 3 ou mais mensagens. Handoff de design: `site/Alteracoes visuais claude design /design_handoff_topo_home_v2/` no workspace ccos-ratos.

**Backup antes da v2:** branch `backup/antes-topo-v2-20261004`, SHA `0bde0cc1e2cf2f90b1130f299ed4469a9fb48cd9` (o `master` de 04/10/2026).

## Chave liga/desliga

`content/header.json` → `pe_header_v2.enabled` (padrão `false`). O cabeçalho é renderizado no build (EJS), então a chave atua no build: depois de mudar, é preciso commit, push no `master` e esperar o **Build and deploy**.

- **Ligar:** `"enabled": true`, num commit só para isso (`feat(topo-v2): liga topo v2`), depois de o merge com `false` ter terminado o deploy.
- **Rollback:** voltar `"enabled"` para `false`, commit e push no `master`. O site volta ao topo atual quando o deploy terminar, sem reverter código.
- **Reversão integral:** `git revert` dos commits `feat(topo-v2):`, do mais recente para o mais antigo. Nunca `reset --hard` com push forçado.

Outras chaves do mesmo objeto: `promo_rotate_ms` (troca da cápsula, 4000), `promos` (lista de mensagens da cápsula: `icon` (`percent`, `truck`, `credit-card` ou `tag`), `title`, `text`, `short` (versão de uma linha para o celular) e `link`; pode ter quantas quiser), `show_benefits` (`false` = sem os 3 selos azuis abaixo do cabeçalho, que as mensagens da cápsula já cobrem; `true` os traz de volta, com os textos de `benefits`), `seasonal` (Natal: `label`, `tag`, `link`, `bolinha`; `enabled` próprio), `mobile_nav` (menu em rolagem no celular), `benefits` (3 selos) e `stories` (as 9 bolinhas depois de Natal, cada uma com `label`, `link` e `img`).  O `marketing_stripe` continua existindo só para o topo atual (v1); a v2 não o usa.

## Onde está

| Arquivo | Papel |
|---|---|
| `template/pages/@/layout/header.ejs` | Só ganha o desvio: com a chave ligada inclui `inc/header-v2.ejs`; senão roda o markup v1, sem alteração. |
| `template/pages/@/layout/inc/header-v2.ejs` | Cabeçalho (com a cápsula de promoções), menu do celular, menu do computador (com `#s-all` e os submenus `#s-*`) e os benefícios (só na home). |
| `template/pages/@/sections/info-bar.ejs` | Com a v2 ligada não renderiza (os benefícios vêm do `header-v2.ejs`); v1 inalterado. |
| `template/pages/@/sections/categories-carousel.ejs` | Com a v2 ligada renderiza os "stories" a partir de `header.json`, sem chamar a API; v1 inalterado. |
| `template/pages/@/sections/banner-slider.ejs` | Só acrescenta a classe `pe-h2` ao banner com a v2 ligada (margem lateral e raio). |
| `template/scss/custom-css/_header-v2.scss` | Todo o CSS v2, sempre sob `.pe-h2`. |
| `template/js/custom-js/header-v2.js` | Troca das mensagens da cápsula (4 s, fade de 200 ms, pausa ao passar o mouse e parada com `prefers-reduced-motion`) e "Ver todas" dos stories. |
| `template/public/img/uploads/logo-creme-220.png` | Logo creme (220×104) gerado do arquivo oficial. |

## IDs, classes e funções preservados na v2

`#header`, `#search-form`, `#search-input`, `#instant-search`, `#search-bar`, `#mobile-search-btn` (oculto na v2: a busca já aparece sempre), `#user-button`, `#cart-button`, `#cart-count`, `#cart-quickview`, `#login-modal`, `#overlay`, `#logo`, `toggleSidenav()`, `toggleSubmenu()`, o megamenu `#s-all` (com `.row > div` e `.header__submenu-subcategory`, que o script do "Ver todas" em estilo drill-down do `code.json` lê), os submenus `#s-<slug>` e os ids `cd-*`, `sd-*`, `td-*`, o JSON-LD `SearchAction` e o popup `header.popup` (fora do desvio, igual nas duas versões). O menu lateral do celular (`menu.ejs`) não muda.

## Proporções do topo no computador (inspiradas no Mercado Livre)

Linha 1: logo, busca (cerca de 50% da largura, 600 px, 38 px de altura) e cápsula de promoções (320×38 px) encostada à direita. Linha 2: menu à esquerda e conta + sacola à direita. O cabeçalho todo tem cerca de 88 px (era 157 px com a tarja e o cabeçalho antigo). Entre 992 e 1199 px a cápsula some e os ícones sobem para a linha 1; abaixo de 1360 px o texto "Entrar ou cadastrar" vira só o ícone. O banner de ponta a ponta tem `clamp(420px, 35vw, 580px)` de altura no computador.

## Menu no computador (como no site atual)

O `<nav>` do computador leva as classes `header__nav header__nav--full`, que são as que as regras de submenu do site esperam. Resultado, igual ao v1: ao passar o mouse numa categoria em destaque, cai um dropdown vertical compacto (220 px); "Ver todas" **não abre ao passar o mouse**, só ao clicar, e abre a gaveta vertical (340 px) do script de drill-down do `code.json`. A única mudança visual é a linha de cima dos submenus, marrom em vez de laranja.

## Cuidados com o CSS atual

O `code.json` e o `_styles.scss` têm regras com `!important` e por `#header`. A v2 usa `#header.pe-h2` e `!important` pontual para vencê-las (fundo do `#header`, `#search-input`). A v2 não usa a classe `.header__nav`, por isso as regras `body #header .header__nav …` do v1 não a atingem. A cápsula é marrom `#3F2D25` com texto creme; no celular mostra só a linha `short`.

## Conferido

Ver "Validação" no PR: build com a chave `false` e `true`, `node --test tests/freight.test.cjs`, HTML do topo, do info-bar e do carrossel idênticos ao `master` com `false`, busca instantânea (computador), minicart, contador do carrinho, login, menu lateral, megamenu e submenus. Observação: no celular a busca instantânea não abre a caixa por cima, igual ao site no ar (decisão da ficha 16); o campo envia para `/search`.
