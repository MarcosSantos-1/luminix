# Step 3 — Núcleo multi-tenant

## Estado implementado

Em 2026-09-15, migration 0001 aplicada no Neon existente: projeto `luminix`
(`noisy-credit-37439938`), branch principal `production` (`br-hidden-glitter-acap197k`), endpoint
direto `ep-bitter-fog-acchavo1.sa-east-1.aws.neon.tech`, database `neondb`, PostgreSQL 18.6.
O destino estava sem tabelas de usuário. Após a migration 0002 da Step 4 entrega 2,
existem 17 tabelas em `luminix`, além do ledger
`luminix_migrations.applied`. No console Neon, selecionar `neondb` e o schema `luminix` para vê-las.
Não ficaram cadastros sintéticos dos testes; apenas o catálogo técnico de permissões da migration.

Schema em `apps/api/migrations/0001_multi_tenant_core.sql`, runner interno em
`apps/api/src/shared/database/migrations.ts` e contexto autorizado em
`apps/api/src/shared/tenant/clinic-transaction.ts`. Decisões e limites na ADR-009.

| Entidade                               | Escopo e papel                                         |
| -------------------------------------- | ------------------------------------------------------ |
| identities                             | Identidade global mínima, sem credenciais de cliente   |
| clinics                                | Raiz tenant (`id` equivale ao `clinic_id` dos filhos)  |
| roles / role_permissions               | Papéis locais e permissões concedidas                  |
| permissions                            | Catálogo técnico global; não concede acesso sozinho    |
| clinic_memberships                     | Identidade + papel + estado no estabelecimento         |
| client_profiles                        | Perfil global mínimo vinculado à identidade            |
| clinic_clients                         | Cadastro e contato locais, perfil global opcional      |
| professionals                          | Profissional local, acesso opcional por membership     |
| occupations / professional_occupations | Taxonomia local e áreas do profissional                |
| services / professional_services       | Serviço local e habilitação do profissional            |
| clinic_settings                        | Base inicial BRL / pt-BR / America/Sao_Paulo           |
| onboarding_drafts                      | Rascunho após criação da clínica, autor local e versão |
| audit_logs                             | Eventos locais transacionais, sem snapshots sensíveis  |

## Validação local sem credenciais

Da raiz: `pnpm --filter @luminix/api test -- tests/multi-tenant-core.test.ts`.
O teste cria PostgreSQL em memória, executa a migration e fecha o banco ao concluir. Não usa
`.env`, `.secrets`, Neon ou legado. `pnpm check` inclui essa suíte.

Cobertura: FKs A × B em todos os relacionamentos locais; relacionamentos válidos; unicidade do
perfil por clínica; contatos locais separados; RLS sem contexto e sob role restrita; IDs de B em A;
troca A/B; revogação; suspensão; identidade desabilitada; grant removido; preço inválido;
auditoria com ator; rollback conjunto; bloqueio de alteração/truncamento da auditoria;
reexecução e checksum da migration. Não equivale a testes HTTP de login ou CRUD ainda inexistentes.

## Contrato de segurança para próximos endpoints

1. Validar token/sessão no servidor e resolver identidade global ativa. Nunca aceitar `identityId`
   de body/header como identidade autenticada. UID Firebase deve vir de token verificado.
2. Usar seleção de clínica somente como seleção; permissão exigida é constante da política do
   endpoint, não fornecida pelo usuário. Chamar `withClinicTransaction` antes de consultar domínio.
3. Executar todas as queries tenant-aware na conexão entregue, com filtros `clinic_id` explícitos
   derivados do contexto, além da defesa RLS. Não exportar SQL errors/stack trace em HTTP.
4. Não usar a mesma role do runner em runtime. Role operacional deve ser NOSUPERUSER,
   NOBYPASSRLS, não proprietária, sem CREATE/TRUNCATE/ALTER e sem membership em roles privilegiadas.
5. Conceder USAGE do schema e apenas os privilégios necessários por domínio. O helper precisa
   As funções SECURITY DEFINER da migration 0003 fazem as leituras/locks de autorização sem
   conceder UPDATE global de identities ao runtime.
6. Auditoria runtime: apenas SELECT. Função trigger escreve via proprietário e policy de escopo.
   Nunca conceder INSERT direto nem editar `luminix_migrations`. Catálogo permissions é só leitura.
7. RLS não verifica token e settings SQL são controladas pelo processo de backend. Código com
   acesso à conexão pode mudar settings; credencial comprometida não é protegida por contexto.
   Não aceitar SQL ou nomes de coluna/tabela do frontend.
8. Associação com perfil global exige aceite/prova independente. A FK não autoriza a clínica a
   vincular um perfil global conhecido; impedir enumeração e contatos globais no CRUD futuro.
9. Evitar chamadas externas dentro da transação: os locks de autorização impedem revogação até
   concluir. Definir statement/lock/transaction timeout antes de operação hospedada.
10. Não criar tabelas locais futuras sem `clinic_id`, FKs compostas, policies e testes A × B.

## Pendências operacionais

Comando da raiz: `pnpm --filter @luminix/api db:migrate` mostra o destino/tabelas sem aplicar.
Escrita exige `--apply --expected-host=<host-direto> --expected-database=<database>
--allow-primary-bootstrap`. `--verify` com as mesmas flags de destino testa FKs/RLS/preço/auditoria
no Neon, dentro de uma transação inteiramente revertida, inclusive role temporária. Não usar
fixtures em banco com dados reais. A criação temporária de role requer privilégio administrativo.
Não existe reset automático. O destino principal foi autorizado na fase inicial em `AGENTS.md`.

Falha de BEGIN ou de ROLLBACK descarta a conexão em vez de devolvê-la ao pool com possível
transação/contexto pendente. Um teste simula rollback desconectado e verifica o descarte.

Não existe seed persistente, convite, CRUD ou tela de onboarding conectado. Login/sessão Firebase,
bootstrap atômico da primeira clínica/proprietário e autorização HTTP implementados nas entregas
1–3 da Step 4, com checks reais Firebase/Neon; ver `03-AUTENTICACAO-E-AUTORIZACAO.md`.
O runner interno não valida um destino
por conta própria: nenhum endpoint deve importá-lo. Empacotamento de SQL no container da API
só será necessário para o job operacional escolhido, não para o servidor HTTP atual.

Segurança global, dados sensíveis, retenção e ambientes ficam em
`docs/technical-debt/TD-003-ATIVACAO-SEGURA-DO-NUCLEO.md`. Não habilitar o que depende dessas
condições apenas porque a migration passou em memória.
