# Luminix

SaaS B2B multi-tenant para clínicas, salões, studios e profissionais de beleza e estética. Não é um marketplace.

## Estado atual

A base técnica inicial está configurada como workspace `pnpm`. `apps/admin` contém o protótipo
Next.js, `apps/api` contém o bootstrap Fastify e os dois aplicativos mobile possuem shells Expo.
Pastas vazias em `apps/` e `packages/` continuam sendo reservas, não implementações concluídas.

O sistema anterior está em `legacy/charme-bela/`, com backend, web, mobile e histórico Git próprio.
Uma cópia sanitizada do código visual mobile está em `apps/mobile-client/legacy-source/`, fora do
build. Há um [inventário estático inicial](docs/12-INVENTARIO-LEGADO.md); isso não significa
aprovação de segurança, migração ou validação em execução.

## Desenvolvimento

Requisitos: Node.js 22.18 ou superior e `pnpm` 11.19.0.

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

`pnpm dev` inicia em paralelo todos os apps com script `dev`. Para trabalhar em apenas um app:

```bash
pnpm dev:api
pnpm dev:admin
pnpm dev:mobile-admin
pnpm dev:mobile-client
```

Use `pnpm check` antes de commits relevantes. A matriz completa de comandos isolados está no
[AGENTS.md](AGENTS.md).

Copie o `.env.example` de cada aplicação para `.env` local quando necessário. Nunca compartilhe
arquivos reais de ambiente entre apps.

### Integrações locais

O ambiente local atual possui Neon Postgres, Stripe em modo de teste, Firebase Auth/Admin e R2 com
credenciais S3 validadas.

```bash
pnpm --filter @luminix/api db:check
pnpm --filter @luminix/api db:check:direct
pnpm --filter @luminix/api firebase:check
pnpm --filter @luminix/api r2:check
pnpm --filter @luminix/api stripe:check
```

O CLI Neon está vinculado ao projeto `luminix`, branch `production`.

## Fly.io

A API está preparada em `apps/api/Dockerfile` e `apps/api/fly.toml`. Docker Desktop não é necessário
para o fluxo normal porque o Fly usa build remoto.

No Windows, caso seja necessário reinstalar o CLI:

```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
flyctl auth login
```

O app `luminix-api` está publicado em <https://luminix-api.fly.dev>, com uma Machine compartilhada
em `gru`, auto-stop habilitado e mínimo de zero Machines rodando.

```bash
pnpm fly:validate
pnpm fly:deploy
```

O deploy não acontece automaticamente em pushes. O workflow `Deploy API to Fly.io` é manual e só
funciona depois de cadastrar `FLY_API_TOKEN` no environment `production` do GitHub. Auto-stop reduz
compute ocioso, mas a imagem/rootfs da Machine parada ainda pode ser cobrada.

## Vercel

Os projetos `luminix-admin` e `luminix-client` estão conectados ao mesmo GitHub, com raízes em
`apps/admin` e `apps/mobile-client`. A Vercel cria Production para pushes em `master` e Preview para
outras branches e pull requests; não existe workflow duplicado no GitHub Actions.

```bash
npm install --global vercel@59.17.0
vercel login
pnpm vercel:admin:preview
pnpm vercel:client:preview
# Somente quando houver intenção explícita de publicar manualmente:
pnpm vercel:admin:production
pnpm vercel:client:production
```

As variáveis públicas de teste estão configuradas nos três ambientes. O painel está em
<https://admin-xi-snowy.vercel.app>, o shell web do cliente está em
<https://luminix-client.vercel.app> e ambos apontam para a API Fly publicada.

## Por onde começar

1. Leia [o contexto do produto](docs/09-PRODUTO-E-CONTEXTO.md).
2. Consulte [o mapa de arquitetura](docs/00-ARQUITETURA.md).
3. Use [o índice documental](docs/README.md) para carregar apenas o necessário à tarefa.
4. Para migrar funcionalidades, siga [o procedimento de migração](docs/11-MIGRACAO-DO-LEGADO.md).

Agentes devem seguir [AGENTS.md](AGENTS.md).

## Organização

| Local                      | Responsabilidade                                                              |
| -------------------------- | ----------------------------------------------------------------------------- |
| `apps/api/`                | Backend modular e autoridade de negócio e autorização                         |
| `apps/web/`                | Institucional e páginas públicas das clínicas                                 |
| `apps/admin/`              | Painel da clínica e profissionais                                             |
| Painel corporativo externo | Projeto da empresa-mãe para Luminix e outros produtos; fora deste repositório |
| `apps/mobile-client/`      | Aplicativo do cliente final                                                   |
| `apps/mobile-admin/`       | Aplicativo da gestora/profissional                                            |
| `packages/`                | Código compartilhado com consumidores e fronteiras explícitos                 |
| `docs/`                    | Princípios, decisões e procedimentos                                          |
| `assets/`                  | Marca, materiais e referências; não dados enviados por clientes               |
| `scripts/`                 | Automações que abrangem o repositório                                         |
| `legacy/charme-bela/`      | Fonte de referência para migração, fora do futuro workspace                   |

As configurações de execução serão criadas no bootstrap. A localização de uma pasta vazia não obriga a implementar um package, módulo ou integração. `tooling/` permanece sem função adotada; não deve competir com configurações da raiz.
