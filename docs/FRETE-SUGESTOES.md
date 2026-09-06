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

## Configuração e desativação

Arquivo: `template/public/pe-freight-config.json`, publicado em `/pe-freight-config.json` com `Cache-Control: no-store`.

Para desligar: mudar somente `enabled` para `false`, criar commit e enviar ao `master`. Aguardar o workflow **Build and deploy** concluir. Depois da publicação, abas abertas atualizam a configuração a cada 60 segundos; novas visitas já recebem a versão desligada. Se a configuração falhar ou não responder em 8 segundos, as sugestões ficam desativadas. A desativação restaura a recomendação genérica do carrinho e os avisos anteriores; as correções do calculador permanecem. Para retirá-las também, usar a reversão integral abaixo.

`rolloutPercent` permite reduzir a exposição de 100 para um percentual menor com grupo persistido no navegador. Não é, sozinho, um experimento de conversão validado.

Outros campos: `maxCandidates` (até 24), `maxSimulations` (até 3), `maxAdditionalQuantity` (até 20), `excludedProductIds`, `curatedPairs`. Pares usam `sourceId`, `targetId` e, se necessário, `sourceVariationId`/`variationId`. Só cadastrar compatibilidade conferida.

## Reversão integral sem apagar histórico

1. Usar checkout limpo do `master` atualizado.
2. Localizar o commit `feat: suggest cart additions for verified free shipping` no histórico.
3. Executar `git revert <SHA_DO_COMMIT>` e conferir o diff. O revert deve retirar apenas esta entrega e manter alterações posteriores.
4. Enviar ao `master` e acompanhar **Build and deploy** até sucesso.
5. Abrir o carrinho e conferir produto, CEP, cálculo e botão de finalizar compra.

Não usar `reset --hard` seguido de push forçado. A branch de backup é referência para comparação e recuperação; não deve substituir alterações posteriores. A reversão completa depende do deploy, não é instantânea. Não reverter apenas Hosting sem verificar compatibilidade com o SSR/functions e os nomes dos bundles.

## Validação

`node --test tests/freight.test.cjs`

`npm run build -- --prerender=index,app/index,search,404,blog,admin/index --prerender-limit=0`

O workflow de deploy executa os testes antes do build/publicação. Versão de Node do CI: 20.

Cenários obrigatórios: sem CEP; troca rápida de CEP; falha da API; preço/estoque alterado; quantidade mínima; variação ausente; retirada; frete zero com cobrança final positiva; frete grátis em qualquer posição; escolha manual paga; clique repetido; carrinho sem sugestão válida; flag desligada; layout de celular.

Teste local com APIs reais: 8 anúncios de R$ 33,90 (R$ 271,20) + 2 anúncios de R$ 13,90 (R$ 27,80) atingiram R$ 299,00. Sedex manual foi mantido. Selecionar frete grátis atualizou o total de R$ 316,54 para R$ 284,61, já considerando desconto recalculado. Valores são evidência do teste, não regras fixas.

## Medição

Eventos no `dataLayer`: `pe_freight_suggestions_view`, `pe_freight_suggestion_add`, `pe_freight_suggestion_refresh`, `pe_freight_available`, `pe_freight_applied`. Sem CEP, nome ou contato do cliente. Incluem versão/grupo e, conforme evento, superfície, valor e itens. A configuração de coleta no GTM/GA4 e a associação com compra/margem precisam ser conferidas antes de afirmar impacto comercial. Emitir eventos não garante que o analytics já os esteja armazenando.
