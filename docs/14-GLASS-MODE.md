# Glass Mode — especificação visual

Status: baseline extraído das referências em 2026-09-14. Valores são pontos iniciais para protótipo e calibração visual, não medição exata das imagens nem implementação existente.

## Assinatura visual

O Glass Mode combina um background geométrico magenta profundo com superfícies rosadas translúcidas. A interface não tenta simular vidro transparente real: usa translucidez controlada para preservar leitura. O efeito nasce de cinco elementos usados juntos:

1. background de marca com áreas claras e escuras;
2. scrim global que controla contraste;
3. superfícies semi-opacas, com blur e leve saturação;
4. borda clara fina e sombra magenta/preta suave;
5. tipografia clara com hierarquia por opacidade, sem excesso de cores.

Se blur for removido, a interface ainda deve parecer correta. A identidade não pode depender apenas de `backdrop-filter`.

## Paleta inicial

Os valores abaixo devem ser validados em protótipo sobre os dois backgrounds:

| Token            | Valor inicial | Uso                               |
| ---------------- | ------------- | --------------------------------- |
| `brand.950`      | `#3B071F`     | Base mais profunda e sombras      |
| `brand.900`      | `#590B2D`     | Scrim e áreas escuras             |
| `brand.700`      | `#A31350`     | Apoio de superfícies e gradientes |
| `brand.500`      | `#E72875`     | Ação, seleção e destaques         |
| `brand.400`      | `#FF4A91`     | Hover, ênfase e gráficos          |
| `brand.300`      | `#FF8DB7`     | Extremidade clara de gradiente    |
| `neutral.white`  | `#FFFFFF`     | Texto e ícones principais         |
| `status.success` | `#71E58C`     | Confirmado/sucesso                |
| `status.warning` | `#FFC247`     | Pendente/atenção                  |
| `status.danger`  | `#FF6B7A`     | Erro/cancelamento                 |
| `status.info`    | `#B48CFF`     | Informação auxiliar               |

Pink comunica marca e ações, sem substituir cores semânticas. Status precisa de rótulo ou ícone. Verde sobre superfície rosada deve ser testado com contraste; badges podem precisar de fundo mais escuro e opaco.

## Superfícies

### Receita-base sugerida

```css
--glass-surface: rgba(255, 255, 255, 0.1);
--glass-surface-strong: rgba(255, 255, 255, 0.16);
--glass-surface-raised: rgba(112, 12, 55, 0.56);
--glass-border: rgba(255, 255, 255, 0.22);
--glass-border-strong: rgba(255, 255, 255, 0.34);
--glass-shadow: 0 16px 40px rgba(44, 0, 20, 0.24);
--glass-blur: 20px;
--glass-saturation: 125%;
```

| Camada                     | Opacidade                            | Blur     | Borda         | Raio     |
| -------------------------- | ------------------------------------ | -------- | ------------- | -------- |
| Navegação lateral/inferior | 12–18% branco ou 45–58% brand escuro | 20–28 px | 18–26% branco | 20–28 px |
| Card principal             | 10–16% branco                        | 18–24 px | 20–30% branco | 20–24 px |
| Card secundário/linha      | 7–12% branco                         | 12–18 px | 14–22% branco | 14–18 px |
| Controle/ícone             | 10–16% branco                        | 10–16 px | 15–25% branco | 10–14 px |
| Modal/sheet                | 65–82% brand escuro                  | 24–32 px | 26–36% branco | 24–28 px |

Usar no máximo três forças de superfície em uma tela. Empilhar muitos vidros aumenta ruído e reduz contraste; uma lista dentro de card deve preferir divisores sutis a um card completo por linha.

## Texto, ícones e densidade

- Texto primário: branco entre 94–100%.
- Texto secundário: branco entre 70–82%.
- Texto auxiliar: branco entre 55–68%, apenas quando passar contraste no fundo resultante.
- Ícones seguem a cor do texto ou do estado; traço consistente e simples.
- Títulos usam peso 650–700; conteúdo 450–550; labels e botões 550–650.
- Desktop operacional tende a densidade compacta. Mobile mantém respiro maior e alvos de toque.

A fonte não foi decidida pelos screenshots. Não inferir uma família específica somente pela aparência.

## Componentes observados

### Botão primário

Gradiente horizontal `brand.500 → brand.300`, texto branco, raio de 12–14 px e altura aproximada de 48–56 px. Sombra curta com glow discreto. O gradiente pertence ao token de ação; não deve aparecer em todo card.

### Inputs

Superfície translúcida um pouco mais clara que o container, borda fina, ícone à esquerda e texto claro. Labels ficam fora do campo. Focus aumenta borda e aplica ring visível. Placeholder deve ser menos contrastante que conteúdo sem se tornar ilegível.

### Cards operacionais

Raio amplo, borda única, pouco brilho interno e hierarquia por espaçamento. Cabeçalhos e ações ficam alinhados. Em listas densas, usar uma superfície e divisores. Cards de ação podem receber gradiente sutil; cards de leitura permanecem mais neutros.

### Navegação

Desktop usa sidebar fixa; mobile usa bottom navigation flutuante. Item selecionado ganha superfície/gradiente e ícone mais luminoso. O botão central pode ser elevado, mas deve representar uma ação principal constante e previsível.

### Badges e estados

Badges pequenos têm fundo semântico escurecido ou dessaturado, texto legível e raio de 6–9 px. Estados de agenda precisam do mesmo vocabulário em ambos os temas.

### Onboarding

Container central estreito sobre o background, progressão clara, uma ação principal por etapa e controles secundários discretos. Em mobile real, o vidro deve ocupar o viewport com margens seguras; evitar simular uma moldura de dispositivo dentro do app.

## Composição responsiva

### Desktop

- Sidebar: aproximadamente 224–264 px.
- Área principal com grid responsivo, gaps de 16–24 px.
- Busca e ações globais no topo.
- Conteúdo importante ocupa a coluna mais larga; atividade e avisos podem usar coluna lateral.
- Limitar largura de linhas e painéis para não transformar o background em protagonista.

### Mobile

- Margem lateral: 16–20 px.
- Gap vertical: 12–20 px.
- Bottom navigation respeita safe area.
- Listas usam uma superfície contínua; ações rápidas podem formar grid de três colunas.
- Conteúdo nunca fica escondido pela navegação flutuante.

Breakpoints e medidas finais pertencem aos tokens de layout quando as aplicações forem iniciadas.

## Movimento

- Hover/press: 120–180 ms.
- Troca de painel/modal: 180–260 ms.
- Usar easing suave; evitar pulsação e glow contínuos.
- Pressed reduz levemente luminosidade ou escala, sem deslocar layout.
- Troca de tema pode usar transição curta de cores; blur e background não devem animar de modo pesado.

## Performance e conforto

Blur em muitas regiões custa renderização, sobretudo em mobile. Preferir um blur por container grande em vez de aplicar blur em cada linha. Em React Native, validar a implementação disponível por plataforma; não presumir equivalência pixel a pixel com CSS.

Fallback obrigatório: superfície mais opaca sem blur. Ativar por preferência de redução de transparência, suporte limitado ou perfil de desempenho definido. O Light Mode continua sendo alternativa real de uso, não fallback incompleto.

## Critérios de aceite do protótipo

- Mesma tela e dados alternam entre `glass` e `light` sem remount desnecessário ou mudança de layout.
- Texto, inputs, badges, foco e estados passam validação de contraste sobre trechos claros e escuros dos backgrounds.
- Agenda com pelo menos 30 itens continua legível e fluida.
- Formulário longo continua confortável com teclado mobile aberto.
- Sem blur, toda hierarquia permanece compreensível.
- Navegação, modal, loading, vazio, erro, disabled e seleção estão representados nos dois modos.
- Testar em monitor claro/escuro e celular sob iluminação forte.

## Limites da referência

Os screenshots definem linguagem visual e composição. Eles não definem fonte, valores exatos, comportamento, acessibilidade, permissões ou requisitos de produto. Métricas, estoque, marketing e outros elementos visíveis não entram no escopo funcional por aparecerem na imagem.

## Bancada implementada — 2026-09-22

A Home demonstrativa em `/dashboard` usa HeroUI e os backgrounds oficiais desktop/portrait.
Sidebar, cabeçalho, busca Ctrl/⌘ K, painéis e navegação móvel estão implementados como rascunho.
A redução de transparência do sistema aplica superfícies opacas; a bancada oferece opt-in explícito
para testar o vidro. Alternância completa Light/Glass e validações formais da lista de aceite acima
continuam planejadas. Contratos, localização do código e política HeroUI estão no Design System.
