# ADR-032 — Anamnese pela equipe, pacotes de sessões e aparelhos alugados

Status: Accepted

Data: 2026-11-18

## Contexto

A ficha de anamnese só podia ser preenchida pela cliente (ADR-030). Espaços vendem pacotes de
sessões e alugam aparelhos por dia (laser, ultrassom microfocado), mas o sistema não sabia de
nenhum dos dois: o cadastro inicial só guardava o nome do aparelho ligado aos serviços.

## Decisão

- **Anamnese pela equipe:** mesmo roteiro de `packages/contracts/src/anamnesis.ts`, sem a etapa de
  foto (a foto da ficha já existe no admin). A migration 0056 guarda as respostas da equipe em
  `staff_anamneses`, isoladas por clínica. A ficha da conta e as respostas enviadas pela cliente
  ao espaço continuam independentes. A leitura da equipe prioriza a versão clínica e usa a
  ficha autorizada anterior quando ela ainda não existe. A lista expõe nível, data e autoria.
  Ler respostas e gravar a versão clínica exigem `client:manage`. O atalho fica no Resumo e em Dados.
- **Pacotes:** catálogo `service_packages` (um serviço, 2–100 sessões, preço, validade opcional).
  A venda (`client_packages`) copia nome, sessões e preço, e pode lançar a receita no Financeiro
  na mesma transação (`finance:manage`). Cada agendamento ligado (`appointments.client_package_id`)
  usa uma sessão e fica com preço 0. Sessão usada = agendada, confirmada, concluída ou falta;
  cancelamento devolve a sessão. `use_client_package` trava a linha do pacote e confere cliente,
  serviço, validade e saldo.
- **Aparelhos alugados:** `resources` (tipo `equipment`) ganha fornecedor, custo de costume e
  status; `resource_rentals` guarda períodos de até 62 dias com custo opcional e a despesa
  lançada no Financeiro. A agenda usa os períodos de aluguel dos aparelhos ativos ligados ao serviço.
  Equipe e clientes só podem marcar ou remarcar quando as datas de toda a visita estão cobertas.
  Serviços com liberação manual sem aparelho ou sem aluguel ficam indisponíveis.
  A mesma verificação cobre todos os tratamentos de um combo e ocorre na gravação do agendamento.
  Remover um aluguel anula a despesa ligada quando a pessoa pode mexer no Financeiro.
- **Admin:** Serviços em abas (Serviços, Pacotes, Aparelhos alugados), pausados visíveis e
  esmaecidos com "Despausar", "Novo serviço" em etapas e tabela de preços em PDF (página de
  impressão), Excel (`lib/xlsx.ts`, sem dependência) ou texto para WhatsApp. Promoções passam
  para Marketing; Serviços mostra uma faixa com atalhos.

## Consequências

- Migration 0042 é aditiva; novas tabelas com RLS + FORCE, auditoria e trava de tenant.
- Pendências em [TD-014](../technical-debt/TD-014-ANAMNESE-PACOTES-E-APARELHOS.md).

A ficha da cliente concentra os pacotes vendidos em Histórico, junto dos atendimentos,
remarcações, cancelamentos e sessões associadas. A venda é registrada em Serviços → Pacotes.

## Revisão 2026-11-22 — pagamento do pacote, progresso e voucher de serviço (migration 0060)

- **Pagamento:** na venda escolhe-se `payment_plan` = pago agora, a cada sessão ("pedalada") ou
  depois. Cada parcela é uma receita no Financeiro ligada ao pacote em
  `client_package_payments`; saldo = preço − parcelas ativas (nunca passa do preço).
  `POST client-packages/:id/payments` exige `finance:manage`.
- **Progresso:** a lista de pacotes da cliente devolve as visitas em ordem (1/N, 2/N…). Ao
  agendar, os pacotes ativos aparecem antes dos serviços com uma barrinha por sessão (feita,
  marcada, falta, livre), o valor pago/restante e "Receber R$ X".
- **Combo:** o número de sessões vale para o combo inteiro (cada visita faz todos os
  tratamentos), escolhido na etapa 3 do "Novo pacote".
- **Voucher "Serviço grátis":** `discount_type = 'service'` com `service_id`; só serve para
  aquele serviço e zera o preço do atendimento.
