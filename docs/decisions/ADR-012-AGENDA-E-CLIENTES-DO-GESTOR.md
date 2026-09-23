# ADR-012 — Agenda e clientes do gestor

Status: Accepted

Data: 2026-09-23

## Contexto

O legado Charme & Bela possui cadastro local de clientes, funcionamento semanal, exceções por data
e uma agenda na qual a gestora pode marcar fora do expediente ou sobrepor atendimentos. No Luminix,
essas capacidades precisam pertencer à clínica, respeitar o fuso configurado e não enfraquecer as
travas do futuro autoagendamento do cliente.

## Decisão

- `clinic_clients` continua sendo o cadastro local. Telefone/e-mail não vinculam automaticamente
  uma identidade ou `client_profile`; essa associação exigirá prova/aceite próprio.
- Disponibilidade base fica em `weekly_availability`, por clínica e dia da semana. Uma data pode
  substituir a regra em `schedule_overrides`, inclusive para horário ampliado ou fechamento.
- Períodos são horários civis locais `HH:mm`; agendamentos são instantes `timestamptz`. A API
  converte data/hora informada pela gestora usando `clinic_settings.timezone`.
- `appointments` possui FKs compostas pelo tenant para cliente, serviço, profissional opcional e
  membership criadora. Não existe constraint de exclusão de sobreposição: ela impediria a chave
  mestra antes que a regra de capacidade configurável estivesse completa.
- A API administrativa calcula avisos de passado, horário fora da disponibilidade e sobreposição.
  Se houver aviso não confirmado, responde 409; após confirmação explícita, grava os códigos em
  `override_reasons` para que a exceção permaneça visível e auditável.
- O futuro endpoint do cliente não poderá enviar/confirmar esses overrides. Deve aceitar apenas
  slots efetivamente disponíveis e revalidar capacidade dentro da transação.
- Alterar disponibilidade não cancela agendamentos existentes automaticamente. Um preview global
  de afetados será implementado antes de oferecer fechamento/redução em uso real.
- Escritas de runtime passam por funções `SECURITY DEFINER` restritas e reautorizam a permissão;
  a role `luminix_api` permanece sem escrita direta em tabelas.

## Consequências

- A chave mestra é uma exceção explícita, não um bypass silencioso ou uma rota separada sem regra.
- A disponibilidade inicial é da clínica; disponibilidade/bloqueio por profissional e recursos
  compartilhados ficam para evolução versionada do modelo.
- Pagamentos, pacotes, vouchers, cancelamentos financeiros, máquinas e notificações do legado não
  entram neste recorte e não são inferidos pelo status do agendamento.
- Migration 0006 é aditiva. Novas tabelas têm RLS, tenant imutável, auditoria e FKs compostas.
