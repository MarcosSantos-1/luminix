# ADR-003 — Bootstrap do workspace

Status: Accepted

Data: 2026-09-14

## Contexto

A ADR-001 reservou as fronteiras das aplicações, mas deixou gerenciador, runtimes e ferramentas de
qualidade para o bootstrap. O repositório precisava de uma instalação única e verificações
repetíveis antes da implementação dos domínios.

## Decisão

- usar `pnpm` 11 com lockfile único e workspace limitado a `apps/*` e `packages/*`;
- manter `legacy/**` fora da instalação e das verificações;
- usar scripts recursivos do próprio pnpm, sem adicionar Turbo enquanto não houver necessidade de
  cache/orquestração mais avançada;
- compartilhar TypeScript, ESLint e Prettier a partir da raiz, permitindo ajustes por aplicação;
- adotar Node.js 22.18 ou superior como baseline;
- iniciar `apps/api` como monólito modular Fastify, sem banco ou provedor de autenticação nesta
  decisão;
- reservar `tenantContext` na request, sempre vazio até ser preenchido por autenticação e
  membership validados no backend; não derivá-lo de `clinic_id` enviado pelo cliente;
- iniciar os dois aplicativos mobile com Expo. A fonte do Charme & Bela copiada para o cliente fica
  sanitizada e fora do runtime até migração funcional;
- manter configurações de ambiente separadas por aplicação.

## Consequências

Uma execução de `pnpm install` instala todas as aplicações e os comandos da raiz fornecem uma porta
de entrada consistente. O build inicial cobre apenas apps que declaram `build`; os shells Expo não
declaram build nativo porque credenciais e perfis de distribuição ainda não existem.

A API não oferece ainda rotas de domínio tenant-aware, autenticação, banco, R2 ou Stripe. Variáveis
reservadas nos exemplos documentam fronteiras futuras, mas não significam integração pronta.

## Alternativas consideradas

Turbo foi adiado por não haver volume de packages ou pipelines que justifique a dependência. Copiar
e ativar integralmente o mobile legado foi rejeitado porque reintroduziria Firebase do cliente,
endpoint produtivo single-tenant, configuração EAS e suposições de clínica fixa.

## Revisão

Reavaliar Turbo quando o tempo de CI ou a quantidade de packages tornar cache e grafo de tarefas
materialmente úteis. Criar decisão própria para ORM/schema, autenticação e modelo de memberships.
