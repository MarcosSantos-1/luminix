# TD-015 — Cancelamentos por mudança de agenda: pendências

ID: TD-015
Data: 2026-11-22
Módulo: `apps/api/src/modules/operations/schedule-impact.ts`, migration 0057

Problema:

1. WhatsApp ainda não é enviado; só e-mail e aviso na área da cliente.
2. E-mail sem fila/retry: uma falha do provedor só fica no log.
3. Editar o aparelho (serviços ligados), arquivar ou excluir o aparelho e arquivar uma
   profissional ainda não passam pela prévia de afetados.
4. Combos: a verificação de aparelho/dia exclusivo usa o serviço principal do agendamento,
   não cada item do combo.
5. Não há compensação automática (voucher de cortesia) como no legado; a gestora decide.

Impacto atual: baixo (sem clientes reais).
