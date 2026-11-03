# 00-ARQUITETURA.md

## Estado e mapa adotado

O workspace implementa admin Next.js, API Fastify/PostgreSQL e site público Next.js. Os dois
aplicativos Expo ainda são shells. A árvore de domínios ao fim deste documento é uma direção de
evolução, não um inventário de funcionalidades prontas. Criar módulos apenas quando houver uma
responsabilidade real. O legado continua referência, sem importação automática.

## Mapa implementado e sequência de evolução — revisão 2026-11-02

| Frente                       | Implementado / localização                                                                     | Próximo trabalho e limite atual                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identidade da equipe         | `apps/admin/components/staff-provider.tsx`, `hooks/use-staff-auth.ts`, API `modules/auth`      | Convites, delegação e proteção do último owner; cliente final usa outra jornada                                                                                                         |
| Contexto clínico             | `shared/auth`, `shared/tenant`, `shared/database`, migrations SQL versionadas                  | Reusar autorização por operação, role restrita, RLS, FKs compostas e auditoria em cada novo domínio                                                                                     |
| Entrada e cadastro           | `apps/admin/components/auth`, rotas `/login` e `/cadastro`                                     | Termos publicados, consentimentos persistidos e validação autenticada hospedada; TD-005                                                                                                 |
| Onboarding                   | `components/onboarding`, API `modules/clinics`, `onboarding-persist.ts`                        | Configuração, retomada e conclusão transacional existem; não equivalem à operação de todas as regras                                                                                    |
| Mídia e marca                | `modules/clinics/media-storage.ts`, `shared/integrations/r2`, `components/space-theme.tsx`     | Logo/fotos e seis paletas existem; limpeza/retenção de assets e domínio definitivo: TD-006                                                                                              |
| Clientes e agenda da gestora | API `modules/operations`, admin `components/manager/sections/{clients-panel,agenda-panel}.tsx` | Listar/criar clientes, agenda, criar atendimento com avisos e disponibilidade existem; cadastro completo, edição/cancelamento e capacidade operacional ainda precisam evoluir (ADR-012) |
| Pagamentos                   | `modules/payments`, `components/payments`, Stripe Connect em teste                             | Cadastro incorporado e preferências existem; checkout, webhooks, conciliação, pacotes e billing SaaS pendentes (TD-008)                                                                 |
| Regras de reserva            | Configuração no onboarding, migrations e ADR-017–020                                           | Motor público, concorrência, preços/política congelados e efeitos financeiros ainda pendentes (TD-009)                                                                                  |
| Site e portal                | `apps/web/app`, fixture de demonstração                                                        | API pública de clínicas, publicação real, autenticação do cliente e portal privado pendentes                                                                                            |
| Mobile                       | `apps/mobile-admin/App.tsx`, `apps/mobile-client/App.tsx`                                      | Shells Expo; `legacy-source` não participa do app ativo. Implementar por jornada sobre os contratos da API                                                                              |
| Packages                     | Diretórios reservados                                                                          | Ainda sem package compartilhado implementado; extrair contratos quando houver consumidores reais, sem importar internals da API nos apps                                                |

Sequência sugerida para as próximas entregas:

1. Fechar edição pós-onboarding de clínica, catálogo, equipe e recursos; especificar convites e permissões.
2. Consolidar clientes e agenda administrativa sobre a base existente, com capacidade, estados,
   alterações/cancelamentos, fuso e concorrência testados. Não reutilizar override da gestora no cliente.
3. Especificar e implementar checkout, ledger/conciliação e eventos idempotentes; depois ligar
   sinal, retenção, pacotes e assinaturas aos estados reais do pagamento. Billing SaaS é separado.
4. Publicação da clínica e identidade/vínculo do cliente; portal e autoagendamento com regras
   aplicadas no servidor, sem usar preferências salvas como prova de cobrança/consentimento.
5. Levar cada jornada estabilizada aos apps nativos, compartilhando contratos e regras do backend,
   com UI nativa própria. Não transportar componentes DOM ou o fluxo single-tenant legado.

Antes de clientes reais: resolver os critérios de ativação TD-003/005/006/008/009, separar ambientes,
validar jornadas hospedadas, conteúdo comercial e políticas de dados. Esses critérios não impedem
continuar desenvolvimento autorizado em `master`. `docs/tests` contém cenários, não prova de execução.

## Responsabilidades adotadas

| Responsabilidade                                        | Destino adotado                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Regras de negócio e endpoints por domínio               | `apps/api/src/modules/<dominio>/`                                                    |
| Contexto e validação central de tenant                  | `apps/api/src/shared/tenant/`                                                        |
| Conexão com banco                                       | `apps/api/src/shared/database/`                                                      |
| Schema, migrations e seeds                              | Sob `apps/api/`, seguindo uma localização única da ferramenta escolhida no bootstrap |
| Autenticação: fluxos de identidade                      | `apps/api/src/modules/auth/`                                                         |
| Hooks e mecanismos comuns de autenticação               | `apps/api/src/shared/auth/`; sem duplicar os fluxos do módulo                        |
| Institucional, páginas públicas e portal web do cliente | `apps/web/`, separados por rotas/funcionalidades; ver ADR-008                        |
| Painel da clínica e onboarding                          | `apps/admin/`                                                                        |
| Gestão corporativa multi-produto                        | Projeto externo da empresa-mãe; ver ADR-002                                          |
| Aplicativos de cliente e gestora                        | `apps/mobile-client/` e `apps/mobile-admin/`                                         |
| Contratos públicos compartilhados                       | `packages/contracts/`, quando houver consumidores                                    |
| Componentes e tokens compartilhados                     | Packages específicos quando houver implementação; design em etapa posterior          |
| Testes unitários                                        | Próximos ao código testado                                                           |
| Testes de integração                                    | `tests/` da aplicação proprietária                                                   |
| Automações transversais                                 | `scripts/`; comandos específicos pertencem à aplicação                               |

Módulos agrupam código por domínio. Não impor camadas ou arquivos sem responsabilidade concreta. Não compartilhar serviços internos importando uma aplicação de outra.

Packages não importam apps. Frontends não importam código de banco, configuração secreta ou serviços internos da API. Contratos públicos não são reexports de modelos do banco. `validation` não deve duplicar schemas de `contracts`; invariantes de negócio permanecem no backend. `database`, `auth` e `logger` ficam inicialmente na API; pastas homônimas reservadas em packages não são uma decisão de extração.

Configurações de ferramentas começam na raiz, com ajustes próprios por aplicação. O workspace inclui
explicitamente `apps/*` e packages reais em `packages/*`, nunca `legacy/**`. `pnpm` foi adotado sem
Turbo nesta etapa. A [ADR-009](decisions/ADR-009-NUCLEO-MULTI-TENANT.md) adota migrations SQL
versionadas, runner interno com pg e o primeiro schema multi-tenant, validado localmente com
PGlite. A primeira migration foi aplicada e verificada no Neon principal em 2026-09-15,
durante a fase inicial autorizada. Login/sessão Firebase, bootstrap owner e autorização HTTP
clínica foram implementados nas entregas 1–3 da Step 4 (ADR-010). Clientes e agenda administrativa
têm base operacional na ADR-012; os demais limites constam no mapa acima.

## Fronteira da plataforma

`apps/web` atende `luminix.beauty` e `/c/[clinica]`; `apps/admin` atende
`app.luminix.beauty`. Domínios compartilham a marca, não autorização ou privilégios.
A exportação web Expo é uma ferramenta de revisão do mobile, não o portal público oficial.
Ver [ADR-008](decisions/ADR-008-DOMINIOS-E-PORTAL-WEB.md) e
[roadmap de domínios](16-DOMINIOS-E-PORTAL-WEB.md).

O painel corporativo será externo ao repositório e reunirá vários produtos, conforme [ADR-002](decisions/ADR-002-DIRECOES-DO-PRODUTO.md). `platform-admin` não é aplicação obrigatória do Luminix. Integrações futuras usam contratos explícitos e autorização; não implementar acesso global retirando filtros de clínica. Consultas globais devem ter finalidade, projeção de dados e auditoria próprias; não concedem acesso implícito a prontuários ou anamneses. Eventual painel operacional exclusivo do Luminix depende de necessidade concreta.

Páginas públicas expõem apenas dados publicáveis. Consultas e chaves de cache devem distinguir a clínica correta. Separar marketing em outro deploy somente quando houver necessidade operacional real.

Identidade global e registros locais de cliente são distintos. Relações entre entidades tenant-aware também devem impedir referências entre clínicas, com constraints adequadas e testes. O nome adotado para identificação da clínica é `clinic_id`; tenant é o conceito arquitetural.

## Direção de evolução

Estamos migrando um sistema/app single-tenant chamado "Charme & Bela" para um SaaS multi-tenant chamado "Luminix". O Charme & Bela basicamente é um White-label, já o Luminix será um SaaS B2B para clínicas, salões e Studios.

### Stack adotada (novos domínios e integrações ainda pendentes):

- Backend: Node.js + TypeScript + Fastify
- PostgreSQL no Neon
- Backend hospedado no Fly.io
- Frontend/admin em Next.js + TypeScript na Vercel
- App mobile em React Native/Expo
- Cloudflare R2 como storage oficial para mídia
- Stripe Connect como gateway; Asaas não será usado no Luminix
- Cliente final: CPF/senha e recuperação SMS; tecnologia ainda a definir
- Gestor/equipe: Firebase com autorização por vínculo/roles no backend
- Autenticação separada da autorização de tenant

### Objetivo:

Transformar a base existente em uma arquitetura multi-tenant segura, escalável e simples de manter.

Estratégia multi-tenant:

- Shared database
- Shared schema
- Cada clínica possui um clinic_id único
- Dados de diferentes clínicas nunca podem ser acessados entre si
- Toda entidade específica de uma clínica deve carregar clinic_id
- Queries devem sempre ser filtradas pelo tenant autorizado
- Nunca confiar em clinic_id recebido diretamente do frontend
- O clinic_id utilizado nas queries deve ser derivado da sessão/autorização do usuário
- Usuários podem pertencer a mais de uma clínica
- Clientes finais podem estar vinculados a múltiplas clínicas

### Princípios:

1. Segurança multi-tenant acima de conveniência.
2. Nenhuma query de entidade tenant-aware pode executar sem contexto do tenant.
3. Evitar lógica de autorização espalhada pelos controllers.
4. Centralizar autorização em middleware/hooks/services.
5. Usar foreign keys, constraints e índices no PostgreSQL.
6. Criar índices compostos começando por clinic_id nas consultas frequentes.
7. Usar migrations versionadas.
8. Nunca alterar schema diretamente em produção.
9. Toda migration deve possuir estratégia de rollback ou procedimento documentado.
10. Não criar abstrações desnecessárias.
11. Evitar microserviços neste estágio.
12. Priorizar monólito modular.
13. Manter domínio separado de infraestrutura.
14. Evitar N+1 queries.
15. Utilizar transações para operações que alteram múltiplas entidades relacionadas.
16. Todas as operações sensíveis devem possuir logs de auditoria apropriados.
17. Toda rota deve validar input com schema.
18. Nunca expor detalhes internos, SQL errors ou stack traces ao cliente.

### Arquitetura desejada (adapatar e reutilizar o que já tem do Charme& Bela):

apps/api/src/
modules/
auth/
clinics/
clients/
professionals/
services/
appointments/
packages/
payments/
media/
campaigns/
shared/
database/
auth/
tenant/
errors/
logger/
config/

### Antes de alterar código:

1. Analise a implementação atual.
2. Identifique dependências single-tenant.
3. Liste tabelas e módulos afetados.
4. Proponha migrations.
5. Identifique riscos de vazamento cross-tenant.
6. Só depois implemente.

### Após implementar:

- criar testes de isolamento entre tenants;
- testar usuário da Clínica A tentando acessar recurso da Clínica B;
- testar IDs válidos pertencentes a outro tenant;
- testar troca de clínica;
- testar usuário pertencente a múltiplas clínicas;
- testar usuário removido de uma clínica;
- verificar índices e queries;
- verificar migrations;
- executar testes automatizados.

# Extras

- Isolamento de Mídia:
  - Caminhos no storage devem seguir obrigatoriamente a convenção: `{clinic_id}/{modulo}/{arquivo}`.
  - Uploads e downloads devem utilizar URLs pré-assinadas (Presigned URLs) geradas pelo backend com validação prévia de permissão.

Nunca assuma que uma implementação está segura apenas porque funciona.
