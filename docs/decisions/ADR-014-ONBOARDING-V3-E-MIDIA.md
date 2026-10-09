# ADR-014 — Onboarding v3 e mídia da clínica

Status: Accepted

Data: 2026-10-09

## Contexto

O formato v2 relacionava profissionais, serviços e horários por nomes editáveis. Alguns campos
coletados não eram materializados, e logo/foto existiam somente como prévia local. O bucket R2 já
estava provisionado, mas sem contrato de upload ou metadados no PostgreSQL.

## Decisão

O onboarding passa a `format_version = 3`. Serviços e profissionais recebem UUID ainda no draft;
esses UUIDs são preservados como chaves das entidades definitivas. Vínculos profissional-serviço,
público por serviço e horários individuais usam esses identificadores. Rascunhos v2 são convertidos
pela migration 0012 e continuam retomáveis.

CPF e CNPJ são opcionais, mas, quando informados, têm tipo e dígitos verificadores validados no
frontend, API e conclusão transacional. Não há unicidade do documento. Número, bairro e observação
do endereço, público padrão e sensibilidade do serviço passam a ser materializados.

Logo e foto de profissional usam `media_assets`, sempre com `clinic_id`, RLS, auditoria e chave R2
iniciada por clínica. O navegador aceita somente PNG/JPEG/WebP de até 8 MB, remove metadados ao
redesenhar e produz variantes WebP quadradas de 128 e 512 pixels. A API recebe no máximo 2,5 MB por
variante, revalida assinatura/dimensões WebP, envia ao bucket e só então marca o asset como pronto.
Originais não são mantidos. As chaves são versionadas por UUID e recebem
`Cache-Control: public, max-age=31536000, immutable`; substituição troca o ponteiro, sem sobrescrever
o objeto anterior.

O upload passa pela API nesta fase. Isso evita depender de CORS ainda não verificável com o token
R2 atual e mantém a autorização simples para o baixo volume de logos/fotos. Upload direto assinado
deve ser reavaliado apenas quando volume ou custo de tráfego justificar.

A consulta de CEP é autenticada e mediada pela API, usando ViaCEP somente para preenchimento. Falha
do provedor não bloqueia edição manual nem é tratada como validação definitiva do endereço.

## Consequências

- Renomear profissional ou serviço durante o onboarding não rompe vínculos.
- A conclusão rejeita referências desconhecidas e horário profissional fora do funcionamento da
  clínica, sem antecipar regras dinâmicas de agenda ou pagamentos.
- Depois da conclusão, configurações leem tabelas operacionais; o draft permanece apenas para
  retomada/auditoria.
- A URL `r2.dev` permite entrega e cache imutável no navegador, mas cache de borda do R2 exige domínio
  Cloudflare próprio. O cutover de DNS continua manual conforme a documentação de domínios.
- Limpeza automática de assets abandonados/superseded e reprocessamento integral no servidor ficam
  registrados como dívida antes de dados reais.

## Registro operacional

Em 2026-10-09, a migration 0012 foi aplicada e verificada no banco principal autorizado. A API com
o contrato v3 foi publicada no Fly.io e respondeu `200` em `/health` após o deploy.
