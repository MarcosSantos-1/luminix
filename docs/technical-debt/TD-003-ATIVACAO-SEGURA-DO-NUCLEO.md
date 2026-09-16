# TD-003 — Ativação segura do núcleo multi-tenant

Status: Aberta

Data: 2026-09-15

ID: TD-003

Módulo: database / tenant / auth / onboarding

Prioridade: P1 — condições restantes antes de dados reais e fluxos dependentes.

Impacto atual: schema aplicado e checks básicos executados no Neon principal; rotas HTTP de
contexto/settings da equipe foram abertas com autorização, sem CRUD clínico. A exigência de branch isolada foi substituída pela autorização inicial de
`AGENTS.md`; preparar ambientes separados antes de receber dados reais.

Risco futuro, contenção e momento de resolução detalhados por item abaixo.

Atualização Step 4 entrega 1: `/auth/session` usa banco para associar UID Firebase verificado à
identidade ativa. Sem rotas clínicas abertas. Suítes HTTP/PGlite cobrem associação e rejeição;
role runtime restrita e testes hospedados continuam pendentes para entrega 3, antes de publicação.
Eventos globais `staff_identity_created` e `staff_session_denied` usam logger da API com request ID,
ID interno quando criado e motivo categórico, sem UID/e-mail/token ou erro do provedor. Esse canal
é operacional e não transacional; retenção, acesso restrito e armazenamento durável ainda precisam
ser fechados antes de dados reais. Rate limit atual por IP/processo agrega tráfego do proxy admin;
evoluir para limitação distribuída/por identidade antes de escala.

Atualização entrega 2: bootstrap primeira clínica/owner implementado via migration 0002, função
de EXECUTE delimitado e recibo global identity-scoped. Migration aplicada no Neon neondb/luminix;
testes reais cobrem actor/retry/RLS sob role de teste e serialização de duas conexões. Fixtures
removidas/revertidas. A entrega 3 adicionou runtime restrito e autorização HTTP clínica.
Delegação, convites, proteção do último proprietário e criação de clínicas
adicionais continuam pendentes; não estão autorizados por este endpoint de primeira criação.

## Problemas isolados e condições de fechamento

| Problema / risco                                                                                | Contenção atual                                                                                        | Condição antes de ativar                                                                                                      |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Destino Neon e aplicação da primeira migration — resolvido em 2026-09-15                        | Principal autorizado, identificado e inicialmente vazio; migration e checks pg realizados              | Retomar separação de ambientes antes de dados reais                                                                           |
| Credencial runtime privilegiada pode contornar RLS e adulterar auditoria — resolvido para a API | Fly usa apenas DATABASE_URL_RUNTIME restrita; guard de inicialização e prova Neon passaram             | Manter segregação de credenciais e revisar grants ao adicionar CRUD                                                           |
| Sessão/contexto HTTP — resolvido para leitura de contexto/settings                              | Token Firebase, vínculo e grant revalidados por operação; testes A × B/revogação passam                | Estender a mesma fronteira a cada novo CRUD e validar UI autenticada hospedada                                                |
| Vínculo client_profiles por UUID não comprova identidade                                        | Sem endpoint para associação ou leitura global                                                         | Aceite/verificação, proteção contra enumeração e testes de tentativa de vincular cliente de outra pessoa                      |
| CPF/senha/SMS/recuperação assistida ainda indefinidos                                           | Nenhum campo ou endpoint de credencial no schema                                                       | Definir provedor, armazenamento protegido, rate limits, contestação e revogação; PR13–PR16                                    |
| Eventos globais e tentativas negadas não entram na auditoria local                              | Eventos globais sanitizados no logger; armazenamento durável pendente                                  | Fechar acesso restrito, retenção e durabilidade do canal global antes de clientes reais                                       |
| Auditoria guarda campos, não valores históricos de preço                                        | Chaves e campos sem snapshots pessoais; evento transacional                                            | Definir histórico financeiro/valores sanitizados antes de reservas, cobrança ou edição financeira                             |
| Retenção/exclusão/backup ainda não definido                                                     | Sem CASCADE de dados; auditoria imutável; estados archived/revoked                                     | Política de retenção, LGPD e processo auditado de exclusão/restore antes de dados reais                                       |
| Concorrência/pooling/Fly parcialmente validados                                                 | Duas conexões/lock timeout e revogação testados no Neon; Fly iniciou com role restrita e health passou | Fazer teste hospedado autenticado e carga/reutilização do pool antes de dados reais                                           |
| Bootstrap proprietário e delegação podem permitir escalada se CRUD ingênuo                      | Nenhuma role padrão ou gestão de equipe exposta                                                        | Criação atômica clínica/role/member e política de delegação, proteção do último proprietário, grants que gestor pode conceder |
| Rascunho/versão não implementa atualização otimista sozinho                                     | Sem endpoints/payload arbitrário ou conclusão automática                                               | Definir jornadas/validações e UPDATE condicionado à versão + incremento; testar disputa e conclusão atômica                   |

Esta dívida não impede revisar o modelo e testar constraints localmente. Impede declarar o
produto pronto ou habilitar os fluxos dependentes sem fechar cada condição pertinente.

Publicação inicial nos projetos principais está autorizada, mas o workflow manual do Fly ainda
não exige checks em CI. `pnpm check` passou antes desta publicação; configurar gating e separar
ambientes antes de clientes reais. Não foi alterado o workflow nesta atualização.

## Inconsistência documental encontrada

`docs/07-MIGRATIONS-E-DEPLOY.md` descrevia simultaneamente deploy Fly manual e um caminho normal
por push/Actions. O workflow atual e AGENTS.md são manuais. A seção foi alinhada nesta tarefa;
nenhum workflow de CI foi alterado. A Step 4 publicou API/admin e a credencial restrita no Fly.
