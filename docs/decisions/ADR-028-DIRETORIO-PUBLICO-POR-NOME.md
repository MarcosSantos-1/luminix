# ADR-028 — Diretório público de espaços por nome

Status: Accepted (implementada: migration 0033 aplicada no Neon principal, API publicada no Fly e
web em produção em 2026-11-15)

Data: 2026-11-15

## Contexto

A área do cliente (web `/cliente/espacos` e app Expo) encontrava o espaço só por código ou pelo
nome completo convertido em endereço (`slugFromQuery`). Nome parcial não funcionava e clínica com
endereço personalizado só aparecia pelo código. Além disso, o código de uma clínica com endereço
amigável respondia `redirectTo` e a busca o descartava. O roadmap de `docs/16` condicionava a busca
por nome a uma decisão de produto e a um endpoint com limite de requisições.

## Decisão

- **Passa a existir um diretório público por nome**, restrito a clínicas **publicadas e ativas**
  (`public_enabled` e `status = 'active'`), as mesmas que já têm página em `/c/<slug>`.
- `luminix.search_public_clinics(text)` (migration 0033, `SECURITY DEFINER`, `EXECUTE` só para
  `luminix_api`) devolve até **8** endereços cujo **nome público** (título da vitrine, senão o nome
  da clínica) contém o termo, sem acentos e em minúsculas, com mínimo de **3** caracteres úteis.
  Nomes que começam pelo termo vêm primeiro. O código completo do espaço (`AA-0000`) também
  encontra a própria clínica; fragmentos de código não.
- A normalização é `luminix.fold_search_text`, com o mesmo mapa de acentos de `luminix.slugify`
  (sem depender de `unaccent`). O termo normalizado só tem `[a-z0-9 ]`, logo não carrega curingas.
- `GET /public/clinic-search?q=` valida `q` (3–120 caracteres, sem outros parâmetros), responde
  `no-store` e tem orçamento próprio de **60 requisições/minuto por IP**, metade do da página.
  Cada item traz somente `slug`, `code`, `name`, `theme`, `logoUrl`, `city`, `state`, `address`,
  `district` e `category`, derivados da projeção da vitrine (`read_public_clinic`): endereço só
  aparece se a clínica optou por publicá-lo; serviços, contatos e horários não são devolvidos.
- O web (`GET /api/espacos?q=`) consulta, em paralelo, o endereço/código exato e a busca por nome,
  e depois as demonstrações. A resposta da busca fica em cache pelo minuto corrente por termo
  normalizado, a mesma janela da página pública.

## Alternativas consideradas

- Manter só código/endereço exato: não atende quem lembra parte do nome.
- `unaccent` + `pg_trgm` com índice: melhor em escala, mas exige extensões não assumidas no Neon e
  não se justifica com o volume atual.
- Devolver a projeção inteira por resultado: expõe mais do que o seletor precisa e facilita raspagem.
- Buscar também pelo nome interno quando há título de vitrine: revelaria um nome que a clínica
  escolheu não mostrar.

## Consequências

- Positivas: nome parcial, acentos e endereço personalizado deixam de impedir a descoberta; o
  código volta a funcionar na busca; nada além do que a vitrine já publica é exposto.
- Negativas e riscos: a lista de clínicas publicadas torna-se enumerável por nome (era por
  endereço). O limite por IP é em memória, por processo, e a API não usa `trustProxy`; atrás do
  proxy do Fly e do servidor da Vercel os visitantes compartilham orçamento (ver TD-006). A busca
  faz varredura sequencial das clínicas publicadas; rever com índice de trigramas antes de volume
  comercial. Busca por localização/categoria continua fora do escopo.
- Rollback: migration corretiva removendo as duas funções; a rota passa a responder 503 e o web
  volta a resolver só por endereço exato e demonstrações, sem erro para a cliente.
