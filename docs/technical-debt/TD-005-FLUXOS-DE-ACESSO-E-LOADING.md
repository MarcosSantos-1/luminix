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

## Revisão 2026-11-02

Resolvido: opção “Manter conectada” ligada à persistência Firebase, check visível e acessível;
cadastro mobile sem hero, campos rotulados e alvos maiores. Composição agrupada em
`components/auth`. Revisão visual local de login desktop e cadastro mobile executada.

Permanecem abertos: páginas de termos/privacidade aprovadas e publicadas (links ainda `#`),
registro versionado de aceite, preferência de novidades persistida, conteúdo comercial verificável
e ensaio autenticado hospedado (recuperação, persistência, retomada e conclusão). O checkbox de
novidades ainda não aciona envio nem representa consentimento persistido. Não encerrar esta dívida
com base só em aparência ou build. Próxima frente: fechar conteúdo/contratos de consentimento antes
de cadastro de clientes reais. Histórico de loading não comprova defeito atual nem sua resolução.

## Evolução do site público — 2026-11-02

Resolvidos: links `#` de termos/privacidade substituídos por páginas públicas, depoimentos do login
removidos, alegação de 2.000 clínicas e métricas fictícias da landing retiradas. `/acesso` agora
orienta clientes sem pedir CPF/senha ou simular login. Prévia de agenda identificada como exemplo.

Termos/política são preliminares: usuário solicitou dados fictícios enquanto não possui responsável
jurídico/canal definidos. Identificação e contato reais, revisão jurídica, retenção/transferências,
registro versionado do aceite e preferência de marketing persistida continuam abertos. O documento
não deve ser tratado como conformidade concluída. Critérios hospedados anteriores continuam válidos.
