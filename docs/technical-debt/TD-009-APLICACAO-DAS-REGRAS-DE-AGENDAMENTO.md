# TD-009 — Aplicação das regras no agendamento para clientes

Status: Aberta. Prioridade: P1 antes da abertura do agendamento público.

Data: 2026-10-25.

O onboarding persiste regras em `booking_policies` (ADR-017), mas o fluxo de agendamento para
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

## Discussão de produto — 2026-10-27 (ainda não adotada)

Definir separadamente cancelamento/remarcação de horário, falta e desistência da compra de
tratamento/pacote. O prazo sozinho não define consequência financeira. Avaliar aviso de
cancelamento tardio em vez de impedir a cliente de liberar o horário; falta exige registro próprio.

Considerar regra padrão sem penalidade e exceções explícitas por serviço, inclusive aparelhos
alugados. O exemplo solicitado foi devolver 75% de um procedimento pré-pago, retendo 25%; ainda
definir evento, antecedência, base de cálculo e tratamento de remarcação e falta. Não adotar esse
percentual como padrão ou como conclusão jurídica. Para pacotes comuns, o usuário descreveu
cancelamento/remarcação de horários sem penalidade; desistência da compra e devolução de saldo
precisam de regra separada, considerando sessões já utilizadas.

Antes de implementar: decidir entre ausência de penalidade, retenção de valor pré-pago, consumo
de sessão e eventual cobrança posterior, evitando aplicação cumulativa automática. Pagamento na
clínica não fornece meio para débito automático; avaliar sinal para reservas com custo antecipado.
Reembolso parcial é suportado pela Stripe, mas o checkout e sua conciliação ainda estão pendentes.
Validar políticas com assessoria jurídica, incluindo direitos legais de cancelamento. Mostrar a
consequência em reais/sessões antes da confirmação, guardar a versão aceita por reserva e permitir
isenção administrativa auditada. Alterações futuras não devem reescrever reservas já aceitas.
