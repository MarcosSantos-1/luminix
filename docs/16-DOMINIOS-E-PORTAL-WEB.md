# Domínios e portal web — operação e roadmap

## Mapa adotado

| Endereço                            | Projeto Vercel   | Pasta                | Estado                                           |
| ----------------------------------- | ---------------- | -------------------- | ------------------------------------------------ |
| `luminix.beauty`                    | `luminix-web`    | `apps/web`           | Shell pronto; DNS pendente                       |
| `luminix.beauty/c/<slug>`           | `luminix-web`    | `apps/web`           | Apenas `/c/demonstracao` funciona                |
| `luminix.beauty/c/<slug>/meu-plano` | `luminix-web`    | `apps/web`           | Aviso sem login/dados privados                   |
| `www.luminix.beauty`                | `luminix-web`    | `apps/web`           | Redirect 308 para o domínio principal cadastrado |
| `app.luminix.beauty`                | `luminix-admin`  | `apps/admin`         | Dashboard existente; DNS pendente                |
| URL `luminix-client.vercel.app`     | `luminix-client` | `apps/mobile-client` | Revisão do shell mobile, não portal web          |

Referência: [ADR-008](decisions/ADR-008-DOMINIOS-E-PORTAL-WEB.md).

## Comandos

```bash
pnpm install
pnpm dev:web
pnpm build:web
pnpm lint:web
pnpm typecheck:web
pnpm test:web
pnpm check
pnpm vercel:web:preview
# Publicação somente com intenção explícita:
pnpm vercel:web:production
```

Web local usa porta 3001 e admin usa 3000. Todos os projetos Vercel conectados usam `master` para
Production e demais branches/PRs para Preview. O CI GitHub valida o workspace, mas não bloqueia por
si só o deploy Git da Vercel. Validar Preview e CI antes de integrar mudanças em `master`.

`NEXT_PUBLIC_ADMIN_URL` usa a URL Vercel do admin em Preview enquanto o DNS não foi ativado.
Production pode usar `https://app.luminix.beauty`. A API ainda não é consumida por este shell.

## Roadmap

1. **Base e topologia — implementadas nesta etapa.** Shell web, rotas, testes da fixture, projetos e
   associações de domínio. Nenhum cadastro real é inventado a partir do slug.
2. **Clínicas publicáveis na API — pendente.** Escolher schema/ferramenta de migrations; criar
   migration versionada com `clinic_id`, slug único/normalizado e estado de publicação. Definir
   política de mudança de slug. Endpoint público devolve apenas campos publicáveis de clínica ativa.
   Testar desconhecida, não publicada, slug inválido e isolamento/cache entre clínicas.
3. **Página real da clínica — pendente.** Substituir fixture por contrato público da API. Implementar
   identidade visual, contato, serviços e metadata/SEO. Não liberar indexação da demonstração.
4. **Portal privado — pendente.** Implementar identidade CPF/senha e recuperação segura conforme
   ADR-002 e documentação de autenticação. A API valida identidade + vínculo + clínica em cada
   operação; testar alteração de URL, IDs de outra clínica e vínculo removido. Só depois conectar
   `/meu-plano` a dados reais. `noindex` não é proteção de acesso.
5. **Admin e ambientes — pendente.** Conectar login Firebase, seleção de clínica e autorização por
   membership. Separar Preview/Production antes de dados reais, revisar cookies host-only, CORS,
   recuperação de conta e configuração Firebase dos domínios autorizados.
6. **Cutover DNS — ação manual abaixo.** Confirmar Production, HTTPS, rotas e redirects antes de
   distribuir links. Não apontar DNS para um projeto sem deployment Production válido.
7. **Semi-white-label — posterior.** Domínios personalizados verificados apontam ao mesmo web e são
   mapeados à clínica; admin continua compartilhado. Não implementar por suposição de Host header.

## Hostinger: ativar domínio quando estiver pronto

Manter registro e nameservers na Hostinger. Não é necessário transferir domínio ou comprar outro.
Na Vercel, consultar:

- `luminix-web → Settings → Domains`;
- `luminix-admin → Settings → Domains`.

Snapshot obtido da API de configuração Vercel em 2026-09-15 (revalidar no painel antes de aplicar):

| Tipo  | Nome na Hostinger | Conteúdo                               | TTL |
| ----- | ----------------- | -------------------------------------- | --- |
| A     | `@`               | `216.198.79.1`                         | 300 |
| A     | `@`               | `64.29.17.1`                           | 300 |
| CNAME | `www`             | `f0c83549c09391b8.vercel-dns-017.com.` | 300 |
| CNAME | `app`             | `c12064a3d544a40c.vercel-dns-017.com.` | 300 |

Os dois A são a lista recomendada de IPv4 no snapshot. Substituir o A antigo de `@` (`2.57.91.91`),
sem mantê-lo junto dos destinos Vercel. Substituir o CNAME antigo de `www` (`luminix.beauty`) pelo
destino recomendado. Verificar conflitos A/AAAA/CNAME **apenas nesses nomes**. Preservar MX, TXT e
demais registros de email/verificação. DNS não contém caminhos `/c/...`.

Depois de propagação, confirmar `Valid Configuration` nos dois projetos e SSL provisionado, testar
home, `/c/demonstracao`, 404 de clínica desconhecida, `/home` no admin e redirect `www`.

```bash
vercel domains inspect luminix.beauty
vercel domains inspect app.luminix.beauty
```

Rollback DNS: restaurar o A e CNAME anteriores acima; guardar export/snapshot completo antes de
qualquer edição. Propagação/cache impede rollback instantâneo. Rollback de código usa deployment
Vercel anterior validado, não restauração manual de banco.

Documentação oficial: [domínio com DNS externo](https://vercel.com/docs/domains/set-up-custom-domain).
