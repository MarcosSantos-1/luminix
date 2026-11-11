# ADR-027 — Cadastro de clientes da clínica e vínculo com a conta Luminix

Status: Accepted (parte implementada: migration 0029 e API; vínculo, convite e anamnese pendentes)

Data: 2026-11-11

## Contexto

A ADR-012 criou `clinic_clients` como cadastro local. Faltavam edição, arquivamento, CPF, sexo,
consentimento de mensagens e proteção contra duplicidade. O produto precisa atender quem chega sem
conta (cadastro rápido), quem tem conta e quem será convidada, sem burocracia para a recepção.

## Decisão

- **Uma ficha por estabelecimento, com estados, não com tipos.** `rápido` (só nome e celular) →
  `convidada` (convite enviado) → `vinculada` (`client_profile_id` preenchido). O estado
  `vinculada` é derivado de `client_profile_id IS NOT NULL`; não existe coluna de estágio que possa
  divergir. O estado `convidada` será derivado da tabela de convites, ainda inexistente.
- **Duplicidade se resolve por vínculo e mesclagem, não por bloqueio.** Telefone repetido na mesma
  clínica pede confirmação (409 `Client requires confirmation`), porque telefone compartilhado é
  legítimo (mãe/filha, casal). CPF repetido na mesma clínica é recusado (índice único parcial
  `(clinic_id, tax_id)`), mas é permitido em clínicas diferentes.
- **CPF é dado opcional de cadastro, não credencial.** Guardado só com dígitos; formato garantido
  por CHECK e dígitos verificadores pela API (`isValidBrazilianTaxId`). A lista devolve CPF
  mascarado (`***.***.***-NN`); o número completo só sai na ficha detalhada, que exige
  `client:manage`. Perfis só com `client:read` (ex.: profissional) nunca recebem o CPF inteiro.
- **Consentimento de mensagens é fato datado:** `marketing_opt_in` e `marketing_opt_in_at` com
  CHECK de consistência. A data original é mantida enquanto o aceite continua; limpa ao revogar.
- **`sex` é sexo biológico, não gênero** (relevante para depilação e tratamentos íntimos). Domínio
  `female | male`, ou `NULL` quando não informado (migration 0030). Vale para o admin e para o
  cadastro da cliente no app. Os valores `other` e `undisclosed` da 0029 foram removidos.
- **Observações internas** (`notes`) continuam no schema e na API, mas a tela do admin não as
  exibe; notas já gravadas são preservadas nas edições.
- **Origem do cadastro** em `source` (`manager`, `import`, `client_app`).
- **Arquivar em vez de apagar.** Cliente arquivado sai da lista padrão e não recebe agendamentos;
  pode ser reativado. Não há exclusão física.
- **Expand/contract.** A função `create_clinic_client` (0006) foi mantida; a API nova usa
  `create_clinic_client_v2`, `update_clinic_client` e `set_clinic_client_status`. A função antiga
  pode ser removida em migration posterior, depois que nenhum deploy dependa dela.

### Decisões de produto acordadas, ainda não implementadas

- Login da cliente por Google/Apple ou e-mail + senha; celular é dado de contato, não método de
  login (evita custo de SMS/WhatsApp por login). Verificação de celular só ao vincular fichas.
- Convite por WhatsApp carrega o ID da ficha local; abrir o link e criar a conta vincula
  automaticamente. Vínculo espontâneo exige confirmação do celular e aceite da cliente.
- Anamnese compartilhável entre clínicas com aceite explícito único e revogável; ficha com
  validade de 180 dias e reconfirmação por clínica. Dado de saúde é sensível (LGPD).
- Gestor poderá mesclar cadastros duplicados, com auditoria e desfazer.

## Consequências

- Nenhuma associação automática com perfil global por telefone, e-mail ou CPF digitado na
  recepção (mantém a regra 8 do contrato em `17-NUCLEO-MULTI-TENANT.md`).
- Busca por CPF consulta apenas a própria clínica; não existe consulta global por CPF.
- Os testes dividem o app por teste porque o autenticador limita 30 requisições/min por IP
  (ver TD-003); o limite de produção não foi alterado.
