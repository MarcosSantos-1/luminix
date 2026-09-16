# TD-004 — Admin publicado à frente de master

Status: aberta em 2026-09-16.

O admin da Step 5 foi publicado manualmente na Vercel Production a partir do commit `a5cbb91`
da branch `chore/web-domain-foundation`. Essa branch contém outras cinco entregas anteriores que
ainda não estão em `master`. A API correspondente foi publicada no Fly e a migration 0004 está
aplicada no Neon.

Risco: um push futuro em `master` disparará o deploy Git padrão do admin e poderá substituir a
versão com onboarding por uma versão anterior. A API e a migration são aditivas, mas a interface
deixará de expor o fluxo.

Resolução: revisar o conjunto de commits pendentes e integrá-lo à principal antes do próximo
deploy Git em `master`. Não fazer push direto de todos os commits sem essa revisão, pois incluem
o portal web e mudanças de infraestrutura além da Step 5.
