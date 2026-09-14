# ADR-006 — Deploy do admin na Vercel

Status: Accepted

Data: 2026-09-14

## Contexto

O painel Next.js precisava de um destino hospedado separado da API e compatível com o workspace
`pnpm`, sem duplicar pipelines nem enviar secrets administrativos ao frontend.

## Decisão

- hospedar somente `apps/admin` no projeto Vercel `luminix-admin`;
- conectar diretamente o repositório GitHub, usando `master` como branch de Production e demais
  branches/pull requests como Preview;
- usar a integração Git nativa da Vercel, sem workflow adicional no GitHub Actions;
- manter somente variáveis `NEXT_PUBLIC_*` no projeto, pois o admin não hospeda a API nem recebe
  credenciais Firebase Admin, Neon, R2 S3 ou Stripe secretas;
- usar o mesmo conjunto de serviços em modo de teste nos três escopos apenas durante o bootstrap;
- manter `.vercel/` local e credenciais do CLI fora do Git;
- ignorar no upload CLI os aplicativos e materiais sem relação com o build do admin.

## Estado verificado

- projeto conectado ao GitHub com raiz `apps/admin`, framework Next.js e branch `master`;
- nove variáveis públicas configuradas em Development, Preview e Production;
- build remoto concluído e páginas `/` e `/dashboard` respondendo `200`;
- primeiro deployment atribuído a Production pela regra da Vercel para projetos sem deployment
  anterior, mesmo sem a flag `--prod`.

## Consequências e pendências

O painel hospedado usa configurações de teste e aponta para a URL reservada do Fly, mas a API ainda
não foi publicada. Antes de dados reais, separar projetos/credenciais de Preview e Production,
definir domínio e revisar proteção, observabilidade e limites de gasto.

O empacotamento local `vercel build` conclui o Next.js, mas o Windows sem permissão de symlink falha
ao montar `.vercel/output`. O builder Linux remoto foi validado com sucesso; habilitar Developer Mode
no Windows é opcional caso o empacotamento Vercel local se torne necessário.
