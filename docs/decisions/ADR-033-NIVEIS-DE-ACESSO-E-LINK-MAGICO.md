# ADR-033 — Níveis de acesso ajustáveis e link mágico da equipe

- Data: 2026-11-19
- Estado: implementado; migration 0052 a aplicar antes do deploy da API
- Substitui parcialmente: [ADR-023](ADR-023-EQUIPE-E-ACESSOS.md) (presets fixos, convite por senha)
- Substituído em parte por: [ADR-034](ADR-034-NIVEL-UNICO-EQUIPE.md) (Recepção e Profissional
  viraram um nível só, Equipe)

## Contexto

Donas de espaço delegam coisas diferentes: em um, a profissional muda horários e cuida do
marketing; em outro, só a dona mexe. Com presets fixos e permissões grossas (`clinic:manage`
cobria horários, dias fechados e férias), não dava para liberar horários sem liberar férias.
O convite usava o e-mail genérico de redefinição de senha do Firebase.

## Decisão

### Permissões novas (0052)

| Código             | Cobre                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `schedule:manage`  | Horário semanal do espaço, dias avulsos (espaço/profissional), fechamentos que não são ausência (manutenção, reforma, curso, evento, outro) |
| `vacation:manage`  | Férias, férias coletivas, licença, luto (`luminix.closure_permission`)                                                                      |
| `marketing:manage` | Posts do calendário de marketing (antes `service:manage`)                                                                                   |

Editar fechamento exige a permissão do tipo antigo **e** do novo (não dá para transformar férias
em "manutenção" para apagar). `clinic:manage` continua só com proprietária/gerente.

### Nível = base fixa + opções por clínica

- `role_preset_permissions`: base que nunca muda. Proprietária e Gerente têm tudo (gerente sem
  `onboarding:manage`). Recepção e Profissional: `client:read`, `agenda:read`, `media:read`.
- `role_optional_permissions`: lista fechada do que pode ser ligado/desligado para Recepção e
  Profissional, com padrão. Financeiro, relatórios, configurações, acessos, pagamentos, auditoria
  e onboarding **não estão na lista** — nenhum ajuste chega a eles.
- `role_permission_choices`: escolha da clínica (RLS, auditoria). `ensure_clinic_roles` grava
  base ∪ opções ligadas em `role_permissions`; a autorização por requisição não mudou.
- `set_role_option` / `list_role_options` exigem `team:manage` (proprietária e gerente).

Padrões:

| Opção                        | Recepção | Profissional |
| ---------------------------- | -------- | ------------ |
| Marcar/remarcar atendimentos | sim      | não          |
| Cadastrar/editar clientes    | sim      | não          |
| Estoque                      | sim      | sim          |
| Serviços, pacotes, promoções | não      | sim          |
| Marketing                    | não      | sim          |
| Enviar mídias                | não      | sim          |
| Horários e dias fechados     | não      | sim          |
| Férias e afastamentos        | não      | não          |

Escolhido ajuste **por nível** (não por pessoa): menos tela, difícil de errar. Por pessoa pode vir
depois como exceção sobre o nível, sem mudar o modelo.

Regras do ADR-023 mantidas: ninguém recebe `owner` pelo painel; só a proprietária dá, muda,
inativa ou reativa gerente (gerente não remove outro gerente); ninguém altera o próprio acesso.

### Link mágico

> Revisado em 2026-11-19: o login **não** é sem senha. O link serve só ao convite: quem entra por
> ele cai em `/primeiro-acesso` (criar e confirmar senha, foto, boas-vindas). Saíram o botão
> "Entrar sem senha", o `POST /auth/access-link` público e o e-mail "link de acesso". O logo vai
> embutido no e-mail (Content-ID). Os itens abaixo marcados como removidos ficam só como histórico.

- API: `StaffDirectory.signInLink` usa `generateSignInWithEmailLink` (Firebase Admin) com retorno
  `ADMIN_APP_ORIGIN/login?acesso=link&c=<clínica>`. E-mail próprio via Resend (`fetch`, sem SDK),
  template em `shared/integrations/email/access-email.ts` (só convite).
- `POST /clinics/:id/staff` envia o convite após o commit (`emailSent`); falha de e-mail não
  desfaz o acesso. `POST /clinics/:id/staff/:memberId/access-link` reenvia (`team:manage`).
- (removido) `POST /auth/access-link` (público): resposta igual exista ou não a conta; só envia para conta
  existente e ativa; limite 3/15 min por e-mail e 60/min global (o proxy do admin concentra IPs).
- Sem `RESEND_API_KEY`/`EMAIL_FROM`/`ADMIN_APP_ORIGIN` a API responde 503 e o admin cai no
  `sendSignInLinkToEmail` do Firebase — o fluxo funciona antes do domínio verificado.
- (removido) Admin: botão "Entrar sem senha" no login; o e-mail fica em `localStorage` no aparelho que pediu
  o link e o retorno conclui sozinho. Em outro aparelho (convite), pede o e-mail — proteção do
  Firebase contra fixação de sessão. Senha continua opcional ("Esqueci a senha").

## Consequências e riscos

- Ordem: migration 0052 → API → admin. Admin antigo com API nova: profissionais passam a ver os
  botões conforme as flags da agenda (`canManageHours` agora é `schedule:manage`).
- Clínicas existentes recebem os padrões novos (profissional ganha estoque, serviços, marketing
  e horários). Aceitável na fase sem clientes reais.
- `schedule:manage` padrão para Profissional permite mudar o horário do **espaço**. É o pedido do
  produto; a dona desliga em Configurações → Acessos.
- O link do Firebase aponta para `<projeto>.firebaseapp.com/__/auth/action`; domínio próprio do
  handler fica para depois.
- Rate limit é por processo (uma Machine hoje). Com várias, mover para armazenamento comum.
- Profissional ainda vê toda a agenda (TD-010 do ADR-023 continua).
