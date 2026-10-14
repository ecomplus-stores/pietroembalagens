# Entrega 1: compressão do HTML no SSR

Esta entrega prepara compressão negociada no servidor; ainda não registra publicação em produção.
Base: `141b72384364a81bb43c14b2ff8cd6bd7be2d767`, após o PR 87.
Branch: `perf/compressao-html`.

## Mudança

O handler Firebase passa a aplicar `compression` 1.8.1 somente a respostas `text/html`, compondo seu filtro com o filtro suportado da biblioteca. O navegador negocia gzip, Brotli, deflate ou identity. O limite mínimo é 1.024 bytes; gzip usa nível 6 e Brotli qualidade 4 para limitar o custo de processamento.

O middleware conserva o HTML gerado e `Cache-Control`, acrescenta `Accept-Encoding` ao `Vary` existente e remove `Content-Length` quando o corpo é comprimido. Respostas pequenas, HEAD, `no-transform` e corpos já codificados seguem as decisões da biblioteca. `/~reverse-proxy/` desvia antes da instalação do middleware, preservando os headers e o corpo do proxy.

Arquivos de aplicação: `.functions/index.js`, `.functions/package.json` e `.functions/package-lock.json`. O lock adiciona somente compression, on-headers e a versão de negotiator exigida por compression; as versões e integridades previamente travadas foram preservadas. A única mudança no CI é instalar as dependências das Functions antes dos testes e da verificação de integridade da fonte.

Nenhum template, CSS, JavaScript do navegador, canonical, dado do catálogo ou prazo de cache foi alterado. A home estática já recebe Brotli pelo Hosting; as medidas da home abaixo são do caminho SSR local.

## Validação executada

- Node 20.20.2; instalação das Functions com `npm ci --omit=dev` e lockfile próprio.
- 117 testes aprovados, sem falhas ou skips, incluindo 20 testes HTTP novos com o export Firebase e o handler HTTP do renderer reais. Apenas as views dos casos controlados são fixtures.
- Os testes cobrem gzip/Brotli/deflate, identity e ausência de Accept-Encoding, preferências e q=0, corpo descomprimido, Vary existente, Content-Length, HEAD, redirecionamento, 404, erro de renderização, resposta pequena, não HTML, no-transform, corpo já codificado e proxy com upstream HTTP local real.
- Build de seis páginas concluído; verificação dos HTML e assets e o predeploy real das Functions concluídos.
- Integração adicional com o renderer de produção, templates preparados e catálogo público real: home, categoria, produto e busca responderam 200; gzip/Brotli/identity mantiveram o corpo original de cada resposta e o Cache-Control.
- `actionlint` e `git diff --check` passaram. ShellCheck/Pyflakes não foram executados.

Os IDs de algumas imagens são gerados novamente entre renderizações. Na integração, a integridade é verificada comparando o corpo descomprimido com o HTML entregue pelo renderer ao `res.send` daquela mesma resposta, sem normalizar ou remover dados. Nos testes controlados, também se compara a resposta com o handler anterior.

### Medidas locais do SSR real

| Página | HTML original | gzip | Brotli | Redução com Brotli |
| --- | ---: | ---: | ---: | ---: |
| Categoria | 189.794 bytes | 41.279 bytes | 40.307 bytes | 78,8% |
| Produto | 183.873 bytes | 43.196 bytes | 42.004 bytes | 77,2% |
| Home SSR | 236.385 bytes | 45.039 bytes | 44.217 bytes | 81,3% |
| Busca SSR | 144.573 bytes | 35.246 bytes | 34.956 bytes | 75,8% |

Mediana de dez compressões locais do mesmo HTML: categoria 2,90 ms gzip / 2,09 ms Brotli; produto 3,13 ms gzip / 2,26 ms Brotli. São medidas desta máquina, sem estimativa de CPU do Firebase, LCP, conversão ou velocidade total. Tempos de requisições locais incluem consultas públicas e não devem ser apresentados como ganho de navegação.

Evidências locais: `/workspace/.cloud-setup/compression-investigation/` contém logs dos testes/build, `real-ssr-results.json` e os HTML usados. A negociação pelo Hosting publicado só poderá ser comprovada após o deploy. A homologação Firebase independente não está disponível neste ambiente. Testes de interações no Chromium não foram executados pelo bloqueio TLS já registrado; esta entrega não muda o frontend.

## Publicação e aceite no domínio público

O advisor deve revisar o diff final e as evidências; Rafael aprova a entrega concreta antes do merge em master, conforme `NOTAS.md`. O CI recaptura os identificadores de Hosting/SSR imediatamente antes de publicar e guarda os artefatos antes/depois.

Última baseline comprovada: [Actions 38489635833](https://github.com/ecomplus-stores/pietroembalagens/actions/runs/38489635833), Hosting `sites/pietroembalagens-store/releases/1791937439522000`, versão `603a0b530e53dfaf`, Function SSR `632 ACTIVE`, Node 20. Esta referência não substitui a captura do estado anterior ao novo deploy.

Após publicar, confirmar sucesso do deploy e o SSR ativo; executar GETs equivalentes de categoria e produto com Accept-Encoding gzip, br e identity, registrando status, Content-Encoding, Vary, Cache-Control, bytes e HIT/MISS. O corpo descomprimido deve continuar válido, com dados comerciais, scripts e preços corretos. Home, busca, JS/CSS e reverse proxy também devem continuar funcionando.

A baseline pública tinha compressão irregular da categoria e ausência de compressão no produto. `STOREFRONT_LONG_CACHE` mantém documentos SSR em CDN por até sete dias. Não presumir que deploy limpa todos os documentos nem afirmar que a melhoria está entregue apenas com o Actions verde. Se for necessário invalidar os slugs para disponibilizar a nova representação, justificar com evidência do cache antigo e usar a invalidação suportada pelo fluxo existente; não executar PURGE apenas para investigar.

## Rollback isolado

Interromper a publicação seguinte se houver HTML inválido, falha de descompressão, encoding proibido pelo cliente, mudança no proxy, erro em resposta/SSR ou regressão comercial. Investigar deploy parcial antes de reverter.

Esta entrega ficará em um commit próprio. Conferir o master atual e mudanças posteriores, preparar `git revert --no-commit COMMIT_DESTA_ENTREGA` em branch de rollback, revisar o diff com o advisor e executar testes/build antes da publicação autorizada. Se o merge gerar outro commit, confirmar seus parents antes de usar `git revert -m 1 COMMIT_DO_MERGE`.

A reversão deve remover somente o middleware, sua dependência/lock, a mudança de ordem dos testes e os testes/documentação desta entrega. Os guards, serialização, evidências e baseline da entrega 0 permanecem. Guardar as evidências e este procedimento fora do commit antes de reverter.

O rollback exige novo build/deploy de Hosting e Functions; restaurar somente Hosting não restaura o handler SSR. Não há tempo garantido de recuperação. Depois da reversão, conferir o SSR, as representações em cache e as páginas/fluxos afetados. Comandos com placeholders não devem ser executados sem preenchimento e revisão.
