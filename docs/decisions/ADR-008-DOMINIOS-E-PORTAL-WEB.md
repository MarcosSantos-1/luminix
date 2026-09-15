# ADR-008 — Domínios e portal web do cliente

Status: Accepted (topologia adotada; funcionalidades em preparação)

Data: 2026-09-15

## Decisão

- `luminix.beauty` pertence ao projeto Vercel `luminix-web`, raiz `apps/web`, em Next.js;
- o mesmo projeto atende institucional, páginas públicas em `/c/[clinica]` e portal autenticado do
  cliente sob essa clínica;
- `www.luminix.beauty` redireciona para o domínio principal;
- `app.luminix.beauty` pertence ao projeto `luminix-admin`, raiz `apps/admin`;
- os dois projetos compartilham a API de negócio, não código interno, sessões ou privilégios;
- os apps Expo permanecem independentes. O projeto `luminix-client` serve para revisão web do mobile,
  não é o portal público oficial. Isso esclarece a finalidade provisória da ADR-007;
- slug público identifica uma clínica solicitada, mas não autoriza acesso. A API resolve o
  `clinic_id` permanente e verifica o vínculo antes de devolver qualquer dado privado;
- não criar domínio/deploy por clínica. Domínios personalizados ficam para etapa posterior, com
  verificação de propriedade e associação explícita à clínica.

## Estado implementado

O shell Next.js possui home, clínica demonstrativa, 404 para outros slugs e rota de plano com aviso de
funcionalidade pendente. Não há login, dados reais, schema ou consulta tenant-aware nesta preparação.
`/meuplano` redireciona para `/meu-plano`; `/home` no admin redireciona ao dashboard atual.

Os projetos/domínios foram cadastrados na Vercel. DNS continua na Hostinger e ainda não foi alterado.
O primeiro deployment Git foi marcado automaticamente como Production pela Vercel e cancelado antes
do build. Usar `--target preview` explicitamente para esta primeira validação. A branch de preparação
não foi integrada em `master`.

## Consequências

O web e o admin têm builds, ambientes e origens separados. Cookies de autenticação devem permanecer
restritos à aplicação dona da sessão, salvo decisão explícita futura; o domínio-base compartilhado
não justifica sessão administrativa disponível ao portal público. CORS deve permitir apenas origens
necessárias e não substitui autorização. Cache público precisa distinguir clínica; dados privados
não podem usar cache compartilhado público.

O roteiro de implementação e cutover está em
[16-DOMINIOS-E-PORTAL-WEB](../16-DOMINIOS-E-PORTAL-WEB.md).
