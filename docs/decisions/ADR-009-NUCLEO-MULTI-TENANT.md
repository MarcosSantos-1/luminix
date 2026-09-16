# ADR-009 — Núcleo multi-tenant

Status: Accepted

Data: 2026-09-15

## Contexto e escopo

A Step 3 foi autorizada para modelar identidade global, clínicas, equipe, clientes locais,
profissionais, ocupações, serviços, configurações, rascunhos e auditoria. Não existia schema ou
autenticação funcional. O banco Neon configurado não foi confirmado como destino isolado de testes.

Esta decisão substitui a pendência de schema/ferramenta da ADR-003 e ADR-004. Na validação inicial,
a migration foi executada apenas localmente; a atualização operacional ao final registra aplicação
posterior no Neon principal autorizada pelo usuário. O schema é uma base mínima, não a conclusão dos requisitos
PR01–PR09 nem dos fluxos de autenticação, onboarding, convites ou recuperação.

## Decisões

- Shared database/shared schema lógico `luminix`, separado do ledger `luminix_migrations`.
- Migration SQL versionada em `apps/api/migrations`; runner usa o driver `pg` existente,
  transação única, advisory lock e checksum SHA-256. O CLI posterior exige destino explícito.
  SQL explícito permite revisar FKs, triggers e RLS sem introduzir ORM em uma etapa sem CRUD.
  A recomendação de ORM da skill Neon foi avaliada; a necessidade de dependências deve seguir
  as regras do projeto. Reavaliar ORM somente junto de consultas reais, sem duplicar o schema.
- PGlite é dependência somente de desenvolvimento da API: PostgreSQL descartável em memória
  executa a migration real. Não substitui testes de concorrência, conexão `pg`, grants de
  operação, versão PostgreSQL do Neon ou pooling. Não requer Docker nem secrets.
- UUIDv4 via `gen_random_uuid()` neste primeiro schema, disponível sem extensão adicional.
  UUIDv7 é preferência, não requisito; não pressupor versão PostgreSQL que o suporte.
- `identities` é global e contém apenas estado e UID Firebase opcional/único, com um projeto
  Firebase configurado. Não contém CPF, senha, telefone de recuperação ou dados clínicos.
- `client_profiles` é global e mínimo: vínculo 1:1 com identidade autenticada. Cadastro local
  pode existir em `clinic_clients` sem perfil global. Nome e telefone são locais; alterações
  nesses contatos não alteram autenticação nem registros de outras clínicas.
- Vínculo global/local não pode ser criado por simples coincidência de nome, telefone ou CPF.
  FKs garantem existência, não prova de identidade; o fluxo de aceite/associação fica bloqueado
  até existir verificação própria. Não expor IDs globais ou vínculos com outras clínicas.
- `roles` pertence à clínica; `permissions` é catálogo técnico global sem edição por gestores;
  `role_permissions` é tenant-aware. Um papel por membership neste primeiro modelo, sem
  privilégio de plataforma ou bypass por nome de role. Não existem roles/grants padrão automáticos.
- `professionals` pertence à clínica, com membership opcional (profissional sem login). Uma
  membership pode representar no máximo um profissional por clínica. Ocupação não concede acesso.
- `occupations` é taxonomia editável da clínica. Catálogo global de sugestões fica para uma
  migration futura, sem enum fechado ou sincronização silenciosa de serviços selecionados.
- `services` exige preço inteiro não negativo em centavos, BRL e duração de 1 a 1440 minutos.
  `clinic_settings` fixa a base inicial pt-BR, BRL, America/Sao_Paulo. Internacionalização,
  variação por profissional e preços não confirmados exigem decisão/migration futura.
- `onboarding_drafts` é um rascunho por clínica já criada, com autor local, etapa, estado e
  versão para futura atualização otimista. Não armazena payload JSON arbitrário, documentos,
  tokens ou configurações de produto indefinidas. Draft não é conclusão/publicação automática.
- Todas as tabelas locais têm `clinic_id`. `clinics.id` é a raiz do tenant e exceção explícita;
  identidades, perfis globais e catálogo de permissões são as demais exceções.
- Relações locais usam FKs compostas `(clinic_id, id)`; propriedade tenant é imutável por trigger.
  Não há `ON DELETE CASCADE`: retenção/exclusão global precisa de política própria.
- RLS `ENABLE` + `FORCE` protege tabelas locais, incluindo clínicas e auditoria. Sem contexto,
  role comum não vê registros e não pode inseri-los. FKs continuam protegendo relações mesmo
  sob credencial privilegiada. RLS depende de role sem superuser/BYPASSRLS e é defesa adicional.
- `withClinicTransaction` recebe identidade já verificada no servidor, seleção de clínica e
  permissão definida pelo endpoint. Define escopo apenas na transação, reconsulta membership,
  identidade/clinic status e permission, deriva o TenantContext da linha autorizada e só então
  executa trabalho. Membership, clínica, role e grant ficam sob `FOR SHARE` até finalizar.
  Revogação vale para operações seguintes; operações em andamento podem concluir. Disablement
  da identidade é reconsultado a cada operação, sem lock da linha global.
- Nenhum hook HTTP popula tenantContext enquanto a sessão/token não for validada. Os headers
  recebidos continuam ignorados. O helper é infraestrutura interna, não autenticação funcional.

## Auditoria

Triggers auditam INSERT/UPDATE/DELETE de todas as tabelas locais operacionais, inclusive grants,
membership, preço, configurações e rascunhos. O evento participa da mesma transação. Armazena
clínica, chave técnica, ação, nomes dos campos alterados, identidade do contexto e login de banco.
Não copia valores de nomes, contatos ou dados clínicos. Isso não é histórico completo de preços.

UPDATE, DELETE e TRUNCATE da auditoria são recusados. Runtime terá somente SELECT e nunca INSERT
direto. Triggers SECURITY DEFINER usam search_path fixo; função de auditoria não é executável
diretamente por PUBLIC. O proprietário ainda pode alterar/desabilitar triggers: segregação de
credenciais é obrigatória. Operações administrativas sem sessão têm ator de identidade nulo e
login de banco registrado; não representam ações autenticadas de um usuário.

Eventos globais de identidade, tentativas negadas e retenção/exportação da auditoria precisam de
canal próprio antes dos respectivos endpoints; não forçar eventos globais numa clínica arbitrária.

## Impacto da primeira migration

- Cria tabelas novas e catálogo técnico, sem alterar ou migrar linhas de aplicações existentes.
- DDL requer locks em objetos novos; advisory lock serializa runners. Não executa backfill.
- Bootstrap HTTP anterior permanece compatível: só `/health`, sem dependência dessas tabelas.
- Falha reverte DDL e ledger na mesma transação. Migration aplicada não pode ser editada.
- Rollback pós-commit: preferir migration corretiva. Somente num banco comprovadamente descartável
  e vazio, o operador pode descartar o schema e ledger; nunca usar DROP/CASCADE com dados reais.
  Depois de receber dados, restauração exige backup, política de retenção e janela operacional.
- Índices adicionais só para lookup de memberships por identidade e timeline de auditoria;
  uniques/PKs criam os demais. Paginação/EXPLAIN ficam junto das consultas de produto.

## Condições para aplicação hospedada

Atualização operacional de 2026-09-15: o usuário autorizou explicitamente testes/migrations nos
projetos principais enquanto não há clientes/dados reais, sem branches adicionais. A restrição
de destino isolado abaixo descreve o requisito originalmente adotado; nesta fase é substituída
pela exceção de `AGENTS.md`. A migration 0001 foi aplicada em `luminix` no projeto `luminix`,
branch principal `production`, database `neondb`, PostgreSQL 18.6. FKs, RLS com role restrita,
ausência de contexto, preço e auditoria foram verificados via pg com fixtures/role revertidas.
Permanece obrigatória a separação migration/runtime antes de habilitar rotas de domínio.

Antes de aplicar: identificar projeto, branch, endpoint direto, database e versão PostgreSQL;
confirmar ausência de dados reais; separar a credencial de migration da credencial runtime;
reproduzir testes e grants no Neon isolado; definir operador, backup/restore e timeout de locks.
`NODE_ENV` e nome de branch sozinhos não comprovam destino seguro. Não há deploy ou alteração
remota autorizada implicitamente por esta ADR. Ver `docs/17-NUCLEO-MULTI-TENANT.md` e TD-003.

## Referências

- [PostgreSQL — RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).
- [PostgreSQL — triggers](https://www.postgresql.org/docs/current/sql-createtrigger.html).
- [PGlite — instalação e banco em memória](https://pglite.dev/docs/).
