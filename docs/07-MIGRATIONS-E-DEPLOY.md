# 07-MIGRATIONS-E-DEPLOY.md

## Banco de produção nunca deve ser editado manualmente sem necessidade excepcional.

Schema deve evoluir por migrations versionadas.

## Ambientes e configuração

Em 2026-09-15, o usuário confirmou ausência de clientes/dados reais e autorizou migrations,
seeds sintéticos, testes e publicação nos projetos/branches principais existentes durante a
preparação. Não exigir branches dev/staging nesta fase. A exceção está em `AGENTS.md` e substitui
a pendência de PR20; não dispensa identificação de destino, migrations versionadas, secrets,
isolamento entre clínicas ou revisão dos dados antes de ações destrutivas.

Estado atual: o ambiente local de desenvolvimento possui conexão validada com um projeto Neon,
Stripe em test mode, Firebase Web/Admin e R2 com credenciais S3 validadas. Staging e production
continuam não definidos. Antes de qualquer uso com dados reais, separar credenciais e destinos
explicitamente. Previews devem usar dados não
produtivos; não copiar dados reais indiscriminadamente para desenvolvimento. Ver
[ADR-004](decisions/ADR-004-AMBIENTE-LOCAL-E-INTEGRACOES.md).

Cada aplicação deve documentar variáveis em seu `.env.example` quando elas forem definidas, sem valores reais. Variáveis públicas de frontend não podem conter secrets. Não herdar configurações do legado automaticamente.

Schema, migrations e seeds pertencem inicialmente à API. Não manter cópias em `packages/database`
e `scripts/migration`. Usar uma sequência versionada de migrations; seeds devem recusar destinos
não autorizados ou com dados reais. Na fase inicial, o principal é permitido com destino explícito.
`NODE_ENV` sozinho não comprova o destino do banco.

Comandos operacionais devem exigir destino identificado para escrita e documentar aplicação,
validação e recuperação. Não aplicar migrations automaticamente ao iniciar a API. Fora da fase
inicial autorizada, produção não deve ser modificada diretamente por agentes; antes de clientes
reais, definir staging/dev/prod e restaurar essa separação.

## Antes de migration

A IA deve responder:

1. O que muda?
2. Quantas linhas podem ser afetadas?
3. Existe lock?
4. É backward compatible?
5. Pode derrubar versão antiga da aplicação?
6. Existe rollback?
7. Existe risco de perda de dados?

## Expansão e contração

Para mudanças importantes, preferir:

1. adicionar estrutura nova;
2. manter código compatível com estrutura antiga e nova;
3. migrar dados;
4. validar;
5. remover estrutura antiga posteriormente.

Evitar migrations "big bang".

## Deploy no Fly.io

Estado: a API `luminix-api` está publicada em `https://luminix-api.fly.dev`, possui Dockerfile,
`fly.toml`, CI e workflow manual de deploy. Há uma Machine compartilhada em `gru`, configurada com
auto-stop e mínimo zero. O cliente e o admin ficam na Vercel; o Fly.io hospeda somente o backend. Ver
[ADR-005](decisions/ADR-005-CONTAINER-E-DEPLOY-DA-API.md).

O CLI (`flyctl`) autentica a máquina local e não observa o Git. O deploy atual é manual:
`pnpm fly:validate` e `pnpm fly:deploy`, ou workflow explicitamente acionado por
`workflow_dispatch`. Push não publica a API. Não habilitar deploy automático sem decisão própria.

Não reutilizar a app `charme-bela` nem o `fly.toml` do legado. Agentes não disparam deploy de produção. O token de deploy não entra no repositório.

### CLI local

Instalação e login ficam na máquina do operador, fora do Git. No Windows PowerShell 5.1 (o `powershell` nativo; `pwsh` só existe se o PowerShell 7 estiver instalado):

```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

Se o terminal já for o PowerShell, basta `iwr https://fly.io/install.ps1 -useb | iex`.

Depois: `fly version`, `fly auth login`, `fly auth whoami` e `fly apps list`. Quando existir `apps/api/fly.toml`, hotfix usa `fly deploy --remote-only --config apps/api/fly.toml`. `--remote-only` constrói a imagem nos builders do Fly.

### Continuous deployment

O workflow começa apenas por `workflow_dispatch`; push não publica. Para habilitá-lo:

1. Token de deploy com escopo só da app Luminix, não token global da conta: `fly tokens create deploy -a <nome-da-app-luminix> -x 999999h`. Copiar o valor inteiro, inclusive o prefixo `FlyV1 `.
2. Guardar como secret do repositório no GitHub (`Settings → Secrets and variables → Actions`), nome `FLY_API_TOKEN`.
3. Workflow em `.github/workflows/fly-deploy.yml`: somente `workflow_dispatch`, `concurrency`
   para um deploy por vez e `flyctl deploy --remote-only --config apps/api/fly.toml`.
   Push e pull requests não publicam. Uma evolução automática exigirá definição de ambientes,
   filtros de paths e checks obrigatórios antes de habilitação.

O workflow manual ainda não executa os checks como requisito do deploy. Na operação atual,
executar `pnpm check` antes de publicar. Gating em CI e destinos staging/production ficam para a
preparação de uso real; a publicação nos projetos principais durante a fase inicial está autorizada
em PR20 e `AGENTS.md`.

## Primeiro schema multi-tenant

A [ADR-009](decisions/ADR-009-NUCLEO-MULTI-TENANT.md) define migration SQL, ledger/checksum,
rollback e constraints do núcleo. A validação usa PostgreSQL descartável em memória, sem Neon.
O comando `db:migrate` usa somente conexão direta, com flags explícitas para escrita/verificação,
sem fallback para DATABASE_URL. Estado hospedado e condições para próximos fluxos e
credenciais runtime estão em [17 — Núcleo multi-tenant](17-NUCLEO-MULTI-TENANT.md).

Na Step 4, migration 0003 e role runtime foram aplicadas no Neon principal. Fly usa apenas
`DATABASE_URL_RUNTIME` da role `luminix_api`; o secret privilegiado `DATABASE_URL` foi removido
do app. A API verifica privilégios na inicialização. A entrega foi publicada em Fly e o admin
em Vercel Production em 2026-09-16, após `pnpm check`.

Na Step 5, migration 0004 foi aplicada em `ep-bitter-fog-acchavo1.sa-east-1.aws.neon.tech/neondb`
em 2026-09-16. Antes da escrita, `clinics`, `identities` e `onboarding_drafts` tinham zero linhas.
A migration adiciona colunas com defaults e funções restritas; locks de DDL são breves com tabelas
vazias. A API anterior continua compatível. A verificação Neon com role restrita, FK, RLS,
preço e auditoria passou e reverteu seus dados sintéticos. O runner real Firebase/Neon cobriu
rascunho, conclusão repetida e isolamento A × B, com rollback da fixture. Para reverter após
publicação, criar migration corretiva; não editar a 0004 aplicada.

## Deploy dos frontends na Vercel

O projeto `luminix-web` usa raiz `apps/web`, para o domínio principal, páginas públicas e portal do
cliente. `app.luminix.beauty` pertence ao admin. Associações Vercel cadastradas; ativação do DNS na
Hostinger permanece pendente. Procedimento e roadmap em
[16-DOMINIOS-E-PORTAL-WEB](16-DOMINIOS-E-PORTAL-WEB.md).

O projeto `luminix-admin` está conectado ao GitHub com raiz `apps/admin`. Push em `master` publica
Production; outras branches e pull requests geram Preview. Usar a integração Git nativa, sem criar
um segundo workflow de deploy. Ver
[ADR-006](decisions/ADR-006-DEPLOY-DO-ADMIN-NA-VERCEL.md).

O projeto `luminix-client` publica a exportação web do shell Expo em `apps/mobile-client`. Essa
publicação serve para desenvolvimento e revisão visual; os binários Android/iOS continuarão sob o
fluxo Expo/EAS quando forem configurados. Ver
[ADR-007](decisions/ADR-007-DEPLOY-WEB-DO-CLIENTE-NA-VERCEL.md).

As variáveis `NEXT_PUBLIC_*` são públicas e estão temporariamente compartilhadas entre Development,
Preview e Production com serviços em modo de teste. Antes de uso real, separar destinos e nunca
adicionar ao projeto frontend as credenciais administrativas da API.

---
