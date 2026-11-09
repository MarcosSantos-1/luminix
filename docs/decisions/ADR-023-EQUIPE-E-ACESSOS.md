# ADR-023 — Equipe, horários e acessos da equipe

- Data: 2026-11-08
- Estado: implementado; migration 0025 a aplicar antes do deploy da API

## Contexto

Depois do onboarding, a equipe só podia ser lida. Não havia como dar login a uma recepcionista,
nem como a gestora que também atende entrar na agenda como profissional. A agenda usava
`clinic:manage`, o que obrigaria dar à recepção o poder de editar o estabelecimento.

## Decisão

### Equipe ≠ acesso

- **Profissional** (`professionals`): quem atende. Tem serviços, público, foto e semana de trabalho.
- **Acesso** (`clinic_memberships`): quem entra no painel, com um nível.
- Os dois se ligam por `professionals.membership_id` (já existente). A gestora que atende cria
  o próprio registro de profissional ligado ao seu login (“Sim, eu também atendo”).

### Níveis prontos (presets)

`role_preset_permissions` + `ensure_clinic_roles` criam e alinham quatro papéis por clínica:

| Nível        | Permissões                                                     |
| ------------ | -------------------------------------------------------------- |
| owner        | todas, incluindo `onboarding:manage`                           |
| manager      | todas exceto `onboarding:manage`                               |
| reception    | `agenda:read`, `agenda:manage`, `client:read`, `client:manage` |
| professional | `agenda:read`, `client:read`                                   |

Permissões novas: `agenda:read` (GET agenda) e `agenda:manage` (criar atendimento). A edição do
expediente da clínica continua em `clinic:manage`. Um trigger em `clinic_settings` garante os
presets em clínicas novas; a migration alinha as existentes. Presets fixos foram escolhidos em vez
de uma matriz livre de permissões: o público é pouco técnico. A matriz pode vir depois sem mudar o
modelo (papéis continuam sendo linhas de `roles`).

Regras de proteção (`invite_staff_member`, `update_staff_member`):

- ninguém recebe `owner` pelo painel; só a owner dá, muda ou restaura acesso de gerente;
- ninguém altera o próprio nível/status nem o da owner (a clínica não se tranca para fora);
- inativar é `status = 'revoked'`: a autorização por requisição corta o acesso imediatamente;
  a conta Firebase continua existindo (pode pertencer a outras clínicas).

### Login do funcionário

1. `POST /clinics/:id/staff` confirma `team:manage` **antes** de tocar no Firebase.
2. A API (Firebase Admin) encontra ou cria a conta pelo e-mail, sem senha.
3. `resolve_staff_identity` + `invite_staff_member` criam o vínculo.
4. O admin chama `sendPasswordResetEmail` do Firebase (idioma pt-BR) com retorno para `/login`.
   A pessoa cria a senha pelo link e entra com e-mail e senha. Reenviar convite e redefinir senha
   usam a mesma chamada. Nenhum provedor de e-mail próprio é necessário.

Conta já existente (ex.: dona de outro espaço): só o vínculo é criado; a tela oferece enviar o link
de senha mesmo assim. O UID do Firebase nunca é enviado ao navegador.

### Equipe e horários

`save_professional` cria/edita (id gerado no navegador para permitir a foto antes de salvar),
substitui serviços (com público por serviço sensível) e grava a semana em
`professional_weekly_availability` (`periods` + `day_schedule`), validando dentro do expediente da
clínica, como no onboarding. `archive_professional` arquiva e mantém ao menos uma profissional.

### Admin

- `lib/access.ts`: mapa único nível → páginas/abas visíveis. A API aplica as mesmas permissões.
- Configurações: “Equipe e horários” (`professional:manage`) e “Acessos e logins” (`team:manage`).
  “Serviços” saiu das configurações; o catálogo pertence à seção Serviços.
- `ClinicHome` deixou de exigir `clinic:manage` para abrir o painel.

## Consequências e riscos

- Ordem: migration 0025 → API → admin. Admin antigo com API nova continua funcionando para a owner.
- O nível Profissional vê **toda** a agenda; filtrar pela profissional logada está pendente (TD-010).
- O texto do e-mail é o modelo “redefinição de senha” do Firebase. Personalizar no console
  (ver 03-AUTENTICACAO) para “Crie sua senha de acesso”.
- Links do Firebase expiram; a tela orienta reenviar.

## Validação

`tests/team-access.test.ts`: presets e grants; criação/edição com serviços sensíveis e pausas;
horário fora do expediente, serviço e id de outra clínica, 403 entre clínicas; vínculo da owner;
arquivamento com mínimo de uma; convite de recepção (agenda 200, configurações/acessos 403,
nenhuma conta criada sem permissão, convite duplicado 409); gerente não altera owner nem cria
gerente; inativação corta acesso e reativação restaura; isolamento entre clínicas. Testes de
bootstrap/autorização atualizados para os presets.
