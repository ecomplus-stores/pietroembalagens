# Plano de implantação — velocidade e SEO da Pietro Embalagens

Preparado em 13/10/2026 para execução pelo Codex.
Repositório: ecomplus-stores/pietroembalagens.
Checkout: /workspace/ecomplus-stores/pietroembalagens.
Base inspecionada: master, commit 543d3514cb3e7f4cf2b20edc48b1c9cf35559ddd.
Site: https://www.pietroembalagens.com.br/.
Responsável pela implementação, testes, comparação e preparação das entregas: Codex.

## Regra de produção solicitada pelo usuário

O advisor deve validar cada entrega antes da implementação e novamente antes da publicação. Será um revisor independente, com acesso de leitura ao plano, ao diff e às evidências. Seu parecer não substitui a aprovação de Rafael prevista em NOTAS.md.

Cada entrega deve ter rollback preparado e conferido antes de produção. O procedimento deve identificar a versão anterior, preservar mudanças posteriores de terceiros e informar o tempo de recuperação medido. Um revert que exige build/deploy não deve ser apresentado como rollback instantâneo. Estas regras também estão registradas em AGENTS.md para orientar futuras tarefas.

**Parecer inicial do advisor, 13/10/2026:** plano aprovado para preparação, com condicionantes antes da primeira implantação. A revisão foi somente leitura; não aprovou nenhum diff de aplicação ou deploy. Os condicionantes abaixo são requisitos de execução, não verificações já concluídas.

## Organização em seis frentes

O diagnóstico anterior agrupava algumas recomendações. Aqui elas são organizadas em seis entregas: compressão, JavaScript, fontes, imagens/layout, cache e SEO. O repositório correto já foi incluído e validado; esse alinhamento é uma preparação concluída, não uma alteração adicional no site.

A implantação usa Firebase Hosting e uma Cloud Function SSR em .functions/index.js. A configuração .netlify existe no repositório, mas a frente de implantação confirmada no workflow atual é Firebase. Push em master dispara build/deploy; as mudanças serão preparadas em uma branch de trabalho, sem criar worktrees.

## Preparação antes da primeira entrega

1. Conferir novamente o HEAD de master, mudanças locais e o último deploy bem-sucedido. Reconciliar alterações feitas por outros colaboradores sem reset ou sobrescrita.
2. Criar uma branch de trabalho, por exemplo perf/velocidade-storefront. Trabalhar no checkout atual; preservar o repositório histórico RafaBrion.
3. Registrar a versão publicada, os hashes dos assets e os resultados antes/depois da home, de uma categoria e de um produto. Usar o mesmo dispositivo/viewport e condições de teste.
4. Usar Node 20.20.2 e instalações com lockfile. O baseline atual é 81 testes aprovados e build de seis páginas.
5. Examinar a configuração e o resultado do CI para reutilizar a autenticação de deploy já prevista no workflow. Não pressupor credenciais Firebase presentes na máquina em nuvem nem pedir valores de chaves no chat.
6. Completar a medição no navegador por uma rota autorizada. O Chromium deste ambiente não confia no certificado do proxy; a inclusão permanente foi rejeitada pela revisão automática e ainda não foi autorizada pelo usuário. A API pública PageSpeed retornou 429. Não desativar a validação TLS nem contornar a rejeição. A análise HTTP e os testes de código podem continuar; a validação visual e de interações fica como requisito antes de publicar alterações de frontend.

### Entrega 0: tornar a publicação identificável e a reversão executável

- Submeter a preparação do CI ao advisor antes de implementar e o diff/evidências antes de publicar, assim como nas seis frentes.
- Fixar o checkout ao SHA da execução aprovado: hoje o workflow usa github.ref, que pode apontar para um commit diferente quando a execução começar.
- Serializar publicações para o mesmo ambiente, sem cancelar um deploy que já está em andamento. Hoje não há concurrency no workflow.
- Resolver explicitamente o commit/push automático de defaults após o build: o conteúdo publicado precisa corresponder a uma versão rastreável e não incorporar alterações de aplicação não revisadas. Não ignorar diferenças geradas.
- Executar todos os testes existentes e falhar explicitamente quando os artefatos exigidos estiverem ausentes. Hoje a condição de presença dos arquivos pode terminar a etapa sem realizar deploy e ainda retornar sucesso.
- Registrar a execução do Actions, commit/conteúdo do build e release Hosting/versão da Function, conforme acesso disponível. Identificar o último estado funcional e o procedimento real de recuperação antes de publicar a primeira melhoria.
- Preparar um runbook por entrega com gatilhos, passos, comandos suportados e verificação posterior. Guardar artefatos/metadados pode reduzir o tempo de recuperação, mas seu redeploy precisa ser validado antes de ser chamado de atalho rápido.

Essa preparação não é uma sétima melhoria de performance; ela protege a execução das seis entregas solicitadas.

## 1. Comprimir o HTML de produto e categoria

**Problema confirmado:** a home é entregue com Brotli; as páginas de produto e categoria examinadas não têm Content-Encoding. O produto transfere 183.873 bytes. O mesmo HTML comprimido localmente com gzip ficou em 42.892 bytes, cerca de 77% menos dados. Isso é potencial de redução de transferência de HTML, não estimativa de velocidade total ou conversão.

**Execução**
- Instalar as dependências das Functions com o lockfile próprio e reproduzir o handler HTTP localmente.
- Confirmar a negociação de Accept-Encoding no caminho Firebase Hosting → SSR.
- Aplicar compressão compatível com o handler em .functions/index.js, usando middleware suportado ou configuração de entrega se ela resolver o problema comprovadamente.
- Acrescentar dependência explícita e atualizar apenas o lockfile de .functions se o middleware precisar dela.
- Limitar a mudança ao conteúdo adequado; preservar Cache-Control, Vary, status, redirecionamentos e o comportamento de /~reverse-proxy/. Evitar compressão dupla e Content-Length desatualizado.

**Arquivos principais:** .functions/index.js; .functions/package.json e package-lock.json se necessários; firebase.json apenas se houver ajuste necessário de entrega.

**Aceite**
- Testes HTTP com gzip/br negociado e sem compressão: o corpo decodificado corresponde ao HTML original.
- Testar resposta de sucesso, HEAD, redirecionamento e 404.
- Vary inclui Accept-Encoding sem apagar os campos existentes.
- Comparar os bytes transferidos nas mesmas páginas de produto e categoria. Meta inicial: aproximar o ganho de compressão observado, sem exigir esse percentual de todas as páginas.
- Conferir o resultado também no domínio publicado depois do deploy; a home continua funcionando.

**Rollback:** reverter somente a entrega de compressão e sua dependência explícita, quando adicionada, e executar o deploy do commit revertido.

## 2. Reduzir JavaScript e observadores desnecessários

**Evidência:** a home contém código exclusivo de ajustes de checkout dentro de content/code.json. Há observadores sobre document.body; jQuery, Popper e o bundle principal são scripts sem defer. A loja também usa código próprio que depende de jQuery.

**Execução**
- Extrair os ajustes exclusivos de checkout/carrinho para um módulo condicionado à rota correspondente, mantendo as funcionalidades atuais.
- Mapear os observadores de menus e busca; restringir o alvo e os eventos observados e desconectar quando o objetivo estiver concluído.
- Avaliar defer mantendo a ordem jQuery → Popper → bundle e reorganizar os fallbacks. Adicionar defer sem corrigir o fallback atual poderia baixar jQuery/Popper novamente antes de os scripts terminarem.
- Revisar o carregamento de widgets por rota. Checar duplicidade de eventos de GTM/Facebook/PIMI; não assumir duplicação apenas porque mais de uma ferramenta está presente.
- Manter frete, login/OAuth, busca e recursos comerciais intactos.

**Arquivos principais:** content/code.json; template/pages/@/scripts.ejs; template/pages/@/head.ejs; template/js/custom-js/pages.js; checkout.js e módulos próprios relevantes.

**Aceite**
- Código exclusivo de checkout ausente da home/categoria/produto e presente nas rotas necessárias.
- Menu desktop/mobile, busca instantânea e busca mobile, filtros, carrinho e login funcionam.
- Sem erros novos no console, downloads duplicados causados por fallback ou eventos de comércio duplicados.
- Comparar bytes de scripts e tarefas longas/TBT; avaliar responsividade com interações reais. Lighthouse/TBT não substituem uma medida de INP de usuários.

**Rollback:** reverter os módulos/condições e a ordem de scripts desta entrega; manter as outras melhorias independentes.

## 3. Remover a descoberta tardia das fontes

**Evidência:** o CSS importa Quicksand de Google Fonts com @import, nos pesos 300/400/700. display=swap já está habilitado.

**Execução**
- Identificar os pesos realmente usados e preservar o aspecto da marca.
- Servir WOFF2 local com licença e origem verificadas, usando uma família variável ou os arquivos necessários conforme o resultado da medição.
- Definir @font-face com font-display: swap e impedir que o tema gere simultaneamente o @import externo.
- Ajustar a configuração SCSS/webpack suportada; não editar node_modules nem o styles.scss gerado.
- Pré-carregar apenas a fonte efetivamente usada na primeira tela. Comparar a fonte local com a alternativa de stylesheet no head/preconnect se a hospedagem local não trouxer ganho.

**Arquivos principais:** template/scss/_variables.scss; template/scss/custom-css/_styles.scss ou parcial próprio; template/pages/@/head.ejs; assets de fontes com nomes versionados; storefront.webpack.js somente se necessário.

**Aceite**
- CSS final sem o @import tardio de Google Fonts.
- Sem downloads duplicados da família; fonte com licença preservada e cache compatível com versionamento.
- Comparação visual em mobile/desktop, incluindo preços, botões e banners.
- Sem regressão de CLS; comparar a cadeia de requests e o tempo até o texto final.

**Rollback:** restaurar a estratégia anterior de carregamento da fonte, preservando os arquivos anteriores até estabilizar a entrega.

## 4. Priorizar a imagem principal e estabilizar o layout

**Evidência:** a home possui 88 elementos img, muitos com lazy loading próprio. A ausência de width/height em 73 elementos é um ponto de investigação, não prova de CLS. A loja já entrega banners e fotos de produto em WebP; o banner mobile testado tem aproximadamente 78 kB e a foto mobile aproximadamente 10 kB.

**Execução**
- Identificar o elemento real de LCP da home e da página de produto antes de escolher o recurso prioritário.
- Aplicar fetchpriority=high somente à imagem principal quando apropriado, mantendo-a fora do lazy loading.
- Ajustar picture/srcset/sizes e dimensões ou aspect-ratio nos componentes que não reservam espaço.
- Validar o banner responsivo contra os ajustes recentes documentados em NOTAS.md, preservando o enquadramento.
- Manter lazy loading abaixo da primeira tela e investigar se algum preload/timer antecipa imagens desnecessárias.
- Otimizar imagens adicionais só quando houver desperdício comprovado, sem conversões em massa nem redução desnecessária da qualidade.

**Arquivos principais:** template/pages/@/sections/inc/banner.ejs; banner-slider.ejs; componentes ProductCard/TheProduct; template/scss/custom-css/_personalized-boxes.scss e estilos relacionados.

**Aceite**
- O request correto da imagem principal é priorizado em cada viewport, sem baixar simultaneamente as versões desktop/mobile.
- Banner, produtos e categorias preservam proporção e aparência.
- Sem lazy loading da imagem de LCP; imagens inferiores continuam carregando quando necessárias.
- Comparação de LCP/CLS e requests antes/depois. Metas de referência: LCP <= 2,5 s e CLS <= 0,1, sem apresentar esses valores como resultados já obtidos.

**Rollback:** reverter prioridades/reservas de espaço por componente e voltar às referências de imagens anteriores.

## 5. Ampliar o cache somente dos assets versionados

**Evidência:** banners locais têm max-age=300 e s-maxage=60. JS/CSS com hash e a foto de produto testada já têm cache de um ano.

**Execução**
- Dar nomes com hash ou versão confiável aos assets locais alterados: banners, logos e fontes.
- Criar regras específicas no Firebase para esses arquivos, permitindo cache longo e immutable.
- Atualizar as referências e manter os arquivos antigos disponíveis durante a transição.
- Preservar cache curto onde o nome é sobrescrito pelo CMS.
- Manter os ajustes no provedor de implantação atual; documentar equivalência Netlify apenas se ele voltar a ser usado.

**Arquivos principais:** firebase.json; fontes/imagens versionadas; content/home.json, settings.json ou componentes que as referenciam.

**Aceite**
- Apenas assets versionados recebem max-age longo/immutable.
- Cache já correto de JS/CSS permanece.
- Trocar um asset produz uma URL nova e ela aparece após atualizar a página.
- Preservar o no-store de pe-freight-config.json e o comportamento das configurações operacionais, preços/estoque e páginas de conta/carrinho/checkout. Esta entrega não amplia o cache de HTML dinâmico.

**Rollback:** restaurar referências e regras anteriores; as URLs antigas continuam válidas.

## 6. Padronizar o domínio para SEO

**Problema confirmado:** o site sem www redireciona para www, mas canonical e as 1.054 URLs do sitemap observado usam o domínio sem www. robots.txt já aponta para o sitemap com www.

**Execução**
- Usar www.pietroembalagens.com.br como domínio preferido, acompanhando o destino atual.
- Ajustar a fonte central do domínio e revisar canonical, Open Graph, sitemap e URLs de WebSite/Organization/Product/Breadcrumb.
- Manter os redirecionamentos existentes, evitando cadeias ou loops.
- Verificar efeitos da configuração de domínio sobre login/OAuth, PWA e integrações antes de publicar.
- Confirmar atualização dos documentos SSR em cache por meio do deploy/invalidação suportados. Não presumir que todos os documentos antigos deixam o cache imediatamente.

**Arquivos principais:** content/settings.json; template/pages/@/meta.ejs e @/json.ejs; templates de dados estruturados e configuração Firebase se houver necessidade real. O sitemap é gerado pelo framework a partir do domínio configurado.

**Aceite**
- Home, categoria e produto têm canonical para a própria URL preferida, que responde 200 sem redirecionar.
- Todas as URLs do sitemap gerado usam o domínio preferido.
- URLs antigas continuam redirecionando corretamente; preservar slugs, parâmetros funcionais e dados Product/Offer/Breadcrumb.
- robots, login e PWA continuam válidos. Não inventar avaliações, preços, disponibilidade ou promessas de ranking.

**Rollback:** reverter o ajuste central do domínio e os templates desta entrega e conferir redirecionamento/cache novamente.

## Forma de execução e implantação

- Preparar seis entregas separáveis, nessa ordem: compressão → JavaScript → fontes → imagens → cache → SEO.
- Para cada entrega: advisor valida a intenção → código e testes relevantes → build e verificação funcional → comparação antes/depois → advisor revisa diff/evidências/rollback → entrega concreta para revisão de Rafael → publicação e conferência.
- Ampliar o CI atual para rodar todos os testes existentes, além dos testes novos necessários; hoje o workflow de deploy executa apenas tests/freight.test.cjs.
- Não publicar alterações de frontend com falhas inexplicadas de layout, carregamento ou fluxo de compra.
- Se houver homologação Firebase disponível, utilizá-la. Um Hosting preview channel que continue apontando para a Function de produção não valida uma nova versão do handler SSR; a compressão precisa de teste local do handler e, quando disponível, backend de homologação independente.
- Respeitar o fluxo descrito em NOTAS.md: “Assistente prepara e mostra o diff” → “Rafael aprova” → “Commit + push no master”. A aprovação de produção ocorre sobre código e resultados concretos, não sobre um plano ainda sem implementação.
- Após aprovação, usar o workflow existente para deploy, conferir a conclusão e revalidar os headers/URLs/recursos na loja pública.
- Guardar o commit anterior e reverter somente a entrega que regredir. Manter registro de ganhos e problemas por entrega.

### Rollback preparado antes de cada deploy

1. Identificar a regressão, a entrega responsável, os deploys em andamento e o alvo anterior. Interromper a sequência de novas entregas.
2. Conferir a referência atual de master e preservar mudanças locais. Examinar commits posteriores antes de escolher o diff de reversão.
3. Preparar a reversão somente da entrega problemática, resolver conflitos preservando trabalho posterior e repetir as verificações afetadas. O procedimento deve estar documentado e revisado pelo advisor antes do deploy original; uma regressão exige confirmar que ele ainda se aplica ao estado atual.
4. Publicar a reversão pelo fluxo aprovado e acompanhar o CI. Conferir Hosting e SSR, metadados/headers, caches e o fluxo de compra afetado.
5. Registrar a versão efetiva, o resultado e o tempo real de recuperação. Não usar reset, force push ou restauração de uma tag sobre trabalho posterior.

**Limites do mecanismo atual:** firebase deploy publica Hosting e Functions; isso não é uma troca atômica. As rewrites apontam para a Function SSR por nome, e restaurar uma release de Hosting não restaura sua implementação. O predeploy também copia content/template para a Function, portanto até mudanças de fontes, imagens ou SEO podem exigir reversão do par. O revert normal exige novo build e deploy. O atalho de restaurar Hosting só será considerado para incidente estritamente estático, com release identificada e compatibilidade do SSR comprovada.

O SSR configurado com STOREFRONT_LONG_CACHE usa s-maxage de sete dias no renderer inspecionado. Conferir a invalidação e os cabeçalhos públicos, sem presumir que um deploy limpe todos os documentos antigos. O service worker usa skipWaiting, clientsClaim, precache e caches runtime: testar sessão nova, aba já aberta e PWA. Preservar assets antigos necessários durante a transição. Feature flags serão usadas onde já existirem ou tiverem benefício comprovado; não haverá uma nova arquitetura de flags como requisito genérico.

## Verificação comum às seis entregas

1. Suite existente: node --test tests/*.test.cjs, com resultados completos de aprovados/falhados/skipped.
2. Build: home, app/index, search, 404, blog e admin/index; acrescentar render/check de categoria e produto para as mudanças que os afetam.
3. Fluxos: home, menu e busca mobile/desktop, filtros, variação de produto, quantidade, preço, frete, adicionar/remover carrinho, login e etapas do checkout em contexto de teste, sem compra real.
4. Analytics: PageView/ViewItem/AddToCart e ausência de duplicação, sem disparar Purchase fictício em produção.
5. SEO: canonical, sitemap, robots, metadados e dados estruturados.
6. Comparação de performance em build de produção, com 3 a 5 execuções equivalentes e mediana; não usar o bundle de desenvolvimento como base.
7. Medir LCP/CLS e tarefas longas em laboratório; verificar INP através de interações e dados de usuários quando disponíveis. Metas de usuários reais no percentil 75: LCP <= 2,5 s, INP <= 200 ms, CLS <= 0,1. CrUX/Search Console usam janela de dados e não mostram imediatamente o efeito de um deploy.
8. Registrar bytes, requests, TTFB com a limitação do proxy/local de teste, screenshots e erros. Não prometer porcentagem de aumento de vendas sem experimento e dados.

## Entregáveis

- Seis mudanças revisáveis, com implementação e validação proporcionais a cada frente.
- Relatório antes/depois por entrega e lista explícita de qualquer medição ainda pendente.
- Testes de regressão relevantes e CI atualizado.
- Instruções de publicação e rollback por entrega.
- Registro técnico em NOTAS.md após a implementação aprovada.
- Parecer do advisor antes da implementação e antes da publicação de cada entrega; runbook de rollback revisado, alvo anterior e versão efetivamente publicada registrados.

Este documento é o plano de execução; não registra mudanças já publicadas no site.
