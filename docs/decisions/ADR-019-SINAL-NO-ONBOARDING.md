# ADR-019 — Sinal em Pagamentos e regras simplificadas

Status: Accepted. Data: 2026-11-01.

## Decisão

Pagamentos oferece sinal opcional abaixo de Pacotes, inclusive no recebimento externo.
O padrão continua sem sinal. A gestora pode escolher todos os avulsos, tratamentos individuais,
apenas especiais com locação (`manual_release`) ou preço final acima de um limite em centavos.
O percentual é inteiro de 1 a 100, sobre o preço final combinado, abatido do total. O editor
oferece atalhos sem transformar o percentual em recomendação de penalidade. Pacotes não entram.
Preço “a partir de” e orçamento dependem de acordo sobre o preço final antes do futuro checkout;
o contador local não usa esses preços provisórios para afirmar que o limite foi atingido.

Esta entrega **configura** sinal; não cria checkout, cobrança, confirmação por pagamento ou
reembolso. Escolher sinal não altera percentuais de retenção nem os prazos existentes. A base da
retenção continua sendo o valor efetivamente antecipado pelo avulso (ADR-018), não o preço total.
Sinal e retenção não são sinônimos. A UI e a revisão informam essa fronteira.

Regras apresenta as consequências por evento e a opção recomendada sem desconto. A ação zera
retenções e remove exceções financeiras, preservando prazos e sinal. Personalização financeira
existente fica em seção opcional expansível; não é removida nem zerada ao simplesmente abrir a
etapa. A gestora pode manter as escolhas e voltar antes de concluir. Edição operacional posterior
continua dependência da TD-009, sem promessa de funcionalidade já disponível no painel.

## Persistência e segurança

Campos opcionais no contrato preservam rascunhos antigos. Migration 0019 adiciona colunas a
`booking_policies` (escopo, percentual, limite) e `services` (seleção individual). Não cria tabelas,
novas dependências ou permissões. API valida enum, boolean, inteiros e limites; o banco mantém
constraints, RLS e auditoria existentes. Trigger de conclusão materializa na mesma transação,
sempre filtrando clínica e serviço. Configurações retornam valores materializados e IDs selecionados
apenas da clínica autorizada. Desligar sinal preserva seleções para edição, mas escopo `none`
sempre prevalece. Clínicas existentes permanecem sem sinal.

Rollback: reverter aplicação mantendo colunas e dados; não remover nem editar migration aplicada.
Publicação: banco, API no Fly, admin via push em master/Vercel na fase inicial autorizada.

## Apresentação Stripe e mobile

Cadastro ausente mostra uma ação para começar, sem atualização de situação nem indicadores de
liberação. Pendências de preenchimento têm instruções diretas e ação para abrir o formulário
incorporado vinculado à clínica, evitando cadastro genérico desconectado do Luminix. Indicadores
financeiros ficam nos estados ativo/em análise. Não alteramos autorização financeira do backend.
Estado pending sem requisitos não é prova de cadastro completo; a UI não o apresenta como liberado.

Navegação mantém foco acessível no título, sem contorno de controle, e rola até o cabeçalho completo
quando os dados chegam e nas trocas de etapa. Fundo fixo e conteúdo usam camadas explícitas sem
z-index negativo dentro de contêiner recortado. Cards principais reduzem blur em telas pequenas.
Essa mitigação de composição precisa de conferência no Safari/iPhone real para confirmar resolução
do desaparecimento intermitente; a prévia desktop não reproduz integralmente o dispositivo.

## Validação

Testes admin cobrem defaults antigos, quatro escopos, limite estrito, preços não definitivos e resumo.
API/PGlite cobre validação, retomada, conclusão/replay, materialização e leitura isolada. TypeScript e
builds admin/API aprovados. Suíte API: 101 testes; admin: 23 testes. Lint da API e novos componentes
aprovado; lint de `steps.tsx` mantém erros preexistentes de refs/imports (TD-007). `pnpm check`
continua bloqueado por formatação preexistente em arquivos externos. Prévia local desktop e 390 px conferiu cabeçalho, cards,
seleção de serviço, ajuda de pacotes, regras e edição decimal do limite sem overflow. Cadastro Stripe autenticado e Safari real permanecem
conferências manuais necessárias. Execução financeira é trabalho pendente registrado na TD-009.

Migration 0019 aplicada e verificada em 2026-11-01 no Neon principal autorizado,
`ep-bitter-fog-acchavo1.sa-east-1.aws.neon.tech/neondb`. Verificação do runner cobriu FK
cross-clinic, RLS com role restrita, contexto ausente, constraints e auditoria, revertendo fixtures.
