# TD-005 — Fluxos de acesso e loading

Status: Aberta.

Data: 2026-09-18.

O usuário solicitou publicar a remodelação do site e do acesso da gestora antes de investigar
o loading, principalmente no onboarding. A causa do comportamento ainda não foi diagnosticada.

Próxima entrega: reproduzir login, bootstrap, retomada e conclusão do onboarding no ambiente
hospedado; identificar onde a espera ocorre e validar estados de erro e nova tentativa.

Limites observados na revisão desta publicação, a resolver antes de clientes reais:

- `/acesso` é um formulário demonstrativo: CPF e senha não autenticam; o envio abre a demonstração.
- A landing contém métricas ilustrativas e a alegação de 2.000 clínicas, sem comprovação; os
  depoimentos do login também são conteúdo de template. Identificar como demonstração ou substituir
  por conteúdo verificável antes de divulgação comercial.
- Termos e privacidade apontam para `#`; preferências de novidades e de manter a sessão não são
  persistidas pelo novo formulário. A sessão continua seguindo a configuração Firebase existente.

Validação desta entrega: `pnpm check` passou, incluindo 70 testes da API, dois testes do web e
builds. Isso não substitui a validação autenticada no navegador, pendente junto da investigação
do loading. Não houve mudança de schema, de autorização da API ou de isolamento de tenant.
