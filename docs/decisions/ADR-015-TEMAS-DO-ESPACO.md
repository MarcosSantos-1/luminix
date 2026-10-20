# ADR-015 — Temas do espaço

Status: Accepted

Data: 2026-10-20

## Decisão

O admin oferece as paletas `rosa` (aparência atual/padrão), `grafite`, `violeta`, `dourado`,
`esmeralda` e `azul`. São paletas do espaço, independentes dos modos de superfície Glass/Light.
A etapa Clínica permite prévia imediata; Continuar salva a escolha junto ao draft. Configurações
permite alterá-la depois, com `settings:manage`. A preferência pertence à clínica, não ao navegador.

A migration 0015 adiciona `clinic_settings.theme`, com default e CHECK. O salvamento autorizado
e versionado do onboarding sincroniza a preferência por trigger; clientes antigos que omitem o
campo preservam a seleção. Alterar o tema em Configurações atualiza também o draft aberto e sua
versão para evitar sobrescrita silenciosa por outra aba. As mudanças continuam auditadas pelos
triggers existentes. O contexto autenticado fornece o tema sem expor o draft à equipe.

## Consequências e validação

Tokens CSS alteram fundo, ações, foco, superfícies e destaques na mesma árvore de componentes.
Portais de modal recebem a mesma paleta. A seleção e os tokens são removidos ao sair do espaço;
não se usa armazenamento global persistente entre clínicas. Cores de estado mantêm seu significado.
Os cinco PNGs fornecidos são preservados; o admin entrega derivados WebP. Como só há imagens
horizontais novas, mobile usa recorte central com cover até existirem versões verticais próprias.

O rosa permanece com os valores anteriores como fallback. O escopo desta entrega é onboarding
e painel admin; não altera os shells Expo nem o portal público. Contraste e enquadramento devem
ser avaliados em dispositivos reais, especialmente telas estreitas e redução de transparência.

Rollback: publicar versão anterior da aplicação mantém compatibilidade com a coluna adicional;
se necessário remover o recurso, fazê-lo em migration corretiva, removendo primeiro trigger e
funções e depois a coluna. Não editar migrations já aplicadas.

## Registro operacional

Migration 0015 aplicada em 2026-10-20 no endpoint principal autorizado
`ep-bitter-fog-acchavo1.sa-east-1.aws.neon.tech/neondb`. TypeScript e builds do workspace passaram;
87 testes da API passaram com um worker para evitar timeouts de inicialização PGlite. O check
agregado continua bloqueado pela dívida estática preexistente TD-007.

Publicação pendente: o CLI em `~/.fly/bin/flyctl` não possui sessão/token nesta máquina. Publicar
primeiro a API e verificar `/health`; depois efetuar push em master para publicar o admin com o
contrato compatível. A migration aditiva é compatível com a API anterior.
