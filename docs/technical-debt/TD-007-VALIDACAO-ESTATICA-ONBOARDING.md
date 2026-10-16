# TD-007 — Validação estática preexistente do onboarding

Status: Aberta.

Data: 2026-10-16.

Módulo: validação do workspace (admin e API). Prioridade: P2. Resolver antes de clientes reais.

Ao validar a configuração de aparelhos alugados, `pnpm check` encontrou formatação preexistente
fora da alteração em `apps/admin/app/api/address/geocode/route.ts`, no CSS principal do onboarding,
em `address-map.tsx`, `hours-editor.tsx`, `apps/api/src/modules/auth/geocode.ts`,
`apps/api/tests/geocode.test.ts` e no teste de onboarding com alterações locais anteriores à tarefa.

O lint do admin também aponta imports sem uso, escrita de refs durante render e atualização
síncrona de estado em effects nos componentes preexistentes `steps.tsx` e `address-map.tsx`,
além de uma dependência ausente de effect no fluxo de CEP. Nenhuma dessas ocorrências foi
introduzida pelo modal de aparelhos; não foram silenciadas nem misturadas com uma refatoração
de endereço, mídia e equipe nesta entrega.

Impacto: o comando agregado não pode ser declarado verde, mesmo com verificações isoladas da
feature aprovadas. Corrigir os fluxos respeitando upload concorrente, busca de CEP e ciclo de vida
do mapa; executar formatação, lint e `pnpm check` após a correção. Preservar alterações locais de
outras tarefas durante essa manutenção.

A suíte da API apresentou 82 testes aprovados e uma falha preexistente em
`multi-tenant-core.test.ts`: a lista fixa de migrations esperadas termina na 0012, mas o workspace
já contém a 0013 versionada e a 0014 local de outra tarefa. Atualizar a expectativa junto da
entrega dessas migrations, sem versionar incidentalmente o trabalho local alheio. Risco futuro:
uma falha de baseline contínua pode ocultar regressões. Até a correção, reportar separadamente os
resultados direcionados e não declarar o check agregado aprovado.
