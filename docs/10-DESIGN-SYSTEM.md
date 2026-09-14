# Design System do Luminix

Status: direção visual em definição. Este documento estabelece a arquitetura do sistema visual; não declara componentes implementados.

## Princípios

- Sofisticado e acolhedor, feminino sem infantilização.
- Pink como identidade, com poucas cores simultâneas.
- Hierarquia forte, baixo ruído e conteúdo operacional em primeiro plano.
- Mobile-first, acessível e confortável para uso prolongado.
- Animações comunicam estado ou relação espacial; não são decoração contínua.
- Componentes e semântica permanecem consistentes entre web e mobile.

## Modos visuais

O produto terá duas aparências sobre os mesmos componentes:

| ID técnico | Nome             | Objetivo                                                                       |
| ---------- | ---------------- | ------------------------------------------------------------------------------ |
| `glass`    | Glass Mode       | Identidade imersiva, translúcida e expressiva sobre background da marca        |
| `light`    | White/Light Mode | Superfícies claras, contraste estável e menor carga visual para uso prolongado |

`default` não deve ser o nome técnico de um modo. Ele representa qual tema o produto escolheu como padrão em determinado experimento ou versão. Isso permite trocar o padrão sem renomear tokens ou migrar preferências.

O modo ativo altera somente tokens e ativos visuais. Estrutura, conteúdo, permissões, comportamento e hierarquia de componentes não devem divergir entre os modos. Correções funcionais não podem ser duplicadas em duas árvores de UI.

Até haver teste com usuários, nenhum modo foi aprovado como padrão definitivo. Glass é o candidato inicial. A preferência pode ser armazenada por usuário e sincronizada opcionalmente, com fallback local antes da autenticação.

## Arquitetura de tokens

Os componentes usam tokens semânticos, nunca cores específicas do modo:

```text
theme
├── color
│   ├── background.canvas
│   ├── background.scrim
│   ├── surface.primary
│   ├── surface.secondary
│   ├── surface.raised
│   ├── surface.interactive
│   ├── border.subtle
│   ├── border.strong
│   ├── text.primary
│   ├── text.secondary
│   ├── text.muted
│   ├── action.primary
│   ├── action.primaryHover
│   ├── focus.ring
│   └── status.{success|warning|danger|info}
├── effect
│   ├── blur.{surface|overlay|navigation}
│   ├── saturation.surface
│   └── shadow.{surface|raised|focus}
├── radius.{sm|md|lg|xl|pill}
├── space.{...}
├── typography.{...}
└── motion.{duration|easing}
```

Tokens de marca, tokens semânticos e tokens de componente são camadas diferentes. Um componente pode usar `surface.primary`; ele não deve conhecer um valor RGBA ou o caminho de um background.

## Componentes compartilhados

Começar com componentes que tenham uso real: `Button`, `IconButton`, `Card`, `Input`, `Select`, `Checkbox`, `Modal`, `Sheet`, `Avatar`, `Badge`, `Tabs`, `NavigationItem`, `ListRow` e `BottomNavigation`. Variantes representam função (`primary`, `secondary`, `danger`, `quiet`) e densidade, sem criar componentes `GlassCard` e `WhiteCard` paralelos.

Estados obrigatórios: default, hover quando aplicável, pressed, focus-visible, selected, disabled, loading, error e success. Toda informação transmitida por cor precisa de texto, ícone ou outra pista.

## Backgrounds oficiais

- Desktop: [`assets/brand/backgrounds/desktop.png`](../assets/brand/backgrounds/desktop.png), 1672 × 941.
- Retrato/mobile: [`assets/brand/backgrounds/portrait.png`](../assets/brand/backgrounds/portrait.png), 941 × 1672.

No Glass Mode, o background cobre o viewport, permanece estável durante a navegação principal e recebe scrim quando necessário para preservar contraste. Evitar reposicionamento que coloque áreas muito claras atrás de texto. Em telas extensas, o conteúdo rola sobre uma camada fixa ou controlada; não repetir a imagem como mosaico.

No Light Mode, o background de marca pode aparecer em áreas de entrada, onboarding ou destaque. Telas operacionais usam canvas claro e superfícies opacas.

## Alternância e experimento

Durante o desenvolvimento, disponibilizar seletor de tema apenas em modo de desenvolvimento ou feature flag interna. O seletor troca a mesma rota e o mesmo estado de dados imediatamente, permitindo comparação real.

Registrar nos testes: legibilidade, fadiga percebida, velocidade para localizar ações, preferência declarada e problemas por dispositivo. Avaliar listas longas, formulários, agenda densa, tabelas, erros, teclado aberto e uso sob iluminação forte.

## Acessibilidade e fallback

- Validar contraste sobre os backgrounds reais em ambos os modos; transparência nominal não garante contraste.
- Respeitar `prefers-reduced-motion` e preferência equivalente no mobile.
- Quando o sistema solicitar redução de transparência, blur não for suportado ou o desempenho cair, aumentar opacidade da superfície e remover blur sem alterar layout.
- Foco por teclado deve ser claramente visível no web.
- Alvos de toque devem respeitar no mínimo 44 × 44 pontos lógicos.
- Texto operacional não deve ser colocado diretamente sobre o background.

## Referências e implementação

A especificação detalhada está em [14-GLASS-MODE.md](14-GLASS-MODE.md). Screenshots ficam em [`assets/references/design/glass-mode/`](../assets/references/design/glass-mode/README.md).

Não adicionar biblioteca visual ou de blur sem justificar compatibilidade web/mobile, peso, desempenho e manutenção. Quando o código existir, tokens deverão morar em package próprio apenas se houver consumidores reais entre aplicações.
