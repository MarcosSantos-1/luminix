# ADR-024 — Acervo de mídia privado (Mídia)

- Data: 2026-11-08
- Estado: implementado; envio de fotos depende do bucket privado com acesso do token da API

## Contexto

O Luminix quer ser o lugar onde o espaço guarda as próprias fotos: clientes, antes e depois,
marketing, ambiente e equipe — base para álbuns por cliente, acompanhamento de resultados,
campanhas e IA. Até aqui, toda imagem ia para um único bucket R2 com acesso público (vitrine).
Fotos de clientes são dados pessoais sensíveis (LGPD) e não podem ser acessíveis por link público.

## Decisão

- **Bucket separado e privado** (`R2_PRIVATE_BUCKET`, ex.: `luminix-private`), sem r2.dev nem
  domínio público. Leitura apenas por **URL assinada** (S3 presigned, 15 minutos), gerada pela
  API depois de autorizar `media:read`. Sem bucket privado configurado, o envio é recusado (503):
  não existe fallback para o bucket público.
- Credenciais: por padrão o mesmo token R2 da API, que precisa de Object Read & Write também no
  bucket privado; opcionalmente `R2_PRIVATE_ACCESS_KEY_ID`/`R2_PRIVATE_SECRET_ACCESS_KEY`.
- Arquivos: `media_assets.kind = 'library_photo'`, WebP gerado no navegador (480 px miniatura,
  1600 px foto; o re-encode descarta EXIF, incluindo GPS). Chave
  `<clinic>/library/<asset>/{small-480,large-1600}.webp`.
- Organização: `media_folders` (cinco pastas do sistema — Clientes, Antes e depois, Marketing,
  Espaço, Equipe — e pastas próprias) e `media_items` (pasta, título, `client_id` já previsto
  para álbuns por cliente, lixeira restaurável). RLS por clínica e auditoria.
- Permissões novas: `media:read` (todos os níveis) e `media:manage` (proprietária, gerente,
  profissional). Recepção só visualiza.
- Uso de espaço: soma de bytes de `media_assets` (acervo e demais imagens) exibida na página.
- Admin: seção **Mídia** no menu (`components/manager/media`), com pastas, envio múltiplo e
  arrastar-e-soltar, visualização ampliada, renomear, mover, lixeira e uso de espaço.

## Configuração na Cloudflare

1. R2 → Create bucket `luminix-private`. **Não** ativar Public Development URL nem domínio.
2. R2 → Manage API tokens → editar o token da API e incluir `luminix-private` com
   Object Read & Write (ou criar token próprio e usar as variáveis `R2_PRIVATE_*`).
3. API: `R2_PRIVATE_BUCKET=luminix-private` em `apps/api/.env` e em `fly.toml` (não é segredo).

## Fora do escopo / próximos passos (TD-011)

Exclusão definitiva e esvaziamento da lixeira (job que apaga do R2), cotas por plano, álbum por
cliente na ficha, antes/depois pareado, uso no site/marketing (cópia explícita para o bucket
público), vídeos, upload direto ao R2 por URL assinada, busca e consentimento de imagem da
cliente registrado junto da foto.

## Validação

`tests/media-library.test.ts`: pastas padrão, estado do armazenamento, recepção só lê, isolamento
entre clínicas, pasta duplicada 409, pasta do sistema não renomeia, URLs só assinadas do bucket
privado (nunca públicas), lixeira e uso de espaço, ativo de outra clínica recusado, envio sem
pasta válida 400 e recepção sem envio 403.
