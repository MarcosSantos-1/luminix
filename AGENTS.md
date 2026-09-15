# Luminix — Instruções para agentes

Este projeto é um SaaS B2B multi-tenant para clínicas, salões e studios.

Antes de realizar alterações relevantes, consulte `docs/README.md` para identificar quais documentos adicionais são necessários para a tarefa.

## Regras obrigatórias

* Não realizar alterações estruturais sem analisar a implementação existente.
* Não assumir padrões se já existir implementação equivalente no projeto.
* Não criar novas dependências sem necessidade clara.
* Não alterar schema do banco sem migration versionada.
* Não modificar produção diretamente.
* Não confiar em dados de tenant enviados pelo frontend.
* Toda entidade tenant-aware deve respeitar isolamento por clínica.
* Segurança e integridade dos dados têm prioridade sobre conveniência.
* Não remover código ou comportamento existente sem entender seu uso.
* Não criar abstrações prematuramente.
* Não transformar o projeto em microserviços sem decisão arquitetural explícita.
* Não realizar refatorações grandes junto com uma feature não relacionada.

## Antes de implementar

Para alterações não triviais:

1. Identifique os arquivos envolvidos.
2. Leia a documentação aplicável.
3. Entenda o comportamento atual.
4. Identifique riscos.
5. Apresente um plano curto.
6. Só então altere o código.

## Depois de implementar

Verifique:

* TypeScript;
* lint;
* testes existentes;
* testes relacionados à alteração;
* segurança;
* tenant isolation;
* migrations;
* regressões aparentes.

Quando relevante, informe:

* arquivos alterados;
* comportamento alterado;
* riscos;
* testes realizados;
* testes ainda necessários;
* dívida técnica criada.

## Guia operacional do workspace

Execute os comandos a partir da raiz. O workspace usa Node.js 22.18+ e `pnpm` 11.19.0.

### Instalação e validação geral

```bash
pnpm install
pnpm check
```

`pnpm check` executa formatação, lint, TypeScript, testes e builds. Em CI ou quando não se deseja
alterar o lockfile, usar `pnpm install --frozen-lockfile`. Não executar `pnpm dev` por padrão em
máquinas limitadas: ele inicia todos os projetos em paralelo.

| Objetivo                  | Admin                      | API                      | Mobile admin                      | Mobile cliente                       |
| ------------------------- | -------------------------- | ------------------------ | --------------------------------- | ------------------------------------ |
| Desenvolvimento isolado  | `pnpm dev:admin`           | `pnpm dev:api`           | `pnpm dev:mobile-admin`           | `pnpm dev:mobile-client`             |
| Build isolado             | `pnpm build:admin`         | `pnpm build:api`         | não definido                     | `pnpm build:mobile-client`            |
| TypeScript isolado        | `pnpm typecheck:admin`     | `pnpm typecheck:api`     | `pnpm typecheck:mobile-admin`     | `pnpm typecheck:mobile-client`        |
| Lint isolado              | `pnpm lint:admin`          | `pnpm lint:api`          | `pnpm lint:mobile-admin`          | `pnpm lint:mobile-client`             |
| Testes isolados           | ainda não definidos       | `pnpm test:api`          | ainda não definidos              | ainda não definidos                  |

Quando surgir um script não mapeado na raiz, usar
`pnpm --filter <nome-do-package> <script>`, por exemplo
`pnpm --filter @luminix/api db:check`. Não executar Expo Android/iOS automaticamente; esses comandos
podem abrir emuladores e consumir muitos recursos.

### Ambientes e integrações

Cada app possui seu próprio `.env.example`. Arquivos `.env`, `.env.local`, credenciais Firebase
Admin e chaves privadas nunca entram no Git. Checks disponíveis para a API:

```bash
pnpm --filter @luminix/api db:check
pnpm --filter @luminix/api db:check:direct
pnpm --filter @luminix/api firebase:check
pnpm --filter @luminix/api r2:check
pnpm --filter @luminix/api stripe:check
```

### Commit e pull request

Fluxo preferencial:

```bash
git checkout -b tipo/nome-curto
pnpm check
git add <arquivos-da-tarefa>
git diff --cached --check
git commit -m "tipo: descrição objetiva"
git push -u origin tipo/nome-curto
```

Revisar o diff e procurar secrets antes do commit. Branches e pull requests geram Preview na
Vercel; merge/push em `master` publica Production dos projetos Vercel conectados. Não fazer push em
`master`, merge, tag ou deploy de Production sem pedido explícito do usuário.

### Vercel

- Site/páginas públicas/portal cliente: `luminix-web`, raiz `apps/web`, domínio `luminix.beauty`.
- Gestão: domínio `app.luminix.beauty` no projeto admin existente.
- DNS ainda depende de cutover manual na Hostinger. Procedimento e roadmap:
  `docs/16-DOMINIOS-E-PORTAL-WEB.md`. Não transferir nameservers ou alterar DNS automaticamente.
- Web isolado: `pnpm dev:web` (3001), `pnpm build:web`, `pnpm lint:web`,
  `pnpm typecheck:web`, `pnpm test:web`.

- Admin: `luminix-admin`, raiz `apps/admin`, <https://admin-xi-snowy.vercel.app>.
- Revisão web do mobile: `luminix-client`, raiz `apps/mobile-client`,
  <https://luminix-client.vercel.app>.

O fluxo normal é Git, sem GitHub Action duplicada. Para operação manual explícita:

```bash
pnpm vercel:admin:pull
pnpm vercel:web:pull
pnpm vercel:web:preview
pnpm vercel:web:production
pnpm vercel:admin:preview
pnpm vercel:admin:production
pnpm vercel:client:pull
pnpm vercel:client:preview
pnpm vercel:client:production
vercel ls
vercel inspect <deployment-url>
```

Os scripts Vercel devem ser executados da raiz porque o repositório é um monorepo. O cliente na
Vercel é a exportação web do Expo; Android/iOS usam outro fluxo e não são produzidos por esse deploy.

### Fly.io

A API se chama somente `luminix-api` e responde em <https://luminix-api.fly.dev>. O deploy é manual:

```bash
pnpm fly:validate
pnpm fly:deploy
flyctl status --app luminix-api
flyctl logs --app luminix-api
```

Depois do deploy, verificar `https://luminix-api.fly.dev/health`. A configuração mantém uma Machine
`shared-cpu-1x` de 256 MB, `auto_stop_machines = "stop"` e `min_machines_running = 0`. Não aumentar
quantidade, memória, volume ou IP dedicado sem autorização, pois isso altera custo. Secrets ficam no
vault do Fly; seus valores não podem ser recuperados pelo CLI.

## Documentação

* O Luminix está em preparação; pastas reservadas não representam implementação pronta.
* Consulte `docs/00-ARQUITETURA.md` para localizar responsabilidades antes de criar arquivos.
* `legacy/charme-bela/` é referência, não padrão obrigatório nem parte do workspace Luminix. Não altere ou execute o legado sem tarefa específica. Para migração, consulte `docs/11-MIGRACAO-DO-LEGADO.md`.
* Instruções e convenções do legado se aplicam ao legado; não devem ser copiadas automaticamente para o Luminix.
* Diferencie estado implementado, decisões adotadas, planos e questões em aberto nos documentos.
* Ao trabalhar com múltiplos agentes, siga a coordenação em `docs/08-PADROES-DE-CODIGO-IA.md`.

Não leia toda a pasta `/docs` indiscriminadamente.

Comece por:

`docs/README.md`

e carregue somente os documentos relevantes para a tarefa.

## Mudanças arquiteturais

Mudanças importantes de arquitetura, infraestrutura, banco, autenticação ou modelo multi-tenant devem ser registradas em `/docs/decisions`.

## Dívida técnica

Se um problema conhecido for conscientemente adiado, registre ou atualize `/docs/technical-debt`.

Não esconder problemas conhecidos apenas para considerar a tarefa concluída.
