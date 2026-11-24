# Luminix — Documentação técnica

Este diretório contém as decisões, princípios e referências utilizadas no desenvolvimento do Luminix.

Não é necessário ler todos os documentos para todas as tarefas.

Consulte apenas os documentos relevantes para a alteração atual.

Estado implementado e sequência das próximas frentes: [mapa de arquitetura](00-ARQUITETURA.md#mapa-implementado-e-sequência-de-evolução--revisão-2026-11-02).

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
[ADR-007 — Deploy web do cliente](decisions/ADR-007-DEPLOY-WEB-DO-CLIENTE-NA-VERCEL.md) e
[ADR-014 — Onboarding v3 e mídia](decisions/ADR-014-ONBOARDING-V3-E-MIDIA.md).

Regras e revisão final do onboarding: [ADR-017](decisions/ADR-017-REGRAS-E-REVISAO-DO-ONBOARDING.md).
Tipos de reserva e destino do sinal simplificados: [ADR-020](decisions/ADR-020-TIPOS-DE-RESERVA-E-SINAL-SIMPLES.md).
Sinal em Pagamentos e regras simplificadas: [ADR-019](decisions/ADR-019-SINAL-NO-ONBOARDING.md).
Cancelamento tardio, faltas e preferências de retenção: [ADR-018](decisions/ADR-018-CANCELAMENTO-TARDIO-E-FALTAS.md).

Pagamentos e cadastro Stripe incorporado: [ADR-016](decisions/ADR-016-STRIPE-CONNECT-INCORPORADO.md).
Cobrança real e assinatura do Luminix ainda pendentes, conforme a decisão.

Agenda e clientes do gestor: [ADR-012](decisions/ADR-012-AGENDA-E-CLIENTES-DO-GESTOR.md).
Cadastro de clientes (CPF, consentimento, duplicidade, edição/arquivo) e regras de vínculo com a conta Luminix: [ADR-027](decisions/ADR-027-CADASTRO-DE-CLIENTES-E-VINCULO.md).
Conta do cliente, vínculo pelo app, profissionais e agendamento pelo cliente: [ADR-029](decisions/ADR-029-CONTA-DO-CLIENTE-E-AGENDAMENTO.md).
Ficha de anamnese por níveis I–III, reaproveitamento e validade anual: [ADR-030](decisions/ADR-030-FICHA-DE-ANAMNESE-POR-NIVEIS.md).
Diretório público de espaços por nome para a área do cliente: [ADR-028](decisions/ADR-028-DIRETORIO-PUBLICO-POR-NOME.md).
Agendamento em etapas, feriados (alerta "vai abrir?") e férias/fechamentos por período: [ADR-031](decisions/ADR-031-AGENDA-FERIADOS-E-FECHAMENTOS.md).
Anamnese pela equipe, pacotes de sessões e aparelhos alugados: [ADR-032](decisions/ADR-032-ANAMNESE-PELA-EQUIPE-PACOTES-E-APARELHOS.md).
Cancelamentos por mudança de agenda (prévia dos afetados, aviso à cliente) e dia exclusivo de locação: [ADR-035](decisions/ADR-035-CANCELAMENTOS-POR-MUDANCA-DE-AGENDA.md).
Tipo do espaço (Studio, Clínica, Salão, SPA, Espaço), avaliação de primeira visita e proposta do fluxo pelo site: [ADR-036](decisions/ADR-036-TIPO-DO-ESPACO-E-PRIMEIRA-VISITA.md).
Sinal por Pix do espaço (reserva, copia-e-cola, confirmação pela equipe, expiração) e regras de cancelar/remarcar aplicadas: [ADR-037](decisions/ADR-037-SINAL-POR-PIX-DO-ESPACO.md).
Link de confirmação por agendamento sem login (`/confirmar`), alertas e objetivos da anamnese: [ADR-038](decisions/ADR-038-LINK-DE-CONFIRMACAO-E-ALERTAS-DA-ANAMNESE.md).
Assinatura do Luminix (R$ 99,90/mês ou R$ 900/ano, cartão ou Pix, 12 dias grátis, carência e só leitura): [ADR-039](decisions/ADR-039-ASSINATURA-DO-LUMINIX.md).
Pagamento do atendimento pelo app na conta Stripe da clínica (horário segurado, webhook, Financeiro): [ADR-040](decisions/ADR-040-PAGAMENTO-DOS-ATENDIMENTOS-PELO-APP.md).
Situação da conta Stripe com aviso por e-mail, cadastro seguindo durante a análise e "E agora?": [ADR-041](decisions/ADR-041-SITUACAO-DA-CONTA-STRIPE-E-PROXIMOS-PASSOS.md).
Sinal pelo app (só o sinal ou tudo), restante no espaço, comprovante e agendamento em etapas na área da cliente: [ADR-042](decisions/ADR-042-SINAL-PELO-APP.md).
Confirmar presença pela área da cliente e pacotes visíveis: [ADR-043](decisions/ADR-043-CONFIRMAR-PRESENCA-E-AREA-DA-CLIENTE.md).

## Diretórios

Núcleo multi-tenant: [ADR-009](decisions/ADR-009-NUCLEO-MULTI-TENANT.md) e
[17 — Modelo, validação e ativação](17-NUCLEO-MULTI-TENANT.md). Consultar ao trabalhar com schema,
membership, papéis, clientes locais, profissionais, serviços, RLS e auditoria. Migration aplicada
e verificada no Neon principal na fase inicial autorizada; sessão, bootstrap e autorização HTTP
da equipe implementados. Onboarding inicial persistido e conclusão transacional definidos na
[ADR-011](decisions/ADR-011-ONBOARDING-INICIAL.md), evoluídos para configuração completa na
[ADR-013](decisions/ADR-013-ONBOARDING-COMPLETO-DA-CLINICA.md). Edição pós-conclusão de perfil,
endereço e regras na ADR-022; equipe e acessos na ADR-023; catálogo ainda pendente.

Domínios e portal web: [ADR-008](decisions/ADR-008-DOMINIOS-E-PORTAL-WEB.md) e
[16 — Operação e roadmap](16-DOMINIOS-E-PORTAL-WEB.md). Consultar ao trabalhar com site,
rotas `/c/`, portal do cliente, DNS ou domínios personalizados.
Publicação opt-in e projeção pública: [ADR-021](decisions/ADR-021-PAGINAS-PUBLICAS-DAS-CLINICAS.md).
Configurações editáveis, editor do site e endereços amigáveis: [ADR-022](decisions/ADR-022-CONFIGURACOES-EDITAVEIS-E-ENDERECOS-PUBLICOS.md).
Equipe, horários, convites e níveis de acesso: [ADR-023](decisions/ADR-023-EQUIPE-E-ACESSOS.md).
Acervo de mídia privado (bucket R2 privado, URLs assinadas): [ADR-024](decisions/ADR-024-ACERVO-DE-MIDIA-PRIVADO.md).
Painel com dados reais (serviços, promoções, financeiro, estoque, relatórios): [ADR-025](decisions/ADR-025-PAINEL-COM-DADOS-REAIS.md).
Atividades (ler, arquivar, apagar por pessoa), avisos em carrossel, sino e pesquisa indexada: [ADR-026](decisions/ADR-026-ATIVIDADES-AVISOS-E-PESQUISA.md).
Guia “onde fica cada coisa” e dicas para próximas frentes: [00-ARQUITETURA](00-ARQUITETURA.md#onde-fica-cada-coisa-guia-rápido-para-novas-mudanças).

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
