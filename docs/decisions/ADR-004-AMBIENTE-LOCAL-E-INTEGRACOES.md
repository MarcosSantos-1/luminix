# ADR-004 — Ambiente local e integrações iniciais

Status: Accepted

Data: 2026-09-14

## Contexto

O bootstrap precisava conectar o desenvolvimento aos serviços externos já criados sem confundir
credenciais de teste com produção nem antecipar schema, pagamentos ou uploads.

## Decisão

- manter valores reais somente em arquivos `.env` locais ignorados;
- usar a URL pooled do Neon em tráfego normal da API e reservar a URL direta em
  `DATABASE_URL_UNPOOLED` para futuras migrations;
- usar `sslmode=verify-full` e channel binding na conexão local do Neon;
- usar `pg` como driver de runtime Node/Fly para validar conectividade. A escolha de ORM e ferramenta
  de migrations permanece pendente até o desenho do primeiro schema;
- permitir somente chaves Stripe `sk_test_` fora de produção e não implementar fluxos Connect antes
  de definir contas, webhooks e idempotência;
- configurar Firebase Web SDK apenas no admin e mobile-admin. A API usa Firebase Admin com
  Application Default Credentials no desenvolvimento local e aceita credenciais administrativas
  equivalentes por variáveis no deploy; o mobile-client não reutiliza Firebase;
- registrar account, bucket e endpoints R2 somente na API. Credenciais S3 são obrigatórias antes de
  implementar presigned URLs;
- não usar a URL pública `r2.dev` para dados clínicos, anamneses ou mídia privada;
- manter `/health` independente de serviços externos; verificações de banco e Stripe são comandos
  explícitos de diagnóstico.

## Estado verificado

- conexão SQL somente leitura com Neon validada por `select 1`;
- chave Stripe test validada por leitura da conta da plataforma;
- configuração pública do projeto Firebase Auth respondeu com sucesso;
- credencial Firebase Admin local validada por uma leitura limitada do Auth, sem copiar o JSON para
  o workspace;
- endpoint público R2 respondeu, mas a raiz não contém objeto público (`404`);
- credenciais S3 do R2 validadas por uma listagem limitada e somente leitura do bucket;
- o CLI Neon foi inicializado, as skills foram instaladas e a sessão OAuth acessou o projeto
  `luminix` na organização selecionada;
- o bucket R2 `luminix` existe, está vazio e não possui configuração CORS.

## Consequências e pendências

Não existe schema, migration, tabela, webhook, conta conectada Stripe, upload ou autenticação
funcional nesta decisão. Antes desses recursos, definir ambientes separados, acesso mínimo,
tratamento de falhas, auditoria e testes multi-tenant.

O R2 ainda não possui política CORS. Upload direto futuro exigirá política específica para
`GET`/`PUT`/`HEAD`, headers e exposição de `ETag`; não habilitar CORS antes de existir endpoint
autorizado e presigned URL de curta duração.
