# TD-001 — Riscos do legado e pendências da preparação

Data: 2026-09-10

Status: aberto; correção fora do escopo do inventário.

Módulo: migração do legado / documentação arquitetural.

## Problema e evidência

O [inventário](../12-INVENTARIO-LEGADO.md) registra R01–R12: autenticação administrativa simulada, lacunas de autorização, manutenção sem segredo obrigatório, divergência schema/migrations, seed destrutivo e demais riscos de migração. São condições preexistentes observadas estaticamente, não defeitos introduzidos no Luminix. O estado em produção não foi verificado.

Além disso, a ADR-001 e os mapas iniciais ainda colocam o painel global dentro do Luminix. O usuário esclareceu que o painel corporativo será externo e reunirá outros produtos. O inventário registra esse esclarecimento; sincronizar a arquitetura em uma revisão específica antes de criar qualquer aplicação global.

## Impacto e tratamento

Prioridade: P1 para impedir reaproveitamento dos fluxos inseguros e baseline inconsistente; P2 para sincronizar a fronteira documental antes do bootstrap afetado.

Workaround atual: legado somente como referência, sem execução ou importação automática. Isso não corrige eventual implantação existente.

Resolver: segurança antes de portar os endpoints afetados; migrations antes de usar o histórico como baseline; datas/dinheiro antes de importar dados; fronteira corporativa antes de implementar gestão global.

Não encerrar o item apenas por ter documentado os riscos. Ao implementar as correções, associar cada risco à alteração e à evidência de validação, desdobrando itens quando necessário.

## Atualização documental — 2026-09-10

A pendência de fronteira corporativa foi resolvida na ADR-002 e nos mapas ativos. Os riscos R01–R12 do legado permanecem abertos; esta atualização não encerra o item nem implementa correções.
