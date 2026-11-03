# Domínios e portal web — operação e roadmap

## Mapa adotado

| Endereço                            | Projeto Vercel   | Pasta                | Estado                                               |
| ----------------------------------- | ---------------- | -------------------- | ---------------------------------------------------- |
| `luminix.beauty/`                   | `luminix-web`    | `apps/web`           | Landing responsiva, caminhos de gestão e cliente     |
| `luminix.beauty/acesso`             | `luminix-web`    | `apps/web`           | Orientações para clientes; sem coleta de credenciais |
| `luminix.beauty/c/<slug>`           | `luminix-web`    | `apps/web`           | Página real por publicação opt-in; demo separada     |
| `luminix.beauty/c/<slug>/meu-plano` | `luminix-web`    | `apps/web`           | Aviso sem login/dados privados                       |
| `www.luminix.beauty`                | `luminix-web`    | `apps/web`           | Redirect 308 para o domínio principal cadastrado     |
| `app.luminix.beauty/`               | `luminix-admin`  | `apps/admin`         | Sem sessão → `/login`; com sessão → clínica          |
| `app.luminix.beauty/cadastro`       | `luminix-admin`  | `apps/admin`         | Cadastro da gestora (Firebase)                       |
| `app.luminix.beauty/login`          | `luminix-admin`  | `apps/admin`         | Login da gestora (Firebase)                          |
| URL `luminix-client.vercel.app`     | `luminix-client` | `apps/mobile-client` | Revisão do shell mobile, não portal web              |

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

Na fase inicial autorizada, entrega validada segue commit/push direto em `master`, conforme
AGENTS.md. O script manual de Preview usa `--target preview` explicitamente.

`NEXT_PUBLIC_ADMIN_URL` define o destino da gestão. `API_URL` é server-only e aponta para
`https://luminix-api.fly.dev` por padrão; em desenvolvimento pode apontar à API local.
Aplicar migration 0020 e publicar API antes do web/admin que consomem publicação.

## Roadmap

1. **Base e topologia — implementadas nesta etapa.** Shell web, rotas, testes da fixture, projetos e
   associações de domínio. Nenhum cadastro real é inventado a partir do slug.
2. **Clínicas publicáveis na API — implementado.** Migration 0020, publicação opt-in e projeção
   pública restrita de clínica ativa. GET/PUT autenticados em `/clinics/:ref/publication` exigem
   `settings:manage`; GET público `/public/clinics/:slug` retorna 404 para não publicada/inativa.
3. **Página real da clínica — implementada.** Tema e dados salvos, serviços ativos por categoria,
   frases introdutórias, localização, horários e redes opcionais. Configurações da gestão permite
   publicar e retirar do ar. Não há agendamento online nem editor das frases nesta etapa.
   Páginas em `noindex` durante preparação. Contrato e segurança: [ADR-021](decisions/ADR-021-PAGINAS-PUBLICAS-DAS-CLINICAS.md).
4. **Portal privado — pendente.** `/acesso` orienta clientes e sinaliza que o portal está em preparação;
   não solicita CPF/senha nem simula autenticação. Implementar identidade CPF/senha e recuperação segura conforme
   ADR-002 e documentação de autenticação. A API valida identidade + vínculo + clínica em cada
   operação; testar alteração de URL, IDs de outra clínica e vínculo removido. Só depois conectar
   `/meu-plano` a dados reais. `noindex` não é proteção de acesso.
5. **Admin e ambientes — pendente.** Cadastro em `/cadastro` e login em `/login` usam Firebase da
   equipe. Separar Preview/Production antes de dados reais, revisar cookies host-only, CORS,
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

## Site público e documentos legais — 2026-11-02

Landing reorganizada em apresentação, benefícios, configuração guiada, área da cliente, FAQ
expansível e footer. Header e footer em `components/marketing`; estilos em `app/marketing.css`.
Navegação mobile e FAQ usam `details/summary` nativos: conteúdo semântico acessível sem instalar
HeroUI (não presente no web) apenas para duas divulgações. O admin mantém HeroUI nos controles.
A prévia de agenda é ilustrativa; removidas alegações de adoção e métricas não comprovadas.

`/acesso` deixa de pedir CPF/senha em formulário sem backend. Oferece orientação para falar com o
estabelecimento, demonstração explicitamente identificada e caminho separado à gestão. Não cria
busca pública de clínicas ou acesso a agendamentos que ainda não existem.

`/termos` e `/privacidade` são documentos públicos preliminares v0.1, datados de 2026-11-02.
A pedido do usuário, nome do responsável é fictício e identificado como tal; razão social,
CPF/CNPJ, endereço e canal de contato permanecem a preencher. Não foi inventado CNPJ ou e-mail
operacional. Completar identidade, canal, retenção, transferências e revisão jurídica antes de
clientes reais. Links do cadastro abrem o domínio público em nova aba para preservar preenchimento.
A apresentação dessas páginas não implementa registro versionado do aceite (TD-005).

Referências utilizadas: [LGPD, texto atualizado](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html)
e [ANPD — Direitos dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares).

## Validação operacional — 2026-11-03

Migration `0020_public_clinic_pages.sql` aplicada no destino Neon confirmado
`ep-bitter-fog-acchavo1.sa-east-1.aws.neon.tech/neondb`. Nenhum perfil publicado automaticamente.
API publicada no Fly; `/health` retorna 200 e slug desconhecido retorna 404 pela nova projeção.
`pnpm check` passou: 108 testes API, 23 admin e 4 web, além de lint, TypeScript e builds.
Revisão visual local em desktop e mobile (320/390 px), navegação por categorias e termos.
Editor de frases, agendamentos e fluxo privado seguem explicitamente pendentes.
