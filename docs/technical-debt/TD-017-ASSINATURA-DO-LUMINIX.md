# TD-017 — Assinatura do Luminix: pendências

ID: TD-017
Data: 2026-11-24
Módulo: `apps/api/src/modules/billing`, `clinic_subscriptions`, `manager-plan.tsx`

Problema:

1. Stripe Billing não configurada (aguarda CNPJ da Kommite): sem preços, chaves e webhook, o
   botão de pagar fica desligado. Testar o fluxo completo em modo teste antes de abrir.
2. Pix não renova sozinho: falta lembrete (e-mail/aviso) alguns dias antes do "pago até".
3. Sem e-mails de assinatura (boas-vindas ao plano, falha no cartão, só leitura).
4. A área do cliente (site/app) já explica "agendamento online pausado" ao tentar marcar, mas a
   página do espaço ainda oferece os horários antes disso; esconder a reserva com o espaço pausado.
5. Nota fiscal do Luminix para a clínica depende da contabilidade/CNPJ (fora do sistema).
6. Cortesia (`complimentary_until`) e ajustes manuais só por SQL; falta tela interna.
7. O bloqueio de chaves `sk_test_` do cliente Stripe (ADR-016) precisa ser revisto para cobrar
   de verdade.

Impacto atual: baixo (sem clientes pagantes; clínicas de teste com prazo até 22/12/2026).
Risco futuro: clínicas ficarem só leitura sem conseguir pagar (1), Pix vencer sem aviso (2).
Quando deve ser resolvido: 1 e 7 antes de 22/12/2026; 2–4 no primeiro ciclo de cobrança.
Prioridade: P1
Status: aberto
