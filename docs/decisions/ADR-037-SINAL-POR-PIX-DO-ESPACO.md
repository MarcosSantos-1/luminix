# ADR-037 — Sinal por Pix do espaço e regras aplicadas

Status: Accepted (migration 0063, rotas `/client/*` e `/clinics/:id/appointments/:id/deposit/confirm`,
Configurações → Regras e combinados, área da cliente no site).

Data: 2026-11-23

Substitui em parte: ADR-019 e ADR-020 quanto à cobrança. Continua valendo que o sinal é
configurado por serviço (`deposit_scope = 'selected'` + `services.deposit_required`), que a
retenção nunca passa do sinal e os três destinos da ADR-020.

## Contexto

O sinal era só configuração: nada era cobrado, e a tela de Regras prometia um sistema que não
existia. A cobrança dependia do Stripe (ADR-016), que exige cadastro, tem taxa e ainda não está
ativo para a maioria dos espaços. Na prática, salões e studios já pedem sinal por Pix pelo
WhatsApp, à mão.

## Decisão

O Luminix organiza o sinal sem tocar no dinheiro: **a cliente paga no Pix do próprio espaço e a
equipe confirma**.

1. **Configuração:** em Regras e combinados, o espaço liga "Pedir sinal por Pix" e informa a
   porcentagem, os serviços com sinal, a chave Pix (CPF, CNPJ, e-mail, celular ou aleatória), um
   nome opcional e o prazo para pagar (`deposit_hold_minutes`, 15 min a 24 h; padrão 2 h). Sem
   chave Pix o sinal não é pedido (`service_requires_deposit`).
2. **Reserva:** quando a cliente agenda um serviço com sinal (preço fixo), o atendimento é criado
   como `scheduled` com `deposit_status = 'awaiting'`, `deposit_cents` (porcentagem do preço
   congelado no atendimento, promoção incluída) e `deposit_due_at` (agora + prazo, nunca depois
   do início). O horário fica ocupado.
3. **Pagamento:** a API devolve o **Pix copia-e-cola** (BR Code estático do Banco Central com
   valor, nome, cidade e referência, `src/shared/pix.ts`), gerado na hora a partir da chave, sem
   PSP. A cliente paga e toca em "Já paguei" (`reported`): a reserva para de expirar.
4. **Confirmação:** a equipe confere o extrato e toca em "Confirmar sinal recebido"
   (`staff_confirm_deposit`, permissão `agenda:manage`). O sinal vira um lançamento de entrada
   Pix do atendimento (abatido do total) e um serviço `instant` passa a `confirmed`. É idempotente.
5. **Expiração:** sem confirmação nem aviso da cliente até o prazo, o atendimento é cancelado com
   `cancellation_origin = 'deposit_expired'` e o horário volta a ficar livre. A expiração é
   preguiçosa (`expire_deposit_holds`), executada antes de ler horários livres, a agenda, o início
   e antes de a equipe agendar. Não há job agendado.
6. **Apps antigos:** um agendamento de serviço com sinal sem `deposit: 'pix'` no corpo recebe
   409 `Deposit required`, para nenhum app que não mostra o código prender um horário que a
   cliente não consegue pagar. O site já envia o campo; o app Expo ainda não (TD-012).

### Regras aplicadas (TD-009)

- Antecedência e janela já valiam nos horários livres.
- Cancelar segue o prazo do serviço, depois o prazo dos especiais (`manual_release`), depois o do
  espaço (`client_change_deadline_minutes`).
- Remarcar sem prazo próprio segue esse mesmo prazo de cancelamento.
- Uma reserva aguardando sinal pode ser desistida a qualquer momento (nada foi pago).

### Tela

Regras e combinados deixa de embutir as etapas do onboarding. Cada regra é uma linha curta com
os valores em chips; o sinal tem cartão próprio, com a lista de serviços e o valor do sinal ao
lado de cada um; "Se a cliente desistir" só aparece com sinal ligado; um resumo "Como a cliente
vê" acompanha as mudanças.

## Alternativas consideradas

- **Esperar o Stripe:** deixaria o recurso parado e cobraria taxa de quem já recebe por Pix.
- **QR Code dinâmico com conciliação automática:** exige PSP/banco com API e credenciais por
  espaço. Fica como evolução (o Stripe também resolve).
- **Job de expiração:** a expiração preguiçosa cobre todas as leituras relevantes sem infraestrutura
  nova. Um job pode ser somado quando houver avisos por e-mail/WhatsApp.

## Consequências e riscos

- A conferência é manual: um "Confirmar" por engano registra um pagamento que não existe. O
  lançamento pode ser estornado no Financeiro.
- Devolução e "ficar com o sinal" continuam manuais, combinadas entre espaço e cliente. O Luminix
  registra a regra escolhida e a mostra antes da confirmação.
- A chave Pix do espaço aparece para clientes vinculadas que agendam serviços com sinal.
- Avisos automáticos (sinal confirmado, horário liberado) ainda não são enviados; a cliente vê o
  estado na área dela.
- O app Expo recebe `Deposit required` em serviços com sinal até ganhar a tela do Pix (TD-012).

## Quando revisar

Ao ativar pagamento pelo Stripe, notificações por e-mail/WhatsApp ou um job de tarefas agendadas.
