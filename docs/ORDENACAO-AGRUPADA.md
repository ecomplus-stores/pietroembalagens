# Ordenação agrupada da Estante de produtos

Duas opções novas no campo **Ordenação** da seção **Estante de produtos** (home e qualquer página que ofereça a Estante, como a de Produtos): produtos parecidos ficam juntos, um grupo depois do outro.

- **Agrupar por subcategoria**: o grupo é a categoria do produto.
- **Agrupar por tag**: o grupo é uma palavra-chave (`keywords`) do produto.

As opções antigas (Relevância, Mais vendidos, Lançamento, Ofertas, Menor preço, Maior preço, Alfabética) continuam iguais e nada muda em estante que não escolher uma das novas.

## Como configurar (painel → Páginas → seção "Estante de produtos")

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
- Só a **Estante de produtos** tem as opções novas. Vitrine dinâmica, Multi estante e a lista da página de categoria **não** (ver abaixo).
- **A lista da página de categoria (filtros e páginas) não foi alterada.** Ela busca página a página no servidor de busca; agrupar ali exige outra abordagem (ordenar no servidor de busca ou carregar a categoria inteira).
- Dados: o produto não tem campo "tipo de embalagem"; o que existe é categoria (com pai e filho), `keywords` e especificações. As `keywords` atuais são frases de SEO ("caixa para 12 doces"), então "Agrupar por tag" só é útil com uma lista de tags escolhidas e padronizadas nos produtos.

## Peças

| Peça | Arquivo |
|---|---|
| Opções e lista no painel | `template/js/cms/sections.js` (`withGroupedSort`) e `template/js/admin.js` (aplica na página de Produtos) |
| Busca, agrupamento e corte do limite | `template/pages/@/sections/collection-shelf.ejs` |
| Regra do agrupamento (reordena no lugar) | `template/pages/@/sections/inc/group-items.ejs` |
| Testes | `tests/grouped-sort.test.cjs` (`node --test tests/*.test.cjs`) |

## Desfazer

Trocar a Ordenação da estante de volta (ex.: "Mais vendidos") no painel, ou reverter o commit. Nenhum conteúdo existente foi alterado: nenhuma estante usa a opção nova até alguém escolher.
