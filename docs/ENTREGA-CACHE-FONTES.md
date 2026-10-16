# Entrega 5 — cache das fontes versionadas

**Preparada para revisão; ainda não publicada.** Entregas 4 e 2B continuam suspensas e fora desta branch.

- Branch: `perf/cache-fontes-versionadas`.
- Base atual: `704463e8cadad05178414d6ae139efa1fa23a67f`. O avanço desde `e78a30cc` altera somente o trigger/slug de `.ecomplus.cd.json`, preservado nesta entrega.
- Aplicação: `5c0759f5fba66913fe096030d1c47ba3334bc5a6`.
- Alteração efetiva: três regras exatas em `firebase.json`, depois da regra genérica `/assets/**`, e três testes de proteção. Sem alteração de dependências, fontes, CSS, HTML, JavaScript, worker ou referências de arquivos.

## Problema e comportamento esperado

As três fontes Quicksand locais já têm nomes derivados do SHA-256 do conteúdo, mas a loja pública entrega `public, max-age=86400, s-maxage=600`. A política proposta é `public, max-age=31536000, immutable` somente para:

- `/assets/fonts/quicksand-latin.2add7d60b1cd.woff2` — 28.244 bytes.
- `/assets/fonts/quicksand-latin-ext.b5a37861949c.woff2` — 26.616 bytes.
- `/assets/fonts/quicksand-vietnamese.602d23d1e2cb.woff2` — 8.840 bytes.

Isso permite manter as mesmas respostas frescas por um ano, também em caches compartilhados elegíveis. O benefício esperado é evitar revalidações/transferências em visitas posteriores. A política não reduz bytes do primeiro acesso e não demonstra ganho de LCP, conversão ou Web Vitals públicos. Respostas antigas não recebem o novo header retroativamente.

Banners/logos editáveis pelo CMS, fontes sem hash, licença, proveniência, configurações, HTML e regras atuais de JS/CSS preservam suas políticas. O `no-store` de frete permanece. Não foi criado um pipeline novo de imagens ou versionamento do painel.

Para atualizar uma fonte no futuro: gerar um novo nome com o hash dos novos bytes; atualizar CSS/preload quando aplicável, proveniência e a regra exata correspondente; manter os arquivos anteriores disponíveis. Os testes conferem hash completo, tamanho e hash no nome e impedem alterar o binário em uma URL imutável sem atualizar esses vínculos.

## Validação

- Node 20.20.2: baseline com **124 testes**, candidato com **127 testes**, zero falhas/skips nas execuções finais.
- Superstatic, dependência já presente no lockfile do Firebase: respostas HTTP dos três WOFF2 com header final e SHA-256 corretos; 13 controles de política e quatro controles sem `immutable`, incluindo imagens CMS, fontes sem hash, licença/proveniência, frete, app, manifestos e worker.
- Build de seis páginas e preparação SSR aprovados para baseline/candidato. **276 dos 278 arquivos idênticos byte a byte**, incluindo fontes, CSS, JS e worker. Na home, só diferem 48 IDs aleatórios de fotos em `data-product.pictures[]._id`; todos os demais campos, IDs comerciais e bytes externos a esses atributos são iguais. No sitemap, o multiconjunto completo de 1.054 elementos `<url>` e o envelope são iguais; muda somente a ordem. O resultado bruto de comparação não é igualdade integral.
- Chromium 154/Puppeteer 24.15: fonte Quicksand real desenhada em página de laboratório, desktop/celular. Com `Age: 172800` **simulando dois dias**, a política antiga fez uma requisição condicional na segunda visita; a candidata fez zero requisições de fonte na segunda visita. Não houve espera real de dois dias. A resposta local condicional foi 200, não uma garantia de que o Hosting público transfira novamente o corpo.
- PWA com o worker real e inalterado: fonte renderizada offline após limpar o cache HTTP, com resposta do service worker. O cache `assets` usa **StaleWhileRevalidate**; Cache Storage e cache HTTP foram avaliados separadamente. A reversão do header continuou renderizando a fonte e restaurou a política curta na revalidação em segundo plano, sem erro do worker.
- O laboratório confirmou também que uma resposta já armazenada com um ano continua fresca após o servidor voltar à regra curta. Isso é uma limitação esperada do rollback, não expiração forçada dos clientes.

O servidor local precisou reproduzir apenas a rota `/404.html → /404 → 200`, servindo o arquivo real de 404, como observado por HTTPS na loja pública. O Superstatic original respondia 404 nessa rota e impedia o precache. O ajuste é exclusivo de QA, aplicado igualmente às versões; sem fallback global ou alteração de aplicação/worker. A falha inicial e os rastros estão preservados. A página sintética também solicitou um favicon inexistente; seu 404 não gerou erro do worker.

Os testes de headers inicialmente exigiram o callback da API de middleware do Superstatic; o harness foi corrigido antes das execuções finais. O primeiro ensaio de navegador exigia indevidamente 304 e foi ajustado para aceitar revalidação condicional 200 ou 304. Esses registros iniciais não foram apagados.

Os fluxos comerciais completos, login/OAuth, pedido/pagamento e medições públicas de velocidade não foram repetidos nesta entrega restrita a headers. Não são apresentados como aprovados por este laboratório. O smoke público das rotas e da fonte continua previsto após publicação autorizada.

## Ensaio do rollback real

Foi executado `git revert --no-commit 5c0759f5fba66913fe096030d1c47ba3334bc5a6`, sem mudar produção. O diff removeu somente as três regras e seus testes; `firebase.json` voltou exatamente ao alvo `704463e8`. As fontes permaneceram disponíveis e idênticas. Passaram **124 testes**, novo build de seis páginas, preparação SSR e GET dos três WOFF2 com a política anterior e hashes originais. O candidato foi restaurado depois do ensaio.

O novo build do rollback conserva 276 arquivos idênticos no total, incluindo fontes/CSS/JS/worker. O sitemap mantém os mesmos 1.054 elementos completos. A comparação estrita da home com o build de 14/10 **falhou**, além dos IDs aleatórios, por três valores `quantity` em `data-product`:

| SKU | Build de 14/10 | Build do rollback | API pública consultada na retomada |
|---|---:|---:|---:|
| `B_Tirinha_25x7x2_10` | 430 | 426 | 426 |
| `torta_28X28_5_TV` | 33 | 32 | 32 |
| `D_12_colorida_3coracao_10` | 1949 | 1948 | 1948 |

O template copia `quantity` de `opt.item`; as vitrines consultam a busca/API durante o build. A leitura independente pelo StorefrontRouter confirmou identidade e valores atuais dos três produtos. Esses dados comerciais **não foram normalizados nem revertidos**; não há alegação de equivalência integral do HTML. A verificação aprova a reversão do cache no escopo desta entrega, com a diferença de dados registrada separadamente.

## Publicação e reversão

A preparação e as evidências exigem parecer final do advisor e revisão de Rafael antes do merge. Push em master dispara o fluxo atual. Reconfirmar master, SHA aprovado e baseline de produção; acompanhar todos os testes/build/guardas e publicação de Hosting **e** SSR. Registrar Actions, Hosting e versão da Function acessíveis. Ainda não houve execução de deploy ou de CI desta branch no GitHub.

Depois da publicação autorizada: GET dos três arquivos e respectivos hashes/headers; conferir que frete, imagens CMS, app e assets sem hash mantêm as regras anteriores; fonte real em home/categoria/produto/app, sessão nova e PWA/aba já aberta. Nenhum envio de pedido ou pagamento é necessário para verificar esta mudança de headers.

Gatilhos de reversão: política aplicada a recurso indevido, erro de fonte/cache atribuível à entrega ou falha operacional causada por ela. Com checkout limpo e a mudança no histórico, preparar em branch:

```sh
git switch -c rollback/cache-fontes-versionadas
git revert --no-commit 5c0759f5fba66913fe096030d1c47ba3334bc5a6
git diff --cached --check
git diff --cached --stat
```

Se o merge usar squash, identificar o SHA efetivo e revisar o mesmo escopo. Preservar mudanças posteriores, todos os WOFF2, licença/proveniência e assets das entregas anteriores. Repetir testes/build/SSR/headers, revisar a reversão com advisor/Rafael e publicá-la pelo fluxo suportado; conferir versão efetiva, rotas e fonte. Não usar reset/force push.

**O rollback exige novo build/deploy e não é instantâneo.** Remover o header não expira respostas já guardadas por um ano em navegadores/caches. Os bytes e as URLs não mudam nesta entrega, por isso permanecem compatíveis. Uma futura correção de conteúdo precisa de outra URL; sobrescrever uma fonte imutável não é um mecanismo de recuperação.

## Evidências

Registros locais em `/workspace/.cloud-setup/cache-investigation/`: `baseline/public-headers.json`, logs/tests/build de baseline/candidato/rollback, `build-comparison.json`, `home-equivalence.json`, `browser-cache.cjs`, `browser-cache.json`, capturas desktop/celular/offline, falhas iniciais de harness/PWA, `public-pwa-paths.json`, `rollback/source.json`, `rollback/http.json`, `rollback/build-comparison.json` e `rollback/quantity-api.json`.

O catálogo de teste fica local e não é pacote de redeploy. Autenticação, proxy e TLS foram preservados; o navegador deste ensaio usou somente recursos locais com verificação HTTPS padrão, sem mudança de confiança.

## Parecer final do advisor — 15/10/2026

Favorável ao commit/push somente da branch de preparação e à criação de PR draft para revisão de Rafael. Os 127 testes, ensaios HTTP/PWA e rollback real sustentam o escopo restrito. As diferenças de dados comerciais, a idade simulada e a impossibilidade de expirar respostas já frescas foram consideradas. Não aprova merge/deploy nem declara ganho público de LCP; CI e conferência pública continuam previstos no fluxo de publicação autorizada. Entregas 4 e 2B permanecem suspensas.
