# Ordenação agrupada (Estante de produtos e lista da categoria)

Produtos parecidos ficam juntos, um grupo depois do outro. Duas frentes:

1. **Estante de produtos** (home e qualquer página que ofereça a Estante, como a de Produtos): duas opções novas no campo **Ordenação**.
2. **Lista da página de categoria** (com filtros e páginas): uma opção nova em **Ordenação padrão** (ver "Página da categoria", no fim).

- **Agrupar por subcategoria**: o grupo é a categoria do produto.
- **Agrupar por tag**: o grupo é uma palavra-chave (`keywords`) do produto.

As opções antigas (Relevância, Mais vendidos, Lançamento, Ofertas, Menor preço, Maior preço, Alfabética) continuam iguais e nada muda em estante que não escolher uma das novas.

## Estante de produtos: como configurar (painel → Páginas → seção "Estante de produtos")

1. **Ordenação**: escolher "Agrupar por subcategoria" ou "Agrupar por tag".
2. **Ordem dos grupos** (lista, um nome por linha, na ordem em que aparecem):
   - subcategoria: nome da categoria (qualquer nível: "Sacolas", "Tampa com Visor"...);
   - tag: palavra-chave do produto.
   - Acento e maiúscula não importam.
3. Cada estante tem a sua própria ordenação e a sua própria lista.

**Lista vazia em "Agrupar por subcategoria"** e Coleção do tipo *Categoria*: os grupos são as subcategorias daquela categoria (filhas e netas entram no grupo da filha), de A a Z (números em ordem: "02" antes de "10"). Lista vazia em tag, ou coleção que não é categoria: a estante fica como estava (mais vendidos).

## Regras da ordem

- **Entre grupos:** a ordem da lista (ou A a Z, no automático).
- **Dentro do grupo:** mais vendidos (a mesma ordem da opção "Mais vendidos"; com estoque antes de sem estoque, como no resto da loja).
- **Produto em mais de um grupo:** fica no primeiro da lista. Muitos produtos da loja têm 2 ou mais subcategorias (ex.: "Tampa com Visor" e "Linha tampa em acetato"); a ordem da lista decide.
- **Produto sem grupo:** vai para o fim, na ordem de mais vendidos. Nunca some da estante.
- "Embaralhar produtos" é ignorado quando a ordenação é agrupada (embaralhar desfaria os grupos).

## Como funciona (e limites)

- A Estante busca até **100 produtos** da coleção por mais vendidos, agrupa **todos** e só então corta o **Limite de itens** (e pula os da "Paginação" da estante). Por isso o grupo vale para a coleção inteira, não só para os primeiros 12. Coleção com mais de 100 produtos: só os 100 mais vendidos entram no agrupamento (o log do render avisa).
- Com Limite 12, a estante mostra os 12 primeiros da ordem agrupada: se o primeiro grupo tiver 12 produtos, os outros grupos não aparecem. Aumente o limite (até 24) para mostrar mais grupos.
- Na Estante, só a **Estante de produtos** tem as opções novas. Vitrine dinâmica e Multi estante **não** (a opção só entra onde o agrupamento foi feito e testado).
- Dados: o produto não tem campo "tipo de embalagem"; o que existe é categoria (com pai e filho), `keywords` e especificações. As `keywords` atuais são frases de SEO ("caixa para 12 doces"), então "Agrupar por tag" só é útil com uma lista de tags escolhidas e padronizadas nos produtos.

## Página da categoria (lista completa, filtros e páginas)

- **Onde:** painel → Páginas → Categorias → "Produtos da categoria" → **Ordenação padrão** → "Agrupar por subcategoria". **A configuração vale para todas as categorias de uma vez** (o painel tem um único campo para todas). Cada categoria usa as próprias subcategorias, de A a Z (filhas e netas no grupo da filha); categoria **sem subcategorias** fica em "Mais vendidos". Hoje o padrão é "Lançamento"; ao escolher a opção nova, as categorias com subcategorias passam a mostrar os grupos, e as sem subcategorias passam a "Mais vendidos".
- **Como:** a ordem é feita no **servidor de busca da loja**, para a categoria inteira (por isso vale em todas as páginas, no "carregar mais" e com os filtros). O servidor da página monta um critério de ordenação (nota por grupo, pelo nome das categorias do produto) e o coloca na frente de "mais vendidos"; o navegador o repete a cada busca. Dentro do grupo: mais vendidos; produto sem grupo: no fim.
- **Seletor da página:** a lista ganha a opção "Por subcategoria" (marcada de início); o cliente pode trocar por outra ordenação e voltar.
- **Se o servidor de busca recusar o critério** (no servidor da página ou no navegador): a lista volta sozinha para "Mais vendidos" e abre normalmente. O pior caso é perder o agrupamento, não a página.
- **Limites:** (1) o critério usa o **nome** da categoria; se o produto tiver outra categoria com o mesmo nome de uma subcategoria, ele cai nesse grupo; (2) o critério **não foi testado contra o servidor de busca real** (o ambiente de desenvolvimento não alcança a busca da loja): a lógica e o desvio de segurança estão testados com simulação, mas o agrupamento de verdade só se confirma abrindo uma categoria com subcategorias numa prévia, no computador e no celular; (3) busca por palavra (`/search`) e páginas de marca/coleção não têm essa opção.

## Peças

| Peça | Arquivo |
|---|---|
| Opções e lista no painel | `template/js/cms/sections.js` (`withGroupedSort`) e `template/js/admin.js` (aplica na página de Produtos e Categorias) |
| Estante: busca, agrupamento e corte do limite | `template/pages/@/sections/collection-shelf.ejs` |
| Estante: regra do agrupamento (reordena no lugar) | `template/pages/@/sections/inc/group-items.ejs` |
| Categoria: critério de ordenação para o servidor de busca | `template/pages/@/sections/inc/group-sort.ejs` e `category-retail.ejs` (`retail-grid.ejs` entrega ao navegador em `data-group-sort`) |
| Categoria: navegador (seletor, repetir o critério, desvio de segurança) | `template/js/custom-js/js/SearchEngine.js` |
| Testes | `tests/grouped-sort.test.cjs` (`node --test tests/*.test.cjs`) |

## Desfazer

Trocar a Ordenação de volta (estante: ex. "Mais vendidos"; categorias: "Lançamento") no painel, ou reverter o commit. Nenhum conteúdo existente foi alterado: nenhuma estante nem categoria usa a opção nova até alguém escolher.
