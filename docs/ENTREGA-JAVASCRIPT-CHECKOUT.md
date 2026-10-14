# Entrega 2a — ajustes de checkout carregados por rota

Preparação na branch `perf/javascript-por-rota`, a partir de `ea63eb6fad1bddcbd9f323f42b0784a2a9627f64`. Esta documentação registra testes locais; a entrega ainda exige revisão final do advisor, aprovação de Rafael e verificação pública após o deploy. O SHA efetivo ficará no PR e no `deployment.json` do CI.

## Alteração

Os textos de identificação/cadastro, a ordem visual Pix → boleto → cartão e os eventos de etapas do checkout saem do JavaScript inline global de `content/code.json`. O head passa a carregar `assets/pe-checkout-enhancements.27a9b0b1a9f9.js` com `defer` apenas em `/app` e seus caminhos filhos. O arquivo usa APIs nativas e seu nome deriva do SHA-256 da fonte; o build suportado minifica o conteúdo servido.

O observador de checkout fica no contêiner estável `#spa`, com fallback para `main`, e só agenda processamento nas etapas de checkout. Ele acompanha troca de rota, alterações de texto, gateways carregados depois e mudanças de campos. Nomes/payloads de eventos, canais `gtag`/`dataLayer` e chaves de sessão permanecem iguais ao comportamento anterior.

As datas de entrega/feriados, frete grátis, cupons e `window.peDeliveryDate` continuam globais: também são usados em produto, carrinho e minicart. A ordem dos scripts principais e seus fallbacks permanece a mesma. Menu/busca, seus observadores, avaliação de `defer` das bibliotecas e widgets continuam pendentes na frente 2b.

### Atualização da PWA

O Workbox atual precacheia `/app/index.html`, mas seu manifest de build inclui apenas o bundle principal. Foi reproduzida uma falha: alterar somente HTML e adicionar o helper deixava `sw.js` idêntico; uma PWA existente continuava recebendo o HTML antigo mesmo após `registration.update()`.

`storefront.webpack.js` acrescenta, no hook `emit` de produção, um marcador determinístico somente em `sw.js`, calculado com o head compartilhado, o template do head e o helper referenciado. Assim, quando o navegador verifica a atualização online, detecta bytes diferentes e instala o worker com o HTML novo. O build falha se o worker esperado faltar. O corpo anterior do worker ficou byte a byte igual; regras de cache, `skipWaiting` e `clientsClaim` permanecem as do framework. Não foi adicionado reload forçado durante a compra.

## Comparação medida

Builds de produção no **mesmo diretório físico**, Node 20.20.2, mesmas dependências com lockfile e dados de catálogo equivalentes. Comparar diretórios diferentes alterava os hashes do Vue/style-loader, portanto esses resultados iniciais foram descartados.

| Recurso | Antes | Depois | Diferença |
| --- | ---: | ---: | ---: |
| HTML home, sem compressão | 236.597 B | 233.831 B | −2.766 B |
| HTML home, gzip | 45.129 B | 44.327 B | −802 B |
| HTML home, Brotli | 44.314 B | 43.426 B | −888 B |
| HTML busca, gzip | 35.256 B | 34.441 B | −815 B |
| HTML busca, Brotli | 34.981 B | 34.138 B | −843 B |
| Primeiro app: HTML + novo helper, gzip | 27.466 B | 27.837 B | **+371 B** |
| Primeiro app: HTML + novo helper, Brotli | 27.683 B | 27.955 B | **+272 B** |

O helper servido tem 2.250 B, gzip 1.094 B / Brotli 1.046 B. O primeiro acesso ao app acrescenta **uma requisição**; no catálogo não há requisição adicional. As compressões foram calculadas localmente e não incluem headers HTTP nem o protocolo. O arquivo pode ser reutilizado do cache, mas isso não prova melhora do primeiro checkout.

Os 50 bundles/chunks anteriores e os demais JS públicos comparados ficaram idênticos (65 arquivos no total, excluindo o worker). Apenas o novo helper e o marcador do worker acrescentam JavaScript servido.

Três pares de execuções em Chromium, viewport 390×844, CPU simulada 4× mais lenta, cache limpo, imagens/fontes públicas pelo proxy e observação até cinco segundos após `load`:

| Mediana de laboratório | Antes | Depois |
| --- | ---: | ---: |
| LCP | 896 ms | 688 ms |
| CLS | 0,0783 | 0,0684 |
| Tarefas longas observadas | 9 | 6 |
| Excesso de duração das tarefas longas sobre 50 ms | 934 ms | 534 ms |

Houve variação relevante: LCP antes 844–1.212 ms, depois 544–900 ms; bloqueio antes 927–1.228 ms, depois 481–941 ms. Fontes/imagens remotas, o proxy e a ordem alternada dos testes limitam a comparação. Esses valores não estabelecem ganho causal, não são métricas do site público, Lighthouse TBT ou INP de usuários, e não sustentam promessa de aumento de vendas.

## Validação realizada

- Suite completa: **124 aprovados, 0 falhas, 0 skipped**, incluindo sete testes novos sobre os ajustes de checkout, transições SPA, gateways tardios, sessões/eventos e condição de carregamento por rota.
- Build com os mesmos argumentos do CI: home, app, busca, 404, blog e admin. Verificação dos assets e preparação de SSR com o predeploy atual passaram.
- Navegador com builds reais, desktop 1440 e celular 390: menu/navegação de categorias, busca instantânea desktop e busca mobile, categoria, variação de produto, quantidade quando disponível, preço, adicionar ao carrinho e abrir o checkout. Sem erro JavaScript novo; helper solicitado apenas pelo app. Textos de entrada e controles Google/Windows presentes em ambos.
- Fixture DOM no navegador executando o código antigo e o helper minificado novo: mesmas cópias, Pix/boleto/cartão, gateway tardio, prazos de entrega e eventos das três etapas sem repetição por canal/sessão. Não foi alterada a emissão existente pelos dois canais.
- PWA real: instalação inicial; atualização com `controllerchange`; nova página recebe helper; aba antiga abre a rota lazy de conta; após rollback, aba com código novo ainda abre conta, nova página recebe HTML antigo, origem continua servindo o helper idêntico com HTTP 200. Sem erros de página ou chunks. A transição passou em perfil novo e novamente após reiniciar o navegador preservando a PWA/caches. Um ensaio que apagava todos os dados da origem no perfil reutilizado deixava o worker em espera; esse resultado do harness foi registrado e não motivou alteração da política de ativação da loja.
- TLS permaneceu ativo. Rafael autorizou apenas um perfil temporário confiando na CA do proxy; confiança permanente do usuário/sistema não foi alterada. Os dois perfis temporários usados foram removidos após os testes, com a limpeza registrada.

Não foram concluídos login OAuth autenticado, envio de pedido/pagamento nem uma compra real. A ordem dos gateways e etapas posteriores foi validada em fixture, não em uma transação. Configuração de frete/prazos permanece coberta pela suite existente; não foi feita cotação completa com CEP no checkout real. Requests de marketing foram bloqueados no navegador de teste para evitar eventos artificiais nas integrações públicas.

Evidências locais: `/workspace/.cloud-setup/javascript-investigation/` — `all-tests-final.log`, `sw-revision-ci-build.log`, `build-comparison-final.json`, `sw-revision-comparison.json`, `browser-regression.json`, screenshots desktop/mobile, `pwa-transition.json`, `lab-comparison.json` e registro do perfil temporário. Os artefatos preparados e identificadores antes/depois do deploy serão preservados pelo CI existente.

## Publicação

1. Advisor revisa diff, resultados e rollback; resolver achados impeditivos.
2. Rafael aprova a entrega concreta conforme `NOTAS.md`. Não fazer push direto em `master` durante a preparação.
3. Conferir SHA aprovado e master atual, preservando mudanças posteriores. Usar PR/merge autorizado e acompanhar o workflow serializado até o deploy Hosting **e** Functions concluir.
4. O CI recaptura o baseline antes de alterar produção. Último baseline conhecido: Hosting `32e4d82f7cad1489`, Function SSR `633` ACTIVE; os identificadores não dispensam nova captura.
5. Confirmar no domínio público: home/categoria/produto sem helper; app com helper HTTP 200; `sw.js` com marcador; menu/busca/carrinho/checkout; sessão nova e PWA existente após verificação online da atualização. Comparar source/build SHA, metadados, console e requests. Se o deploy falhar parcialmente, examinar Hosting e SSR separadamente.

## Rollback delimitado

Acionar diante de erro novo de carregamento, menu/busca/carrinho quebrado, alteração de identificação/pagamento/eventos, ou PWA que deixe de abrir o fluxo. Suspender novas entregas, conferir deploys em andamento e investigar o par Hosting/SSR e caches.

**Retenha o helper novo na reversão.** Uma página em cache ou aba aberta pode continuar referenciando sua URL depois que o HTML novo for retirado. Não há prazo automático seguro para apagar esse arquivo por causa de PWAs offline; qualquer limpeza posterior exige validação separada.

No checkout limpo e atualizado de `master`, depois de inspecionar commits posteriores e substituir `DELIVERY_SHA` pelo SHA aprovado desta entrega, prepare uma branch de rollback. Inspecione também o histórico/diff do helper; retenha sua versão atual anterior ao revert, preservando eventuais alterações posteriores:

```sh
git switch -c rollback/javascript-checkout
PRE_REVERT_SHA=$(git rev-parse HEAD)
# SHA exato do commit fonte da entrega, registrado no PR e no CI:
DELIVERY_SHA='SHA_DO_COMMIT_FONTE_APROVADO'
git show --stat "$DELIVERY_SHA"
git revert --no-commit "$DELIVERY_SHA"
git restore --source="$PRE_REVERT_SHA" --staged --worktree -- template/public/assets/pe-checkout-enhancements.27a9b0b1a9f9.js
git diff --cached --check
git diff --cached --stat
node --test tests/*.test.cjs
npm run build -- --prerender=index,app/index,search,404,blog,admin/index --prerender-limit=0
node .github/scripts/verify-deploy.cjs artifacts
git commit -m 'revert: restaurar ajustes inline de checkout mantendo asset em cache'
```

Resolver conflitos preservando mudanças posteriores; não usar reset/force push nem restaurar a loja inteira por uma tag. O ensaio concreto de `git revert --no-commit` com retenção do helper passou 117 testes, conferência do patch e build/SSR de reversão. Os 67 JS comparados (incluindo worker e helper retido) e o HTML do app coincidiram com o snapshot usado no teste PWA; a home diferiu nos IDs numéricos de imagens e na atualização de estoque de um produto público, sem outra diferença de HTML. O revert deve restaurar somente os ajustes desta entrega, incluindo o versionamento de worker, preservando compressão, controles de deploy e o commit do bot. Antes de publicar a reversão, revisar o diff com advisor/Rafael e repetir as verificações afetadas.

Publicar a branch de reversão pelo mesmo fluxo PR/CI/Hosting/Functions e acompanhar sua conclusão. A mudança de bytes de `sw.js` na volta também foi ensaiada: após atualização online, o HTML anterior retorna; o helper novo continua HTTP 200 para documentos antigos. Conferir depois origem/SSR, catálogo, app, eventos, PWA e referências de assets. Registrar releases, versões e tempo real de recuperação.

Este procedimento exige novo build/deploy; não é rollback instantâneo. Restaurar só uma release de Hosting não restaura os templates da Function SSR. Não existe promessa de tempo de recuperação ainda medido em produção.
