# ADR-021 — Páginas públicas das clínicas

- Data: 2026-11-03
- Estado: adotado e implementado

## Decisão

`apps/web/c/<slug>` consome uma projeção pública da API, usando o slug persistido da clínica.
Não interpreta slugs como identidades autenticadas e não inventa clínica a partir da URL.
`/c/demonstracao` continua sendo uma fixture explicitamente identificada.

Publicação é opt-in, após onboarding concluído, em Configurações da gestão. Endereço e contatos
possuem consentimentos de publicação separados. Os três campos começam falsos, inclusive em
clínicas existentes. Publicar não habilita agendamento, pagamento ou área privada do cliente.
O slug existente é estável nesta entrega; edição e redirecionamento de slugs ficam para evolução.

A migration 0020 acrescenta os indicadores a `clinic_profiles` e duas funções com `search_path`
fixo e EXECUTE revogado de PUBLIC. A escrita exige identidade verificada, contexto tenant e
`settings:manage`, com auditoria existente. A leitura SECURITY DEFINER oferece somente uma
projeção explícita de clínica ativa e publicada: nome, tema, ano, logo pronto da mesma clínica,
serviços ativos e horários semanais; endereço e contatos comerciais dependem das opções.
Não retorna identidade, CPF/CNPJ, e-mail da proprietária, clientes, equipe ou agenda.
A função isolada é necessária porque o papel de runtime não possui leitura global pelas RLS.

API `GET /public/clinics/:slug` não aceita contexto tenant do navegador; usa consulta parametrizada,
validação, limite de requisições e `no-store`. A web deduplica apenas dentro da requisição com
React cache e não mantém cache entre acessos, para respeitar retirada de publicação.
Erros de infraestrutura não viram demonstração. URLs externas são saneadas. Com endereço publicado, o link direto abre o Google Maps.
O minimapa incorpora o Google Maps somente quando a pessoa pede para carregá-lo.

## Experiência e limites

Seis temas do onboarding, logo/monograma, serviços por categoria, preços fixos/a partir de/sob
consulta, descrições, duração, horários, localização e contatos opcionais. Frases introdutórias
são escolhidas por categoria; editor de frases e imagens específicas ainda não implementado.
As páginas permanecem `noindex` durante a preparação. Horários são de funcionamento, não slots
livres. Nenhum botão simula reserva. A área privada segue pendente.

O limite de API é local por processo/IP; chamadas server-side da web compartilham IP de saída.
Antes de tráfego comercial, rever limite distribuído, observabilidade e cache com invalidação
explícita, preservando retirada de publicação e isolamento. Ver TD-006.

## Migration e recuperação

Mudança aditiva: três booleanos com default constante, sem apagar dados ou alterar valores de
negócio. ALTER TABLE exige lock exclusivo breve; o default constante evita reescrita completa
no PostgreSQL atual. Todas as linhas passam a ler false; nenhuma clínica é publicada.
Versão anterior continua compatível. Aplicar antes do backend e frontend.
Em falha de deploy, voltar código anterior e manter estrutura aditiva. Remover colunas/funções
exigiria nova migration depois de desativar consumidores; não há down destrutivo automático.

## Validação

Testes PGlite com todas as migrations e papel real `luminix_api`: publicação desligada por padrão,
401/403, separação de duas clínicas, projeção sem dados privados, opções de endereço/contatos,
retirada imediata, clínica suspensa/draft, privilégios SQL, slug inválido e 503 saneado.
Testes web cobrem saneamento de links e agrupamento/frases das categorias.
