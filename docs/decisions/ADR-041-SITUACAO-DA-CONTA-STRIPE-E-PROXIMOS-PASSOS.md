# ADR-041 — Situação da conta Stripe, avisos e próximos passos

Status: Accepted (implementado: migration 0070, API, "Receber pelo app" e avisos do painel)

Data: 2026-11-24

## Contexto

Depois de enviar o cadastro na Stripe, a dona via dois cards técnicos ("Liberado em teste") sem
saber se tinha dado certo, o que fazer enquanto a Stripe analisa e o que muda depois de aprovado.
O cadastro do espaço só avançava com a conta totalmente aprovada, embora a análise possa levar dias.

## Decisão

- **Situação para a dona** (`stripe_connect_accounts.notice_state`), calculada no banco a partir da
  leitura da Stripe: `filling` (falta preencher), `reviewing` (enviado, em análise), `approved`
  (pronto para receber), `needs_info` (a Stripe pediu algo depois do envio) e `restricted` (não
  aprovado). A tela mostra **um status claro** com texto humano; "Ambiente de testes" aparece só
  como etiqueta quando as chaves são de teste, e as orientações de dados de teste somem fora dele.
- **Fontes:** a cada abertura do painel (rota `GET payments/connect`) e por **eventos v2 da Stripe**
  (destino `ed_test_61VojfA7egQOcmjeH16VL3tDNt9PM54T0uTxh5SPQ4PQ`, payload _thin_, eventos de
  requisitos, capacidades e encerramento) em `POST /payments/stripe/account-events`
  (`STRIPE_CONNECT_ACCOUNT_EVENTS_SECRET`). O evento só traz o id da conta; a API relê a conta na
  Stripe e grava (`record_connect_status`).
- **E-mail uma vez por resposta** (`connectStatusEmail`): aprovado, pediu mais informação (só
  depois de o cadastro ter sido enviado) e não aprovado. "Em análise" não gera e-mail; aparece na
  tela e no aviso do painel. WhatsApp entra quando a conta da Meta for verificada.
- **Cadastro do espaço segue com a Stripe em análise:** o avanço com "pagamentos no app" exige só
  cadastro enviado sem pendências (`connectSubmitted`), não aprovação. As clientes só veem
  Pix/cartão com o interruptor ligado **e** a conta aprovada (`clinic_online_ready`); a reserva
  continua conferindo a Stripe na hora.
- **Avisos do painel** (carrossel, `settings:manage`): em análise ("Acompanhar"), falta informação
  ("Completar"), não aprovado ("Ver") e aprovado ("Prosseguir"), que leva a
  `/recebimentos#proximos-passos` e some quando o interruptor está ligado e o guia concluído.
- **"E agora?"** (`ConnectNextSteps`) depois da aprovação: interruptor "Clientes pagam pelo app"
  (`set_in_app_payments`, exige cadastro enviado), como a cliente paga, quais serviços entram,
  cancelamentos e devoluções, onde o dinheiro aparece (repasses) e o dia a dia na agenda, com
  botões para cada lugar e "Entendi, concluir" (`finish_payments_guide`).

## Consequências

- Migration 0070: colunas de situação na conta Connect e `guide_done_at` nas preferências;
  funções `SECURITY DEFINER` com autorização para o interruptor e o guia.
- O texto de taxas e prazos continua com os preços públicos da Stripe e pode mudar.
- Vídeo explicativo do dono fica para depois do lançamento (espaço ainda não reservado na tela).
