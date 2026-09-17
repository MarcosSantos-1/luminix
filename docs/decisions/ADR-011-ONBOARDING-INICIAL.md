# ADR-011 — Onboarding inicial da clínica

Status: Accepted

Data: 2026-09-16

## Decisão

A clínica draft e seu proprietário são criados pelo bootstrap da Step 4. O onboarding autenticado
continua nessa clínica. A primeira versão recolhe contato da gestora (nome, e-mail e WhatsApp em
E.164), nome da clínica, ocupações locais, serviços com preço em centavos e duração, e
profissionais sem login. O contato fica no rascunho para retomada e follow-up manual se o cadastro
ficar incompleto; não dispara WhatsApp automático nem concede acesso. Configurações iniciais já são
criadas no bootstrap: BRL, pt-BR e America/Sao_Paulo. Recursos físicos, horários, preferências de
integração, convites e permissões da equipe não entram neste formato.

`onboarding_drafts` armazena o payload estruturado e limitado a 32 KiB, `format_version = 1` e
`version` como revisão otimista. Cada avanço, retorno ou saída salva a etapa inteira no backend.
Conflito de revisão exige recarga explícita; uma aba antiga não sobrescreve outra.

A conclusão exige permissão `onboarding:manage`, revalida o vínculo e aplica ocupações, serviços,
profissionais, nome, código de compartilhamento e status active em uma transação. A transação
inclui a auditoria existente. Uma repetição após sucesso devolve o resultado já criado sem
duplicação. O código `LX-` deriva de 12 dígitos hexadecimais do UUID da clínica, com unicidade no
banco; é identificador para compartilhamento futuro, não token de acesso nem convite.

O runtime continua sem grants diretos de escrita. As funções SECURITY DEFINER da migration 0004
têm EXECUTE restrito e exigem contexto de clínica e identidade, membership ativo e permissão.
Leituras passam pela transação tenant-aware e RLS. O endpoint não aceita `clinic_id` no body nem
identidade enviada pelo frontend.

## Consequências

- A entrada pública em `/` apresenta o cadastro e encaminha a `/login` ou ao onboarding autenticado.
  `/dashboard` continua demonstração identificada. O fluxo persistente reside em
  `/clinics/:clinicId/onboarding`.
- Google e cadastro por e-mail/senha entram no Firebase da equipe; o provedor Google precisa estar
  habilitado no console do projeto.
- O código ainda não possui busca pública ou entrada no app cliente. Compartilhá-lo não cria
  vínculo nem acesso.
- Edição pós-conclusão de ocupações, serviços e profissionais será contrato separado. O formato
  versionado permite migration futura de rascunhos; não aceitar versão desconhecida no cliente.
- O limite de 20 ocupações, 30 serviços e 20 profissionais mantém a conclusão curta e evita
  operações extensas sob lock de autorização.
