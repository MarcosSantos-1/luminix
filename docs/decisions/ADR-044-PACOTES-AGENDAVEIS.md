# ADR-044 — Pacotes agendáveis pela área da cliente

Status: Accepted (migration 0073, rotas `/client/*` e `PUT /clinics/:id/payments/package-mode`)

Data: 2026-11-24

## Contexto

Os pacotes só eram vendidos pela equipe. A cliente via os pacotes na área dela, mas não conseguia
agendar a partir deles. Parcelar pelo app não é viável agora: as parcelas são cobradas mês a mês.

## Decisão

- A cliente escolhe um pacote e **agenda a primeira sessão** (num combo, escolhe qual serviço).
- A forma de pagar segue `payment_preferences.package_payment_mode`, que já existia desde o
  onboarding e agora é editável em **Financeiro → Receber pelo app**:
  - `clinic_only`: o pacote é pago no espaço, onde a equipe combina o parcelamento. O horário leva
    `requested_package_id` e o atendimento no painel mostra "Primeira sessão do pacote X".
  - `in_app`: à vista pelo app (Pix ou cartão). Mudar para esse modo exige o pagamento pelo app ligado.
  - `both`: a cliente escolhe.
- `package_payment_options` devolve onde dá para pagar agora. Sem conta Stripe aprovada, só no espaço.
- **Pago pelo app** (`client_hold_for_package_payment`, `kind = 'package'`): o webhook cria o pacote
  da cliente (`client_packages` e itens), lança "Pacote pelo app" no Financeiro (categoria Pacotes,
  ligado ao pacote e não ao atendimento), registra o pagamento do pacote e usa a primeira sessão
  (`client_package_id`, preço 0).
- **Cancelar a primeira sessão** de um pacote pago pelo app não estorna: o pacote continua da
  cliente com todas as sessões (`claim_due_refunds` ignora `kind = 'package'`). Dinheiro que chega
  depois de o horário ser liberado (`paid_late`) continua voltando sozinho.

## Área da cliente (mesma entrega)

- Pagamento: "Só o sinal" e "Tudo agora" lado a lado, com marcador de seleção, separados das formas
  de pagamento por uma divisória. As formas de pagamento também ganham o marcador.
- Início: o carrossel deixa de ter um card por promoção e o "Onde fica". Fica um único card de
  promoções, com ilustração, que abre Serviços já filtrado por "Em promoção" (`?promocao=1`).

## Consequências

- O "Estornar" da equipe num pacote pago pelo app devolve o dinheiro, mas não cancela o pacote: a
  equipe cancela o pacote à mão.
- Informativos automáticos de agenda especial (aparelho alugado) ficam para depois.
