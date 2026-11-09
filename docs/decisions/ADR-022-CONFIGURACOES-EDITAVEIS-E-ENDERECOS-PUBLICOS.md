# ADR-022 — Configurações editáveis, editor do site e endereços públicos

- Data: 2026-11-08
- Estado: implementado; migration 0024 aplicada no Neon principal em 2026-11-08 (API, web e admin aguardam deploy)

## Contexto

Depois do onboarding, o painel só lia os dados. Não havia escrita para perfil, endereço,
contatos ou regras. A vitrine usava o slug igual ao código do espaço (`/c/kw-4374`), difícil
de lembrar. O editor da vitrine era um formulário sem prévia.

## Decisão

### Escrita pós-onboarding (migration 0024)

Funções SECURITY DEFINER com `search_path` fixo, EXECUTE revogado de PUBLIC e concedido só a
`luminix_api`. Todas exigem contexto tenant, identidade verificada e `settings:manage`, e
recusam clínicas em rascunho:

- `update_clinic_profile`: nome, responsável, e-mail, telefone, WhatsApp, ano, redes, logo
  (mídia pronta `clinic_logo` da mesma clínica) e endereço do local principal. CPF/CNPJ não
  é editável pelo painel.
- `update_booking_rules`: mesmos limites da conclusão do onboarding, incluindo sinal e
  exceções por serviço ativo da mesma clínica. Continua sendo só configuração.

API: `GET/PUT /clinics/:id/profile`, `GET/PUT /clinics/:id/booking-rules`. O admin reaproveita
`RulesStep` e `DepositSettings` do onboarding, montando um `Payload` parcial.

### Endereços públicos amigáveis

- Ao ativar (draft → active), um trigger troca o slug provisório pelo nome normalizado
  (`studio-lumiere`, depois `-2`, `-3`… e sufixo aleatório como último recurso).
- A migration converte clínicas ativas/suspensas com slug de código e guarda o antigo.
- `clinic_slug_history` guarda endereços anteriores (RLS por clínica, auditado). Ninguém mais
  pode usá-los; a própria clínica pode voltar a um deles.
- Reservados: rotas do produto, `demonstracao*`, `luminix-*`, formato de código (`ab-1234`)
  e o prefixo provisório `clinica-<uuid>`. Tamanho 3–40.
- `set_clinic_slug` limita 5 trocas por 30 dias. `check_clinic_slugs` e `suggest_clinic_slug`
  alimentam a verificação em tempo real no admin.
- `GET /public/clinics/:slug` devolve `{ redirectTo }` para endereço antigo ou código do espaço
  de clínica publicada; a web responde com redirect permanente. Clínica fora do ar não revela
  o endereço novo.
- A projeção pública passa a incluir `code` (código do espaço), antes deduzido do slug.

Isso substitui “O slug é estável” da ADR-021: o slug pode mudar, e links antigos continuam
funcionando enquanto a página estiver publicada.

### Editor do site

- `admin /c/<código>/vitrine` mostra a prévia em `web /c/previa` dentro de um iframe e um
  painel flutuante (cores, capa, informações, serviços, galeria).
- A prévia não busca dados: recebe a projeção por `postMessage` apenas de origens do admin
  (`lib/editor-origins.ts`), valida o formato e saneia URLs de imagem. A rota só pode ser
  emoldurada por essas origens (`frame-ancestors`).
- `read_clinic_preview` devolve a mesma projeção pública (`public_clinic_projection`), mas
  com endereço e contatos, para a gestora ligar/desligar antes de publicar. Nada é publicado
  até salvar.
- `public_showcase.hidden` aceita `hours`, `foundedYear`, `app` e `socials`. Horários e ano
  são removidos na projeção pública; app e redes são ocultados na renderização.
- `ClinicSiteView` é a renderização única da vitrine (rota pública no servidor e prévia no cliente).

## Consequências e riscos

- Ordem de deploy: migration 0024 → API → web → admin. A web antiga ainda calcula o código
  pelo slug: entre migration e deploy da web, o cartão do app pode ficar sem código.
- Links já compartilhados com `/c/<código>` continuam funcionando depois do deploy da API e da web.
- O editor depende de `NEXT_PUBLIC_WEB_URL` no admin (padrão `https://luminix.beauty`) e de
  `NEXT_PUBLIC_ADMIN_URL` na web; previews de Vercel com outro domínio não conseguem emoldurar.
- Rollback: código anterior funciona com a estrutura nova; slugs amigáveis permanecem.

## Validação

`tests/clinic-settings.test.ts` (PGlite com `luminix_api`): slug na ativação e unicidade,
reservados/inválidos, troca, redirecionamento por histórico e por código, bloqueio entre
clínicas, perfil (validação, logo de outra clínica, 403, rascunho), regras (serviço de outra
clínica, faixas), prévia restrita e campos ocultos.
