# ADR-038 — Link de confirmação por agendamento e alertas da anamnese

Status: Accepted (implementado: migration 0065, API, admin e página `/confirmar/[token]`)

Data: 2026-11-24

## Contexto

A confirmação de presença era um texto pronto de WhatsApp ("responda SIM"): a resposta não
chegava ao sistema. A API oficial do WhatsApp ainda não envia para números do Brasil na conta de
teste da Kommite (erro 130497 da Meta), e muitas clientes nunca vão criar conta Luminix (turista,
cliente de uma vez só, quem mal usa o celular). A equipe também não via contraindicações da ficha
sem abrir a anamnese inteira.

## Decisão

### Link de confirmação (sem login)

- **Um link por agendamento** (`appointment_links`, chave `clinic_id, appointment_id`). Gerar de
  novo troca o anterior. Vale até o fim do atendimento.
- **O token é a credencial:** 32 bytes aleatórios em base64url (43 caracteres). O banco guarda só
  o SHA-256; a URL nunca é registrada. Página com `noindex` e `Referrer-Policy: no-referrer`.
- **Quem abre vê o mínimo:** primeiro nome, serviço, data, profissional e só o contato/endereço que
  o espaço publica. Nada de telefone, nome completo, CPF, observações ou ficha.
- **Respostas:** `confirmed` (horário "a confirmar" vira confirmado, exceto com sinal Pix
  pendente, que continua com a equipe), `reschedule` (só avisa a equipe; nada muda na agenda) e
  `not_me` (fecha o link na hora; os detalhes param de aparecer).
- **Rotas:** equipe `POST /clinics/:id/appointments/:id/confirmation-link` (`agenda:manage`,
  opcionalmente envia o e-mail "Confirme seu horário" pelo Resend). Público
  `GET|POST /client/appointment-links/:token`, sob `/client/` para reaproveitar o CORS da área do
  cliente, sem Bearer, com limite próprio de 30 req/min por IP. O site chama a API direto do
  navegador (mesmo motivo da ADR-029: limite por IP de cada pessoa).
- **Funções SQL `SECURITY DEFINER`:** `staff_issue_appointment_link` (autoriza a equipe e confere
  clínica atual), `read_appointment_link` e `answer_appointment_link` (pelo hash). Tabela com RLS e
  FORCE, trava de tenant e auditoria; a equipe só lê (a agenda mostra a resposta).
- **Não vincula conta** (ADR-027 continua valendo): o link prova que alguém recebeu a mensagem,
  não quem é. A ficha da clínica segue sem `client_profile_id`.
- **Admin:** bloco "Link de confirmação" no atendimento: gerar, gerar e mandar por e-mail,
  copiar, abrir o WhatsApp com o link no texto; mostra "confirmou", "pediu para remarcar", "não é
  a cliente" ou "link aberto". E-mail é escolhido antes de gerar, para não invalidar um link já
  colado no WhatsApp.

### Alertas e objetivos da anamnese

- `packages/contracts/src/anamnesis.ts` ganha `anamnesisAlerts` (contraindicações `stop`, cuidados
  `care`, com dica curta) e `anamnesisGoals`. As regras vivem no roteiro compartilhado; a API não
  calcula alertas.
- Perguntas novas, **todas opcionais** (nenhuma chave obrigatória nova; fichas antigas continuam
  válidas): pressão baixa, sangramento/hemofilia, queloide e herpes (nível II); trombose/varizes,
  doença de pele e alteração hormonal (nível III, corpo); sol recente e ácidos/retinoides (nível
  III, pele); objetivos rugas, olheiras e estrias. Origem: ficha do Charme & Bela.
- Admin: alertas no topo da anamnese da cliente e em chips compactos no atendimento (visíveis sem
  abrir dobras). Texto de apoio: a avaliação da profissional e a liberação médica vêm primeiro.

## Consequências

- Migration 0065 aditiva. Inventário do núcleo passa a 52 tabelas com RLS.
- O link funciona hoje por e-mail e por WhatsApp manual; quando a API oficial liberar, o mesmo
  link entra no template de utilidade.
- Pendências em [TD-016](../technical-debt/TD-016-LINK-DE-CONFIRMACAO.md).

## Quando revisar

Ao ligar o envio automático (WhatsApp/e-mail na criação do agendamento), ao permitir preencher a
anamnese pelo link ou ao vincular a ficha local a uma conta pelo convite (ADR-027).
