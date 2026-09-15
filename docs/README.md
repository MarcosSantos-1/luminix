# Luminix — Documentação técnica

Este diretório contém as decisões, princípios e referências utilizadas no desenvolvimento do Luminix.

Não é necessário ler todos os documentos para todas as tarefas.

Consulte apenas os documentos relevantes para a alteração atual.

## Documentos principais

| Arquivo                                                              | Finalidade                                           | Consultar quando                                            |
| -------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| [00-ARQUITETURA.md](00-ARQUITETURA.md)                               | Arquitetura geral e princípios estruturais           | Mudanças de arquitetura, módulos, tenants ou infraestrutura |
| [01-SEGURANCA.md](01-SEGURANCA.md)                                   | Regras gerais de segurança                           | Auth, dados, uploads, APIs, pagamentos e permissões         |
| [02-BANCO-E-DADOS.md](02-BANCO-E-DADOS.md)                           | PostgreSQL, constraints, índices, transações         | Mudanças no banco, queries ou migrations                    |
| [03-AUTENTICACAO-E-AUTORIZACAO.md](03-AUTENTICACAO-E-AUTORIZACAO.md) | Login, sessões, tenants, roles                       | Login, usuários, clínicas e permissões                      |
| [04-ESCALA-E-PERFORMANCE.md](04-ESCALA-E-PERFORMANCE.md)             | Metas e regras de performance                        | Queries, dashboards, processamento ou otimizações           |
| [05-OBSERVABILIDADE.md](05-OBSERVABILIDADE.md)                       | Logs, métricas e diagnóstico                         | Backend, jobs e integrações                                 |
| [06-JOBS-E-INTEGRACOES.md](06-JOBS-E-INTEGRACOES.md)                 | Jobs, retries, idempotência, webhooks                | Stripe, IA, email, push, campanhas                          |
| [07-MIGRATIONS-E-DEPLOY.md](07-MIGRATIONS-E-DEPLOY.md)               | Evolução segura do banco e deploy                    | Alterações de schema e produção                             |
| [08-PADROES-DE-CODIGO-IA.md](08-PADROES-DE-CODIGO-IA.md)             | Como alterações devem ser planejadas e implementadas | Todas as tarefas relevantes de implementação                |
| [09-PRODUTO-E-CONTEXTO.md](09-PRODUTO-E-CONTEXTO.md)                 | O que é o Luminix e como deve funcionar              | Novas funcionalidades e decisões de produto                 |
| [10-DESIGN-SYSTEM.md](10-DESIGN-SYSTEM.md)                           | UI, UX, componentes e identidade                     | Frontend, mobile e novas telas                              |
| [14-GLASS-MODE.md](14-GLASS-MODE.md)                                 | Tokens, superfícies e regras do tema Glass           | Implementar ou avaliar Glass/Light Mode                     |
| [15-LIGHT-MODE.md](15-LIGHT-MODE.md)                                 | Base temporária Light e limites do protótipo         | Evoluir o painel e onboarding provisórios                   |

Decisões de base recentes: [ADR-003 — Bootstrap do workspace](decisions/ADR-003-BOOTSTRAP-DO-WORKSPACE.md)
e [ADR-004 — Ambiente local e integrações](decisions/ADR-004-AMBIENTE-LOCAL-E-INTEGRACOES.md),
[ADR-005 — Container e deploy da API](decisions/ADR-005-CONTAINER-E-DEPLOY-DA-API.md) e
[ADR-006 — Deploy do admin na Vercel](decisions/ADR-006-DEPLOY-DO-ADMIN-NA-VERCEL.md) e
[ADR-007 — Deploy web do cliente](decisions/ADR-007-DEPLOY-WEB-DO-CLIENTE-NA-VERCEL.md).

## Diretórios

Domínios e portal web: [ADR-008](decisions/ADR-008-DOMINIOS-E-PORTAL-WEB.md) e
[16 — Operação e roadmap](16-DOMINIOS-E-PORTAL-WEB.md). Consultar ao trabalhar com site,
rotas `/c/`, portal do cliente, DNS ou domínios personalizados.

### `/decisions`

Architecture Decision Records.

Use quando uma decisão relevante possuir múltiplas alternativas ou consequências futuras.

### `/technical-debt`

Problemas conhecidos que foram conscientemente adiados.

### `/tests`

Cenários de teste que precisam ser implementados ou executados.

### `/incidents`

Registro de falhas importantes encontradas em produção ou testes.

## Prioridade das regras

Quando houver conflito:

1. Segurança e isolamento de tenant.
2. Integridade dos dados.
3. `AGENTS.md`.
4. Decisões ADR aceitas que substituam explicitamente decisões anteriores.
5. Arquitetura documentada, sincronizada com essas decisões.
6. Convenções locais do módulo.
7. Preferências de implementação.

Se documentos entrarem em contradição, não assumir silenciosamente qual está correto. Apontar a inconsistência antes de realizar uma mudança estrutural.

## Migração e decisões adotadas

- [Requisitos novos e pendentes do produto](13-REQUISITOS-PENDENTES-DO-PRODUTO.md): consultar ao especificar clínica, onboarding, equipe, tratamentos, clientes, mensagens e autenticação. Distingue decisões de detalhes ainda em aberto.
- [ADR-002 — Direções do produto](decisions/ADR-002-DIRECOES-DO-PRODUTO.md): R2, Stripe Connect, identidade e painel corporativo externo; substitui parcialmente a ADR-001.

- [Migração do legado](11-MIGRACAO-DO-LEGADO.md): consultar ao analisar ou portar o Charme & Bela.
- [Inventário inicial do legado](12-INVENTARIO-LEGADO.md): capacidades, propriedade dos dados, riscos e sequência proposta; ler antes de planejar a migração.
- [Mapa técnico do legado](migration/LEGADO-MAPA-TECNICO.md): consultar somente para localizar endpoints, modelos, páginas e migrations.
- [ADR-001 — Base do repositório](decisions/ADR-001-BASE-DO-REPOSITORIO.md): fronteiras adotadas nesta preparação.

## Como interpretar os documentos

Adotado descreve decisões vigentes; planejado descreve intenção ainda não implementada; em aberto descreve decisões pendentes. Cenários em docs/tests são especificações, não testes executados. Documentos vazios são pendências, não cobertura de testes.
