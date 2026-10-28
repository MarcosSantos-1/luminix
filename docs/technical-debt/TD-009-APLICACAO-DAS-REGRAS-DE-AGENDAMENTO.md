# TD-009 — Aplicação das regras no agendamento para clientes

Status: Aberta. Prioridade: P1 antes da abertura do agendamento público.

Data: 2026-10-25.

O onboarding persiste regras em `booking_policies` (ADR-017 e ADR-018), mas o fluxo de agendamento para
clientes ainda não aplica antecedência, horizonte, cancelamento ou remarcação. O recado também
não é publicado no portal. A interface informa essa limitação e não simula cobrança ou multa.

Antes de abrir o fluxo, implementar leitura operacional autorizada por clínica, aplicação dos
limites no servidor, fuso da clínica, concorrência, limites exatos de tempo e precedência:
exceção do serviço, cancelamento especial para `manual_release`, padrão da clínica. Remarcação
nula acompanha o prazo aplicável; valor explícito tem prioridade para remarcação. Limites novos
nulos em clínicas antigas precisam de definição explícita antes de ativação, sem inventar defaults
retroativos. A agenda administrativa deve ter política própria para exceções e auditoria.

Exibir orientações como texto simples e verificar a aceitação/ciência das regras quando o fluxo
for especificado. Implementar edição posterior segura das políticas antes de prometer alterações
no painel. Cobrir fronteiras de horário, isolamento entre clínicas, troca de sessão e mudanças
concorrentes; definir efeitos sobre reservas existentes. Vídeos explicativos dependem de conteúdo
real fornecido/aprovado, sem players falsos ou links vazios.

## Retenção, faltas e pacotes — evolução de 2026-10-27

Direção adotada e preferências implementadas na ADR-018: aviso tardio permitido, padrão sem
retenção, percentuais separados para alteração tardia e falta, exceção por serviço e pacotes
com sessões preservadas. O prazo sozinho não define consequência financeira. A mudança de
semântica dos prazos substitui o bloqueio anterior; o motor público ainda não foi implementado.

Base definida: valor antecipado efetivamente pago pelo atendimento avulso. Cancelamento devolve
saldo não retido; remarcação pode aproveitar esse saldo com eventual complemento, sem duplicar
retenção no mesmo evento. Antes de ativar, definir alocação de pagamentos/sinais, arredondamento,
conciliação, prevenção de abuso por remarcações sucessivas, cancelamento pelo estabelecimento,
isenções e tratamento de erros/disputas. Não usar automaticamente o valor de tabela ou de um pacote
como base. O exemplo de 25% é configurável e não representa padrão nem conclusão jurídica.

Consumo de sessão e cobrança posterior não foram adotados nesta configuração. Desistência da
compra de pacote e devolução de saldo continuam pendentes. Pagamento na clínica não fornece
meio para débito automático; avaliar sinal para reservas com custo antecipado. Reembolso parcial
é suportado pela Stripe, mas checkout, execução e conciliação ainda estão pendentes.
Validar políticas com assessoria jurídica, incluindo direitos legais de cancelamento. Mostrar a
consequência em reais/sessões antes da confirmação, guardar a versão aceita por reserva e permitir
isenção administrativa auditada. Alterações futuras não devem reescrever reservas já aceitas.
