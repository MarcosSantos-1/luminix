# TD-004 — Admin publicado à frente de master

Status: resolvida em 2026-09-16.

O admin da Step 5 foi publicado manualmente na Vercel Production a partir do commit `a5cbb91`
da branch `chore/web-domain-foundation`. Essa branch contém outras cinco entregas anteriores que
ainda não estão em `master`. A API correspondente foi publicada no Fly e a migration 0004 está
aplicada no Neon.

Risco: um push futuro em `master` disparará o deploy Git padrão do admin e poderá substituir a
versão com onboarding por uma versão anterior. A API e a migration são aditivas, mas a interface
deixará de expor o fluxo.

Resolução: os oito commits pendentes foram revisados quanto à ancestralidade e integrados à
`master` por fast-forward, com autorização explícita do usuário para esta fase sem clientes ou
dados reais. O checkout local também voltou para `master`. O deploy Git da principal deve ser
conferido após o push. Esta nota permanece como registro do risco temporário e sua resolução.
