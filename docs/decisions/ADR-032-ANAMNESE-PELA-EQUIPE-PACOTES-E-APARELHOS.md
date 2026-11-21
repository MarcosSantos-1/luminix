# ADR-032 — Anamnese pela equipe, pacotes de sessões e aparelhos alugados

Status: Accepted

Data: 2026-11-18

## Contexto

A ficha de anamnese só podia ser preenchida pela cliente (ADR-030). Espaços vendem pacotes de
sessões e alugam aparelhos por dia (laser, ultrassom microfocado), mas o sistema não sabia de
nenhum dos dois: o cadastro inicial só guardava o nome do aparelho ligado aos serviços.

## Decisão

- **Anamnese pela equipe:** mesmo roteiro de `packages/contracts/src/anamnesis.ts`, sem a etapa de
  foto (a foto da ficha já existe no admin). Gravada em `clinic_clients.client_anamnesis` com
  `anamnesis_filled_by = 'staff'` por `staff_save_client_anamnesis` (`client:manage`). Nunca
  sobrescreve a ficha de uma cliente que compartilha a da própria conta (`anamnesis_shared`): 409.
  A lista recebe só o resumo (nível, data, quem preencheu) por `clinic_client_anamnesis_summary`;
  as respostas só saem no detalhe, por `staff_client_anamnesis`, que reautoriza `client:manage`.
  Opcional no "Adicionar cliente" e disponível em Dados → Ver anamnese na ficha.
- **Pacotes:** catálogo `service_packages` (um serviço, 2–100 sessões, preço, validade opcional).
  A venda (`client_packages`) copia nome, sessões e preço, e pode lançar a receita no Financeiro
  na mesma transação (`finance:manage`). Cada agendamento ligado (`appointments.client_package_id`)
  usa uma sessão e fica com preço 0. Sessão usada = agendada, confirmada, concluída ou falta;
  cancelamento devolve a sessão. `use_client_package` trava a linha do pacote e confere cliente,
  serviço, validade e saldo.
- **Aparelhos alugados:** `resources` (tipo `equipment`) ganha fornecedor, custo de costume e
  status; `resource_rentals` guarda períodos de até 62 dias com custo opcional e a despesa
  lançada no Financeiro. Serviços `manual_release` ligados a um aparelho passam a aceitar
  autoagendamento **só nos dias de aluguel**; sem aparelho ligado continuam fora da agenda da
  cliente, como antes. A gestora recebe o aviso `equipment` (chave mestra) fora desses dias.
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
