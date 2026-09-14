# 07-MIGRATIONS-E-DEPLOY.md

## Banco de produção nunca deve ser editado manualmente sem necessidade excepcional.

Schema deve evoluir por migrations versionadas.

## Ambientes e configuração

O usuário manifestou intenção de testar online inicialmente em produção e preparar dados sintéticos/ambientes depois. Essa intenção está registrada em [PR20](13-REQUISITOS-PENDENTES-DO-PRODUTO.md), mas a estratégia ainda precisa resolver o conflito com as regras abaixo. Proposta: começar com deploy hospedado de testes, dados sintéticos e Stripe em modo de teste, mantendo banco/storage separados de dados reais. Não foi autorizado ou executado deploy por este registro.

Estado atual: o ambiente local de desenvolvimento possui conexão validada com um projeto Neon,
Stripe em test mode, Firebase Web/Admin e R2 com credenciais S3 validadas. Staging e production
continuam não definidos. Antes de qualquer uso com dados reais, separar credenciais e destinos
explicitamente. Previews devem usar dados não
produtivos; não copiar dados reais indiscriminadamente para desenvolvimento. Ver
[ADR-004](decisions/ADR-004-AMBIENTE-LOCAL-E-INTEGRACOES.md).

Cada aplicação deve documentar variáveis em seu `.env.example` quando elas forem definidas, sem valores reais. Variáveis públicas de frontend não podem conter secrets. Não herdar configurações do legado automaticamente.

Schema, migrations e seeds pertencem inicialmente à API. Não manter cópias em `packages/database` e `scripts/migration`. Usar uma sequência versionada de migrations entre ambientes; seeds sintéticos de desenvolvimento devem recusar produção. `NODE_ENV` sozinho não comprova o destino do banco.

Antes de habilitar comandos operacionais, documentar como validar o destino, quem aplica migrations, como testar em staging e como recuperar uma falha. Não criar comandos com produção como destino padrão. Produção não deve ser modificada diretamente por agentes.

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

## Deploy no Fly.io (preparado, ainda não publicado)

Estado: a API possui Dockerfile, `fly.toml`, CI e workflow manual de deploy. O cadastro
`luminix-api-marcos-santos` existe sem Machine; nenhuma versão da API foi publicada por esta preparação. O frontend e o admin
continuam na Vercel; o Fly.io hospeda somente o backend. Ver
[ADR-005](decisions/ADR-005-CONTAINER-E-DEPLOY-DA-API.md).

O CLI (`flyctl`) autentica a máquina local. Ele não observa o Git. `git push` só dispara deploy se o GitHub Actions chamar `flyctl deploy` com um token. Caminho normal, quando a API existir: commit → push na branch principal → Actions → Fly.io. `fly deploy` local fica reservado a hotfix ou teste de emergência.

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
3. Workflow em `.github/workflows/fly-deploy.yml`: push somente na branch principal; filtro `paths` em `apps/api/**` e no próprio workflow; `concurrency` para um deploy por vez; `flyctl deploy --remote-only --config apps/api/fly.toml`. Pull requests não publicam.

Quando houver testes, o job de deploy deve depender deles (`needs: test`). Pipeline com testes obrigatórios e destinos staging vs production fica para quando os ambientes existirem; a intenção de testar hospedado desde o início está em [PR20](13-REQUISITOS-PENDENTES-DO-PRODUTO.md) e ainda não autoriza produção como destino padrão.

## Deploy do admin na Vercel

O projeto `luminix-admin` está conectado ao GitHub com raiz `apps/admin`. Push em `master` publica
Production; outras branches e pull requests geram Preview. Usar a integração Git nativa, sem criar
um segundo workflow de deploy. Ver
[ADR-006](decisions/ADR-006-DEPLOY-DO-ADMIN-NA-VERCEL.md).

As variáveis `NEXT_PUBLIC_*` são públicas e estão temporariamente compartilhadas entre Development,
Preview e Production com serviços em modo de teste. Antes de uso real, separar destinos e nunca
adicionar ao projeto frontend as credenciais administrativas da API.

---
