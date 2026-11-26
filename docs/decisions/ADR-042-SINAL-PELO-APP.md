# ADR-042 — Sinal pelo app e área da cliente em etapas

Status: Accepted (migration 0071, rotas `/client/*`, agenda do admin e área da cliente no site)

Data: 2026-11-24

Complementa: ADR-037 (sinal por Pix do espaço) e ADR-040 (pagamento do atendimento pelo app).

## Contexto

Em serviço de beleza, pagar tudo antes ao agendar é incomum; o problema real é a falta e o
cancelamento em cima da hora em serviços longos ou caros. O sinal já existia por Pix do próprio
espaço (ADR-037), com conferência manual. Com o recebimento pelo app ligado, a tela não pedia chave
Pix e o sinal simplesmente não era cobrado (TD-009). O pagamento pelo app (ADR-040) só cobrava o
valor cheio.

## Decisão

1. **Quando há sinal:** serviço marcado com sinal, preço fixo e o espaço consegue cobrar — chave
   Pix própria **ou** recebimento pelo app com conta Stripe aprovada
   (`service_requires_deposit`).
2. **Com recebimento pelo app:** ao agendar, a cliente escolhe **"Pagar só o sinal"** ou
   **"Pagar tudo agora"**, por Pix ou cartão. Pagar no espaço sem sinal não é aceito
   (`409 Deposit required`). O valor do sinal é calculado no servidor a partir do preço congelado
   no atendimento (`deposit_share`, mesma regra do Pix do espaço). Abaixo de R$ 0,50 (mínimo da
   Stripe) só existe a opção de valor cheio.
3. **Reserva:** `client_hold_for_online_payment(..., p_deposit)` guarda `online_payment_kind`
   (`full`/`deposit`) e `online_payment_cents`; a sessão de Checkout recebe esse valor e a
   descrição "Sinal · serviço". `online_payments.kind` registra o tipo da cobrança.
4. **Pago:** o webhook lança "Sinal pelo app" no Financeiro e marca o sinal do atendimento como
   confirmado (`deposit_status = 'confirmed'`). O restante continua em aberto e é cobrado no
   atendimento como qualquer valor pendente (`appointment_paid_cents`). Estorno, expiração e
   "pago depois do prazo" seguem a ADR-040 com o valor efetivamente cobrado.
5. **Sem recebimento pelo app:** continua o Pix do espaço (ADR-037).
6. **Equipe:** card da agenda com "Sinal pago"; no atendimento, "Sinal de R$ X pago (pelo app)" e
   "Falta receber R$ Y no atendimento" (o valor só para quem vê dinheiro).
7. **Comprovante:** `GET /client/spaces/:slug/appointments/:id/receipt` devolve o recibo da Stripe
   (`receipt_url` da cobrança na conta da clínica) só de um atendimento da própria cliente.

### Área da cliente

- Agendar em etapas em qualquer tela (Serviço → Profissional → Horário → Pagamento → Confirmar),
  centralizado, com busca de serviços e indicador de etapas clicável para voltar.
- Serviços especiais (`manual_release`) com a marca "Agenda especial" e explicação; serviços com
  sinal com a marca "Sinal R$ X" (lista de serviços, agendamento e detalhe).
- Avisos em toast (`components/client-app/toast.tsx`) no lugar de parágrafos soltos na página; o
  retorno da Stripe deixou de entrar no grid da agenda (que desmontava o calendário).
- Histórico: sinal e restante aparecem separados; pagamento pelo app tem "Comprovante".
- Início: destaques em 2:1 (formato dos cards de promoção/marketing do espaço), passando sozinhos a
  cada 5 s, pausando com o ponteiro, o foco, o toque ou "reduzir movimento".

## Consequências

- O app Expo ainda não oferece "só o sinal"; ele continua recebendo `409 Deposit required` em
  serviço com sinal sem Pix do espaço (TD-012).
- Devolução parcial (ficar com o sinal numa falta) continua manual (TD-018).
- A assinatura e o e-commerce seguem fora desta decisão.

### Configuração após o cadastro

- Em **Financeiro → Recebimentos pelo app → Configurar sinais**, ou em **Configurações → Rotina →
  Pagamentos**, a equipe com `settings:manage` acessa o mesmo editor de **Regras e combinados**.
  O editor usa a política da clínica, aceita percentual inteiro de 1 a 100 e lista os serviços de
  preço fixo. O valor exibido por serviço é uma estimativa. A reserva usa o preço final calculado
  pelo servidor, com a promoção aplicável.
- A tela deixa explícita a devolução integral dos pagamentos Stripe em cancelamentos e orienta a
  equipe a revisar faltas e usar **Estornar** quando for devido. As preferências de devolução do
  Pix do espaço são combinados tratados pela equipe. A janela de cancelamento pelo app não define
  direitos legais da cliente. O site exibe a forma de devolução antes do pagamento.
