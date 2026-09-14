# Núcleo comercial mobile — desenho aprovado

Data: 11 de julho de 2026

## Objetivo

Concluir o núcleo comercial do aplicativo Expo/React Native da Charme & Bela, substituindo dados mockados por dados reais do backend e tornando o app mobile o principal canal de atendimento ao cliente. O web e o backend serão usados apenas como referência de regras e contratos e não serão alterados neste ciclo.

O visual já aprovado das telas Início e Serviços deve ser preservado. As mudanças nessas telas se concentram na origem dos dados, estados de carregamento/erro/vazio, navegação e ações dos botões.

## Escopo

Este ciclo inclui:

- Início alimentado pelo backend: resumo do plano, categorias, próximos agendamentos e atalhos funcionais.
- Serviços alimentados pelo backend, com filtros, busca, detalhes e início de agendamento.
- Fluxo de agendamento mobile em etapas: serviço, data, horário, revisão e resultado.
- Agendamentos por assinatura, voucher e pagamento avulso.
- Agenda real com calendário, próximos agendamentos, histórico, detalhes, reagendamento e cancelamento.
- Checkout Stripe hospedado no navegador para assinatura e pagamentos avulsos.
- Meu Plano com gerenciamento completo: catálogo, assinatura, consumo, troca, cancelamento, reativação, forma de pagamento, histórico e portal Stripe.
- Persistência leve do estado de sessão e do contexto temporário necessário para retomar fluxos.
- Integração mínima da anamnese atual com o backend, apenas para desbloquear o primeiro agendamento e retornar ao fluxo original.

## Fora do escopo

- Redesenho definitivo de Perfil.
- Redesenho definitivo da anamnese. O ciclo futuro usará uma pergunta por tela, sem rolagem, perguntas simples e barra de progresso.
- Redesenho e integração definitiva de notificações.
- Mudanças no frontend web, backend, banco de dados ou regras comerciais.
- Uma estratégia avançada de cache, sincronização offline ou otimização de performance.
- Uma auditoria de segurança completa. Problemas relevantes observados serão registrados como recomendações, sem ampliar automaticamente o escopo.

## Princípios

1. O backend é a fonte de verdade para preços, serviços, horários, conflitos, limites, vouchers, pagamentos e status.
2. O app não conclui pagamento com base no retorno visual do navegador; a confirmação depende do estado persistido pelo webhook no backend.
3. Ações financeiras e comerciais nunca dependem apenas de AsyncStorage.
4. Início e Serviços mantêm o desenho existente.
5. Novos componentes devem funcionar em iOS e Android e evitar dependências nativas desnecessárias.
6. As alterações ficam restritas ao repositório mobile.

## Arquitetura

O código será organizado por domínio comercial:

- `services`: tipos, catálogo, categorias e detalhes.
- `appointments`: disponibilidade, criação, listagem, reagendamento e cancelamento.
- `subscriptions`: planos, assinatura atual, uso, troca, cancelamento e reativação.
- `checkout`: criação da sessão, abertura do navegador e reconciliação ao retornar.
- `anamnesis`: leitura e gravação mínima necessárias para o primeiro agendamento.

Cada domínio terá contratos tipados, funções de API e hooks simples que expõem `data`, `loading`, `error`, `refresh` e ações. Não será adicionada uma biblioteca de cache neste ciclo. As telas poderão compartilhar atualizações por um provedor comercial leve ou por callbacks de navegação e recarga, evitando duplicar regras de transformação.

A navegação autenticada manterá as quatro abas existentes. Um stack de cliente envolverá as abas e abrirá telas de detalhe, agendamento, resultado de checkout e Meu Plano sem adicionar itens à barra inferior.

## Telas e componentes

### Início

- Preserva layout, cores, espaçamentos, cards e botões atuais.
- Exibe usuário autenticado, assinatura real, uso mensal e próximos agendamentos.
- Categorias são calculadas a partir dos serviços ativos do backend.
- `ver todos`, `Novo Agendamento`, categorias e `Meu Plano` navegam para destinos reais.
- Possui estados de carregamento, erro com nova tentativa e vazio sem alterar a hierarquia visual principal.

### Serviços

- Preserva o catálogo mobile atual.
- Remove `MOCK_CATEGORIES` e `MOCK_SERVICES`.
- Mapeia enums do backend para rótulos, ícones e cores mobile.
- Filtro e busca operam sobre dados reais.
- O botão `Agendar` abre o fluxo mobile com o serviço selecionado.

### Fluxo de agendamento

O fluxo será uma sequência mobile dedicada:

1. Detalhes do serviço e benefício aplicável.
2. Calendário dentro da janela permitida.
3. Horários disponíveis e ocupados retornados pelo backend.
4. Revisão com origem do agendamento, preço final e voucher/plano.
5. Processamento e resultado.

Assinatura e voucher gratuito concluem no app. Pagamento avulso e voucher com saldo abrem o Stripe no navegador. Toques repetidos ficam bloqueados durante mutações.

Se o backend exigir anamnese no primeiro agendamento, o app abre a integração provisória, mantém o serviço escolhido e retorna ao mesmo fluxo após salvar.

### Agenda

- Marca no calendário as datas que possuem agendamentos reais.
- Separa próximos e histórico a partir de data e status.
- Mostra serviço, horário, origem/pagamento e status com rótulos consistentes.
- O detalhe oferece reagendamento e cancelamento quando permitidos.
- Reagendamento reutiliza calendário e horários do fluxo principal.
- Cancelamento exige confirmação e apresenta a regra de antecedência informada pelo backend.
- Após qualquer mutação, Agenda e Início são atualizados.

### Meu Plano

Trata explicitamente os estados sem plano, ativo, pausado, cancelado e com problema de pagamento. A tela inclui:

- dados e benefícios reais do plano;
- consumo e saldo mensal;
- catálogo e comparação de planos;
- assinatura pelo Stripe;
- troca de plano;
- cancelamento com confirmação;
- reativação;
- forma de pagamento e histórico consultados pelos endpoints Stripe existentes; para clientes ainda sem cadastro no Stripe, a tela exibe o estado vazio e direciona para a primeira assinatura ou compra;
- abertura do portal do cliente Stripe.

Ao retornar do navegador, assinatura e pagamentos são reconciliados com o backend antes de mostrar sucesso definitivo.

## Checkout e retorno ao app

O backend atual cria sessões Stripe com URLs de sucesso e cancelamento voltadas ao web. Como backend e web não podem ser alterados neste ciclo, o mobile seguirá esta estratégia:

1. Criar a sessão pelo endpoint existente.
2. Abrir a URL em navegador externo compatível com Expo.
3. Manter no app apenas o contexto não sensível da operação pendente.
4. Quando o app voltar ao estado ativo, consultar assinatura ou agendamento no backend.
5. Mostrar estado de confirmação enquanto o webhook ainda estiver processando.
6. Permitir tentativa manual de atualização e saída segura do fluxo.

Essa limitação será registrada nas recomendações finais. Uma evolução futura poderá adicionar URLs de retorno mobile/deep links no backend.

O Stripe é usado para serviços físicos prestados fora do app. Isso se enquadra na regra 3.1.3(e) da Apple, que exige métodos diferentes de In-App Purchase para bens e serviços consumidos fora do aplicativo.

## Dados e persistência

- Firebase continua responsável pela identidade e pelo token de autenticação.
- SecureStore/integrações existentes guardam apenas material de sessão apropriado.
- AsyncStorage pode guardar usuário em cache, preferências leves e contexto temporário de retomada.
- Valores, disponibilidade, vouchers, limites, status de assinatura e confirmação de pagamento são sempre revalidados no backend.
- Ao voltar ao app, puxar para atualizar ou concluir uma mutação, os domínios afetados são recarregados.

## Tratamento de estados e erros

Cada tela terá os estados carregando, conteúdo, vazio e erro com `Tentar novamente`. Erros do backend serão traduzidos para mensagens claras sem perder o detalhe técnico para logs de desenvolvimento.

Casos tratados explicitamente:

- serviço ou plano indisponível;
- horário ocupado entre seleção e confirmação;
- ausência de anamnese;
- limite mensal ou diário da assinatura;
- voucher inválido, expirado ou incompatível;
- janela mínima de reagendamento/cancelamento;
- perda de conexão;
- sessão Stripe não criada;
- checkout cancelado;
- webhook ainda não processado;
- toque duplicado durante ações.

## Compatibilidade

Serão priorizados React Navigation, `react-native-calendars`, AsyncStorage/SecureStore e APIs oficiais do Expo/React Native já presentes ou diretamente compatíveis. Dependências adicionais só serão introduzidas quando necessárias ao navegador/retorno do checkout e após verificar compatibilidade com a versão atual do Expo.

## Verificação

A implementação deverá passar por:

- verificação TypeScript;
- inicialização do Expo e ausência de erros de bundle;
- inspeção visual do fluxo em tamanho de iPhone e Android;
- teste de carregamento, vazio, erro e nova tentativa;
- agendamento por assinatura;
- agendamento por voucher gratuito e com desconto, quando houver dados de teste;
- agendamento avulso com ida ao Stripe e reconciliação no retorno;
- conflito de horário;
- reagendamento;
- cancelamento dentro e fora da janela permitida;
- assinatura de plano;
- troca, cancelamento e reativação do plano;
- retorno tardio do webhook;
- primeiro agendamento sem anamnese, usando a ponte provisória.

Testes que dependam de credenciais, dados ou webhook externos e não possam ser executados localmente serão identificados com instruções precisas para validação manual.

## Entrega e recomendações

Ao final, a entrega informará:

- arquivos mobile alterados;
- verificações executadas e seus resultados;
- fluxos que exigem validação manual em conta/dispositivo real;
- problemas encontrados no backend, nos contratos ou na arquitetura;
- recomendações priorizadas para cache, performance, segurança, deep links e evolução das telas futuras.

Essas recomendações não autorizam alterações fora do mobile neste ciclo.
