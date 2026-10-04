# Sugestões para completar frete grátis

Implementação de 06/09/2026. Base anterior: `576c174554386d9e1c4de6cc5681e40370e0d49e`, preservada no GitHub em `backup/antes-sugestoes-frete-20260906`. Essa base já contém o ajuste aprovado da PDP.

## Comportamento

- Carrinho lateral: até 2 sugestões. Carrinho completo: até 3, no lugar da recomendação genérica enquanto houver sugestões válidas. Sem vitrine nova na PDP ou no checkout.
- Só usa o mínimo e as modalidades retornadas pela API de frete para o CEP e o carrinho atuais. Não cadastra frete promocional para BA, DF, GO ou MS.
- Candidatos: mais quantidade de itens do carrinho, pares explicitamente cadastrados e produtos relacionados/histórico. Histórico não comprova compatibilidade; recebe descrição neutra. `curatedPairs` começa vazio.
- Exclui indisponíveis, estoque insuficiente, opções sem variação determinada, personalizados, kits e linhas especiais que poderiam sofrer mesclagem indevida.
- Simula a adição em uma cópia isolada do carrinho nativo. Quantidades referem-se ao anúncio/pacote completo, respeitando estoque e mínimo. Limite padrão de 5 anúncios adicionais por opção.
- Simula o frete das opções que atingem o mínimo, com os mesmos campos enviados pelo calculador real. Revalida preço, estoque e frete confirmado no clique. O carrinho nativo recalcula descontos e total após a adição; a sugestão informa acréscimo em produtos, não uma promessa de total final líquido.
- Frete zero de retirada não conta como entrega grátis. Prioriza uma modalidade realmente gratuita quando não existe escolha manual. Mantém a escolha explícita do cliente; modalidade desaparecida exige nova escolha.
- Mudança de CEP/itens invalida respostas anteriores. Cliques concorrentes nas sugestões ficam bloqueados. Falha de consulta remove sugestões e mantém o fluxo nativo disponível.
- Exibição progressiva (27/09/2026): o item do próprio carrinho aparece assim que o cálculo de frete responde; produtos relacionados entram em seguida; cada confirmação de frete grátis atualiza o card quando chega. Consultas de catálogo rodam em paralelo e requisições repetidas do mesmo produto são compartilhadas. Só o clique em Adicionar força leitura fresca (`pe_fresh`).
- Cache de sessão (27/09/2026): a última lista calculada fica em `sessionStorage` (`pe-freight-suggestions`) por 10 minutos, chaveada pelo carrinho + CEP. Minicart e página do carrinho reaproveitam a mesma resposta, inclusive enquanto o calculador nativo ainda está respondendo. Carrinho ou CEP diferente ignora o cache. O clique continua revalidando preço, estoque e frete.
- Cabeçalho do bloco mostra quanto falta para o frete grátis, barra de progresso e o mínimo do CEP. Card confirmado exibe "Frete grátis confirmado".

## Configuração e desativação

Arquivo: `template/public/pe-freight-config.json`, publicado em `/pe-freight-config.json` com `Cache-Control: no-store` e URL única por consulta, evitando recuperar configuração antiga pelo service worker em caso de falha de rede.

Para desligar: mudar somente `enabled` para `false`, criar commit e enviar ao `master`. Aguardar o workflow **Build and deploy** concluir. Depois da publicação, abas abertas atualizam a configuração a cada 60 segundos; novas visitas já recebem a versão desligada. Se a configuração falhar ou não responder em 8 segundos, as sugestões ficam desativadas. A desativação restaura a recomendação genérica do carrinho e os avisos anteriores; as correções do calculador permanecem. Para retirá-las também, usar a reversão integral abaixo.

`rolloutPercent` permite reduzir a exposição de 100 para um percentual menor com grupo persistido no navegador. Não é, sozinho, um experimento de conversão validado.

Outros campos: `maxCandidates` (até 24), `maxSimulations` (até 3), `maxAdditionalQuantity` (até 20), `excludedProductIds`, `curatedPairs`. Pares usam `sourceId`, `targetId` e, se necessário, `sourceVariationId`/`variationId`. Só cadastrar compatibilidade conferida.

## Reversão integral sem apagar histórico

1. Usar checkout limpo do `master` atualizado.
2. Localizar o commit `feat: suggest cart additions for verified free shipping` e os commits posteriores específicos desta entrega no histórico. Reverter primeiro os ajustes posteriores desta funcionalidade, do mais recente ao mais antigo.
3. Executar `git revert <SHA_DO_COMMIT>` e conferir o diff. O revert deve retirar apenas esta entrega e manter alterações posteriores.
4. Enviar ao `master` e acompanhar **Build and deploy** até sucesso.
5. Abrir o carrinho e conferir produto, CEP, cálculo e botão de finalizar compra.

Não usar `reset --hard` seguido de push forçado. A branch de backup é referência para comparação e recuperação; não deve substituir alterações posteriores. A reversão completa depende do deploy, não é instantânea. Não reverter apenas Hosting sem verificar compatibilidade com o SSR/functions e os nomes dos bundles.

## Validação

`node --test tests/freight.test.cjs`

`npm run build -- --prerender=index,app/index,search,404,blog,admin/index --prerender-limit=0`

O workflow de deploy executa os testes antes do build/publicação. Versão de Node do CI: 20.

Cenários obrigatórios: cache reaproveitado entre minicart e carrinho; sem CEP; troca rápida de CEP; falha da API; preço/estoque alterado; quantidade mínima; variação ausente; retirada; frete zero com cobrança final positiva; frete grátis em qualquer posição; escolha manual paga; clique repetido; carrinho sem sugestão válida; flag desligada; layout de celular.

Teste local com APIs reais: 8 anúncios de R$ 33,90 (R$ 271,20) + 2 anúncios de R$ 13,90 (R$ 27,80) atingiram R$ 299,00. Sedex manual foi mantido. Selecionar frete grátis atualizou o total de R$ 316,54 para R$ 284,61, já considerando desconto recalculado. Valores são evidência do teste, não regras fixas.

## Medição

Eventos no `dataLayer` e GA4: `pe_freight_suggestions_view`, `pe_freight_suggestion_click`, `pe_freight_suggestion_add`, `pe_freight_suggestion_refresh`, `pe_freight_available`, `pe_freight_applied`. Sem CEP, nome ou contato do cliente. Incluem versão/grupo e, conforme evento, superfície, ação, valor e itens.

O GTM usa a tag `GA4 - pe_freight`, acionada por `CE - pe_freight`, com o e-commerce do `dataLayer` habilitado. As dimensões de evento `pe_freight_surface` (`minicart` ou `cart`) e `pe_freight_action` (`image`, `name` ou `add`) permitem distinguir os cliques e as adições confirmadas. Os eventos permanecem associados à sessão e ao usuário no GA4, permitindo analisá-los antes de `begin_checkout`, `add_shipping_info`, `add_payment_info` e `purchase`. Para uma leitura por produto, use os itens de e-commerce enviados em cada evento.

## v2 (UI)

**Status:** no ar desde 03/10/2026 com `"ui": "v2"` para 100% dos visitantes (commit `3aacbf9d`). Backup e reversão abaixo.

Redesenho visual do bloco de frete grátis no minicart e na página do carrinho. O motor (`freight/core.js`, `service.js`, simulação, revalidação no clique, cache e eventos) não muda; só a apresentação.

**Backup antes da v2:** branch `backup/antes-frete-v2-20261003`, SHA `176a94396a0b269df9ef6cac8a5854fe889286e4` (o `master` de 03/10/2026).

### Flags (`template/public/pe-freight-config.json`)

- `"ui": "v1" | "v2"`, padrão `"v1"`. `uiVersion()` (em `freight/runtime.js`) retorna `'v2'` somente quando `config.ui === 'v2'` **e** `enabled()` é verdadeiro. Qualquer outro valor (`"V2"`, `"v3"`, ausente), `enabled: false`, bucket fora do `rolloutPercent`, falha de rede ou JSON inválido cai na v1.
- `"autoSelectFree": false`, padrão desligado. Com `ui: "v2"` e a flag ligada, depois de uma adição **vinda de uma sugestão com frete grátis confirmado**, o calculador seleciona o frete grátis sozinho. O marcador fica em `sessionStorage` (`pe-freight-auto`), vale 2 minutos e só para o mesmo carrinho e CEP (`core.fingerprint`); é descartado ao ser usado, por qualquer escolha manual da cliente, por outro carrinho/CEP ou ao expirar. Ao aplicar, a preferência explícita anterior do CEP é limpa (não fica fixada no frete grátis).
- A v1 continua no código, sem alteração, atrás de `v-if`/`v-else` em `FreightStatus.vue`, `FreightSuggestions.vue`, `ShippingCalculator.html`, `CartQuickview.html` e `TheCart.html`.

### Modalidades de frete no minicart (v2)

Com mais de uma modalidade, o minicart mostra as 3 primeiras (a selecionada sempre entra) e o botão "Ver mais N opções de entrega", que expande a lista no próprio minicart ("Ver menos opções" recolhe). Com uma só, mostra a linha compacta "{serviço} · Chega até DD/MM". Com `"minicart": false` (ver `docs/TESTE-SEM-MINICART.md`) o minicart nem abre; a v2 vale então só na página do carrinho.

### Onde a v2 vale

Só o minicart e a página do carrinho. O calculador só entra no ramo v2 quando recebe `pe-surface` (`minicart` ou `cart`), o que somente `CartQuickview` e `TheCart` fazem com `ui: "v2"`. Página de produto e checkout não recebem a prop e ficam como estão, mesmo com `ui: "v2"`.

### Prazo "Chega até DD/MM (dia)"

A regra de dias úteis e a lista de feriados continuam **só** em `content/code.json` (`html_head`), que agora expõe `window.peDeliveryDate = { somaUteis, textoData }`. `freight/delivery-date.js` usa esse global, somando postagem + transporte + produção, como o `ShippingLine` nativo. Dias corridos (`working_days: false`) mostram "Até N dias". Sem o global, o texto vira um nó isolado "N dias úteis", que o script do `code.json` converte.

### Medição

`pe_freight_version` do `track()` agora reflete `uiVersion()` (`'v1'` ou `'v2'`). `pe_freight_variant` (`treatment`/`control`) continua separando quem está dentro do bucket. Com a flag `autoSelectFree` ligada, `pe_freight_applied` também sobe quando a seleção foi automática.

### Publicação e reversão

1. Merge com `"ui": "v1"` (nada muda para a cliente). Esperar o **Build and deploy**.
2. Trocar para `"ui": "v2"` (e, se quiser, `rolloutPercent`). O bucket persistido (`pe-freight-bucket-v1`) mantém cada navegador no mesmo grupo.
3. **Rollback rápido, sem deploy de código:** mudar só `"ui"` para `"v1"`, commit e envio ao `master`. Abas abertas atualizam em até 60 segundos.
4. **Desligar tudo:** `"enabled": false`.
5. **Reversão integral:** `git revert` dos commits `feat(frete-v2):`, do mais recente para o mais antigo. Nunca `reset --hard` com push forçado.

Validação: `node --test tests/freight.test.cjs` e o build do README, mais os cenários obrigatórios acima com `ui: "v1"` e com `ui: "v2"` (incluindo 375px).
