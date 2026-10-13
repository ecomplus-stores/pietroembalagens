# Rollback da loja de produção

Use este procedimento junto de `AGENTS.md` e `PLANO-VELOCIDADE.md`. O advisor deve revisar o procedimento específico antes de cada publicação; a aprovação de Rafael continua necessária para publicar a mudança concreta.

## Registro inicial desta entrega

- Branch de preparação: `perf/controle-deploy-rollback`.
- Base da implementação: `543d3514cb3e7f4cf2b20edc48b1c9cf35559ddd`.
- Último Actions reportado como sucesso na inspeção: [execução 38400314633](https://github.com/ecomplus-stores/pietroembalagens/actions/runs/38400314633), para esse SHA.
- O workflow anterior podia terminar com sucesso sem deploy quando os artefatos faltavam. Portanto o status verde, sozinho, não identifica a release efetivamente publicada.
- Release Hosting e versão/configuração efetiva da Function não foram consultadas na máquina local, que não tem a credencial Firebase. O workflow preparado passa a identificá-las automaticamente antes do deploy, reutilizando a autenticação existente do CI. Se a captura falhar, a publicação não começa. Não preencher esses campos por suposição.
- Esta preparação não mudou a aplicação nem foi publicada em produção.

## Ficha obrigatória por entrega

Antes do deploy, registrar no PR/registro da entrega:

1. Commit aprovado e commit isolado a reverter; listar qualquer outro commit necessário para desfazer a entrega.
2. Última versão comprovadamente funcional: execução do Actions, release Hosting e versão/configuração SSR acessíveis.
3. Recursos afetados: Hosting, Function, configuração, imagens/fontes, cache e PWA.
4. Evidências de testes e parecer do advisor; aprovação da publicação.
5. Comandos ou ações de reversão conferidos, permissões disponíveis e verificações posteriores.
6. Tempo de recuperação observado num ensaio seguro, quando possível; caso contrário registrar que o tempo é desconhecido. Não prometer reversão instantânea.

## Quando interromper a implantação

Interromper as novas entregas e investigar/reverter quando houver falha comprovada de renderização, erro novo em menu/busca/carrinho/login/checkout, preço/frete incorreto, asset essencial quebrado, regressão visual relevante ou deploy parcialmente concluído. Não aguardar ganhos de performance para tolerar uma falha comercial.

## Reverter somente a entrega responsável

1. Conferir os workflows em andamento e qualquer publicação manual/externa. A concorrência deste workflow não controla o console Firebase ou pipelines de outros repositórios.
2. Registrar a regressão, o alvo anterior e a situação atual de `master`.
3. Preservar alterações locais antes de trocar de branch. Buscar a referência remota e criar uma branch de rollback a partir do `master` atual; examinar commits posteriores.
4. Preparar `git revert --no-commit` do commit isolado. Para um commit de merge, conferir o parent correto antes de usar `-m`; não presumir que o parent 1 é sempre adequado.
5. Resolver conflitos sem eliminar trabalho posterior. Revisar o diff de reversão com o advisor e conferir que o procedimento previamente aprovado ainda se aplica.
6. Executar os testes afetados, a suíte existente e as verificações do build. Confirmar que os artefatos e o pacote SSR são válidos.
7. Apresentar a reversão concreta para aprovação e publicá-la pelo fluxo do repositório. Não usar reset, force push ou restaurar uma tag inteira por cima de commits posteriores.
8. Acompanhar o Actions e confirmar o resultado de Hosting e Functions; um comando de deploy completo pode falhar depois de publicar apenas parte dos recursos.

Exemplo para commit comum, após preservar arquivos locais e preencher os valores reais:

```bash
git fetch origin master
delivery_commit='SHA_DA_ENTREGA_A_REVERTER'
rollback_branch='rollback/NOME_DA_ENTREGA'
git show --stat "$delivery_commit"
git switch -c "$rollback_branch" origin/master
git revert --no-commit "$delivery_commit"
git diff --check
node --test tests/*.test.cjs
```

Não executar o bloco com os placeholders. Preparar a reversão não publica a loja; os passos de commit/push/merge seguem a aprovação concreta prevista em `NOTAS.md`.

## Conferir a recuperação

- Home, categoria e produto: status HTTP, conteúdo e JS/CSS referenciados.
- Respostas SSR: headers, negociação de compressão quando aplicável, canonical e versão efetivamente servida.
- Fluxos afetados de menu/busca, variação/quantidade, carrinho, preço, frete, login e checkout em contexto de teste, sem compra real nem Purchase fictício.
- Sessão limpa, aba já aberta e PWA: service worker e caches podem manter versões diferentes após o deploy.
- Confirmar invalidação suportada dos slugs afetados, se necessária; a rota PURGE também deve ter resposta de sucesso comprovada.
- Registrar commit/release resultantes, horário, tempo de recuperação e qualquer pendência.

## Limites e alternativas

O fluxo atual publica Hosting e Functions. Restaurar apenas Hosting pelo console não restaura o handler SSR nem os templates/conteúdo copiados para a Function. Considere esse atalho somente para incidente estritamente estático e após comprovar compatibilidade e impacto sobre mudanças posteriores.

O caminho normal de `git revert` exige um novo build/deploy. Não há um tempo garantido de recuperação antes de ensaiar o mecanismo real.

O CI passa a guardar `hosting-build.tar.gz`, `ssr-source.tar.gz` e `deployment.json`, com lista explícita e hashes. São evidências do build preparado, não prova de publicação nem autorização para redeploy direto. Não incluem a chave Firebase ou a raiz completa da Function. O cache de dados `.ecom.json` é validado e tem hash registrado quando presente, mas fica excluído do arquivo até verificar explicitamente que seu manifest contém apenas dados públicos; portanto o arquivo SSR não deve ser apresentado como um pacote completo de redeploy.

`production-before.json` e `production-after.json` registram os identificadores reais de Hosting e a `versionId` do SSR, além de horários/runtime/entryPoint/status. A captura faz somente leituras autenticadas, sem guardar environmentVariables, tokens, conta de serviço ou respostas completas. A baseline é enviada como artefato antes de iniciar o deploy, para conservá-la mesmo se o runner cair durante a publicação. A falta da captura/upload da baseline bloqueia o deploy; falha na captura posterior exige conferir a produção, porque o deploy pode já ter terminado. Se o deploy falhar parcialmente, conservar a baseline anterior para investigação.

O prazo inicial de retenção dos artefatos é 14 dias: identificar sua disponibilidade antes de contar com eles para investigar um incidente. Os identificadores registram versões de recursos; não tornam Hosting/Functions uma troca atômica nem criam um mecanismo automático de reversão.

Um caminho de recuperação por artefatos só poderá ser chamado de rápido depois de validar autenticação, compatibilidade de Hosting/SSR, integridade e o redeploy em contexto seguro.
