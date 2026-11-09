# ADR-021 — Páginas públicas das clínicas

- Data: 2026-11-03
- Estado: adotado e implementado

## Decisão

`apps/web/c/<slug>` consome uma projeção pública da API, usando o slug persistido da clínica.
Não interpreta slugs como identidades autenticadas e não inventa clínica a partir da URL.
`/c/demonstracao` continua sendo uma fixture explicitamente identificada.

A publicação exige ação da gestora em Configurações ou na revisão do onboarding. A revisão
oferece “Concluir e publicar vitrine” e permite concluir em privado. Endereço e contatos comerciais
têm opções independentes, desmarcadas por padrão. O banco mantém os três indicadores falsos até
a confirmação. A conclusão e a publicação ocorrem na mesma transação, com `settings:manage`
para publicar. Uma repetição da conclusão devolve o estado atual e preserva decisões posteriores.
Edição de slug: ver ADR-022 (endereços amigáveis com redirecionamento). Agendamento, pagamento
e área privada seguem em frentes próprias.

A migration 0020 acrescenta os indicadores a `clinic_profiles` e duas funções com `search_path`
fixo e EXECUTE revogado de PUBLIC. A escrita exige identidade verificada, contexto tenant e
`settings:manage`, com auditoria existente. A leitura SECURITY DEFINER oferece somente uma
projeção explícita de clínica ativa e publicada: nome, tema, ano, logo pronto da mesma clínica,
serviços ativos e horários semanais; endereço e contatos comerciais dependem das opções.
Não retorna identidade, CPF/CNPJ, e-mail da proprietária, clientes, equipe ou agenda.
A função isolada é necessária porque o papel de runtime não possui leitura global pelas RLS.

API `GET /public/clinics/:slug` não aceita contexto tenant do navegador; usa consulta parametrizada,
validação, limite de requisições e `no-store`. A web reaproveita somente a projeção pública
validada, por slug e por minuto, entre a vitrine, a galeria e o catálogo. Respostas 404 e falhas
da API ficam fora do cache. A renderização consulta o cache server-side a cada acesso.
Depois do commit de uma alteração de vitrine, tema, publicação ou onboarding, a API notifica
a web para expirar apenas o slug afetado. A janela de até um minuto limita conteúdo desatualizado
quando a notificação falha ou há alteração direta no banco. A web volta à API ao entrar na
próxima janela, inclusive durante falhas de infraestrutura, sem recorrer à projeção antiga.
Ao criar novos editores de dados públicos, ligar a invalidação após commit.

URLs externas são saneadas. Com endereço publicado, o minimapa do Google Maps carrega quando
se aproxima da área visível. O link direto também está disponível. Na demonstração, o minimapa
continua sob demanda.

## Experiência e limites

Seis temas do onboarding, logo/monograma, serviços por categoria, preços fixos/a partir de/sob
consulta, descrições, duração, horários, localização e contatos opcionais. Frases introdutórias
são escolhidas por categoria; editor de frases e imagens específicas ainda não implementado.
As páginas permanecem `noindex` durante a preparação. Horários são de funcionamento, não slots
livres. Nenhum botão simula reserva. A área privada segue pendente.

O limite de API é local por processo/IP; chamadas server-side da web compartilham IP de saída.
Antes de tráfego comercial, medir o cache e rever limite distribuído e observabilidade. Ver TD-006.

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

## Vitrine e galeria

A página inicial destaca até quatro serviços. A ordem escolhida pela gestora tem prioridade e
as vagas restantes favorecem categorias ainda não representadas. O catálogo completo fica em
`/c/<slug>/servicos`. A Galeria é opcional e reúne até 24 fotos, preservando suas proporções.
O editor em Página pública do espaço salva subtítulo, estilo, destaques e referências às fotos.
O estilo de salão feminino é a primeira variação editorial e é independente das seis paletas
salvas no onboarding. Demais segmentos podem ganhar composições próprias futuramente.

A migration 0021 amplia a projeção pública e reutiliza o upload WebP no R2 para fotos destinadas
à publicação. A escrita valida serviços ativos e fotos prontas do mesmo estabelecimento. Remover
uma foto da vitrine ou despublicar a página remove a referência pública, mas não invalida URLs
de mídia já conhecidas nem elimina objetos do R2. A interface orienta o envio de fotos autorizadas.

A conclusão do onboarding abre o painel com um modal de boas-vindas. O modal oferece acesso ao
link publicado, cópia do endereço e um atalho para personalizar a página. Título público, subtítulo, composição, ilustração e tema podem ser
alterados em Página pública do espaço. Nome interno e tema da gestão são independentes.

### Sugestão inicial da capa

A migration 0023 calcula a sugestão a partir dos serviços ativos na ativação e grava o resultado
em `clinic_profiles.initial_public_hero`. O preenchimento inicial de clínicas ativas e suspensas
preserva os indicadores de publicação e o estilo legado. Mudanças no catálogo atualizam os
serviços exibidos e preservam a capa inicial. O editor pode substituir a ilustração ou voltar
à sugestão salva.

- A família com mais serviços ganha. Em empate, a ordem é cabelo, estética, depilação, olhar,
  terapias manuais, tatuagem/piercing e unhas. Categorias desconhecidas mantêm a capa com monograma.
- Cabelo usa a ilustração de salão feminino para atendimento feminino ou misto. Barbearia exige
  público masculino no cadastro e serviços de cabelo exclusivamente masculinos.
- Estética reúne facial, corporal e avançada, além de depilação e terapias quando coexistem.
  Se essa família ganha, avançada tem prioridade. Corporal isolada mantém sua própria capa.
  Os demais casos usam estética facial.
- Sem um núcleo estético, depilação junto de cílios ou sobrancelhas fica na família de depilação.
  Cílios/sobrancelhas e massoterapia/quiropraxia compartilham suas respectivas ilustrações.
- Tatuagem e piercing formam uma família. Ganha a especialidade com mais serviços e, em empate,
  a capa é de tatuagem.

A alteração de schema é aditiva e recalcula somente a sugestão de perfis já ativados. A migration
deve preceder o deploy da API. Um rollback de código pode manter a coluna e as funções novas.
O cálculo usa dados da mesma clínica e as funções auxiliares têm execução pública revogada.

A migration 0022 permite vincular uma foto opcional a qualquer serviço ativo, inclusive fora dos
destaques. A projeção preserva fotos legadas e a escrita verifica que o serviço e a mídia pronta
pertencem ao espaço. Sem foto própria, a vitrine e o catálogo exibem a ilustração da categoria.
