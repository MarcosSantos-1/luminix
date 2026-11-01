# ADR-018 — Cancelamento tardio e faltas no onboarding

Status: Accepted. Data: 2026-10-27.

## Decisão e fronteira

A etapa Regras distingue aviso dentro do prazo, cancelamento/remarcação tardios e falta.
Substitui a direção de bloquear cancelamento após o prazo da ADR-017: o futuro agendamento
deverá receber o aviso tardio e liberar a vaga. Falta é ausência sem cancelamento. Retenções
por alteração tardia e falta são alternativas para uma reserva, nunca cumulativas.

O padrão é sem retenção. O espaço pode salvar percentuais independentes para alteração tardia
e falta, com exceções por serviço. Percentuais são inteiros de 0 a 100 no contrato; a interface
oferece 0, 10, 20, 25, 30 e 50, preservando outros valores válidos já salvos. Nenhum percentual
é aprovação jurídica. O espaço deve validar sua política e respeitar direitos legais e isenções.

Base de cálculo: valor efetivamente pago antecipadamente pelo atendimento **avulso**, nunca
preço de tabela, valor total de pacote ou saldo de outros atendimentos. Ao cancelar, o saldo
não retido poderá ser devolvido; ao remarcar, poderá ser aproveitado na nova reserva, exigindo
complemento quando cabível. Isso é direção do fluxo financeiro futuro, ainda não implementado.
Sem pagamento antecipado não há retenção nem dívida automática. Sinal e cobrança posterior
não são implementados por esta entrega.

Pacotes preservam sessões em cancelamento, remarcação e falta nesta política. Desistência da
compra e devolução de saldo são outro fluxo, a especificar considerando sessões utilizadas.
Não adicionar consumo de sessão ou multa adicional silenciosamente ao implementar o motor.

Esta entrega salva preferências, mostra exemplos ilustrativos de R$ 200 e inclui os termos
na revisão. Não executa cobrança, retenção, reembolso ou agendamento público. A UI comunica
essa fronteira. Ciência/aceite do cliente, versão por reserva, isenção auditada e execução
financeira idempotente permanecem pré-requisitos operacionais na TD-009.

## Persistência e segurança

Migration 0018 adiciona `late_change_retention_percent` e `no_show_retention_percent` às tabelas
existentes `booking_policies` e `services`. Padrão da clínica: zero; serviço nulo herda, zero
isenta explicitamente, inclusive quando a clínica possui percentual maior. Campos são opcionais
no contrato v3. Cadastros antigos não passam a ter retenção por esta migration.

Trigger de conclusão materializa preferências e exceções na mesma transação autorizada do
onboarding, sempre com filtro de clínica e ID do serviço. Colunas mantêm RLS forçada, constraints
e auditoria das tabelas existentes. Não aceita clinic ID financeiro ou regra operacional vindos
de outra clínica. Configurações expõem padrão e exceções materializados; rascunho não é fonte
operacional. As escolhas permanecem ao retomar e editar pelo resumo.

Não foram criadas dependências, tabelas ou índices. A mudança é aditiva; locks limitados pelo
runner. Ordem de publicação: banco, API, admin. Rollback: reverter aplicação preservando as
colunas e valores; remoção futura somente por nova migration, após preservar configurações.

## Validação

PGlite cobre conclusão/replay, defaults compatíveis, exceção zero, herança nula, leitura isolada,
rejeição de percentuais inválidos, RLS e auditoria. Testes do admin cobrem precedência por serviço
e distinção entre falta e alteração tardia. Prévia sintética reutiliza a página QA exclusiva de
desenvolvimento; não possui escrita de dados reais. Conferência autenticada completa e execução
financeira não são substituídas por essa prévia.

Migration 0018 aplicada no Neon principal autorizado em 2026-10-27, endpoint direto
`ep-bitter-fog-acchavo1.sa-east-1.aws.neon.tech/neondb`. Verificação transacional do runner
cobriu RLS, ausência de contexto, FK entre clínicas, constraints e auditoria, com rollback dos
dados sintéticos. TypeScript/builds de admin e API, 101 testes da API e 12 do admin aprovados;
lint da API e dos arquivos admin alterados aprovado. `pnpm check` continua bloqueado por
formatação preexistente fora desta entrega, conforme TD-007. Prévia desktop conferiu padrão
zero, escolha de serviço, exemplo 25% e revisão. Mobile e conclusão autenticada completa
permanecem conferências manuais necessárias.

## Evolução do onboarding e estudo de mercado — 2026-10-31

Benchmark qualitativo de funcionalidades públicas, sem estimativa própria de redução de faltas
ou validação de disponibilidade regional. Fontes consultadas em 2026-10-31:

| Referência                                                                                                                             | Comportamento observado                                                                                                                       | Aplicação ao Luminix                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [Trinks — pagamento antecipado](https://ajuda.trinks.com/pagamento-antecipado-via-site-mais-seguranca-e-controle-para-o-seu-negocio)   | Pagamento integral ou sinal de 10%, 20%, 30% ou 50%; confirmação após aprovação do sinal; estorno ou crédito no cancelamento.                 | Separar antecipação de política de retenção. Sinal abate o preço final, não é uma taxa adicional.                               |
| [Booksy — No-Show Protection](https://biz.booksy.com/features/no-show-protection)                                                      | Sinal ou cartão para taxa de cancelamento, seleção por serviço e possibilidade de isenção; lembretes e lista de espera. Página internacional. | Preferir proteção seletiva, prevenção e possibilidade de dispensar a retenção. Não importar percentuais como padrão brasileiro. |
| [Fresha — cancelamentos e faltas](https://www.fresha.com/help-center/knowledge-base/payments/617-charge-no-show-and-cancellation-fees) | Consequência conforme política aceita, usando antecipação ou cartão; cobrança posterior pode falhar.                                          | Não tratar cartão salvo como garantia de recebimento nem acumular duas penalidades no mesmo evento.                             |

O [CDC, arts. 46, 49 e 51](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html)
exige informação prévia, prevê arrependimento em contratações fora do estabelecimento e veda
cláusulas abusivas. Antecipação e aceite não tornam qualquer retenção válida. Não existe nesta
análise um percentual universalmente permitido. Validar o contrato e suas exceções com assessoria
jurídica antes da execução financeira.

### Direção de produto

Manter sem retenção como padrão. Para serviços com custo antecipado, recomendar exceções por
serviço; a regra geral continua disponível por escolha explícita. Não gerar dívida automática para
quem não antecipou pagamento. Isso é uma decisão de escopo do produto, não afirmação de que toda
cobrança posterior é ilegal. Pacotes mantêm as sessões, inclusive em falta.

Para aparelho alugado, recomendar sinal e prazo compatíveis com o compromisso assumido com a
locadora, avaliando 24/48 horas conforme a operação. O aluguel não justifica perda integral
automática. Exemplo de planejamento, não taxa recomendada: em um avulso de R$ 400 integralmente
antecipado, uma retenção de 25% representaria R$ 100, com R$ 300 de saldo a devolver. Se só R$ 100
fossem antecipados, os mesmos 25% representariam R$ 25, não R$ 100. Sinal e retenção têm bases
diferentes; definir sua integração antes de lançar o checkout. Um custo por diária deve considerar
a divisão entre reservas e recuperação da vaga, não ser cobrado integralmente de cada cliente.

Cancelamento pelo estabelecimento não sofre retenção desta política. Direitos legais prevalecem;
crédito depende de concordância e não substitui restituição devida. Isenção por imprevistos e
prevenção com lembretes/lista de espera são direção para o motor futuro, não funcionalidades
ativadas pelo onboarding.

### Implementado nesta evolução

Etapa 9 oferece “sem retenção”, “somente em serviços específicos” e “regra geral”. A escolha é um
editor das preferências existentes, sem campo/schema novo: ao reabrir, o modo reflete os percentuais
salvos. Abrir um editor sem definir percentual não ativa retenção. Escolher sem retenção zera os
globais e remove exceções financeiras; escolher serviços zera os globais e mantém exceções
explícitas. Nenhuma troca modifica preços, pagamentos ou prazos. Valores antigos válidos, inclusive
percentuais fora dos atalhos e isenções explícitas, são preservados ao abrir/editar.

O editor individual também permite ajustar o prazo de cancelamento existente. Remarcação herda
esse prazo somente se não houver prazo próprio geral de remarcação. O resumo distingue regra geral
e exceções e inclui prazos individuais. Orientações visíveis diferenciam pagamentos antecipados,
pagamento na clínica, pacotes e aparelho alugado. A tela informa que sinal e execução financeira
continuam indisponíveis. Não há novas dependências, migrations, consultas ou permissões; os campos
seguem o mesmo rascunho, validação da API e materialização transacional com isolamento por clínica.

Validação desta evolução: TypeScript e build de produção do admin aprovados; lint dos arquivos
alterados aprovado; 17 testes do admin e 101 da API aprovados. Navegador desktop com fixture
sintética conferiu seleção por serviço, 25% por falta, prazo próprio de 48h, revisão, retorno à
edição e remoção da retenção sem apagar prazos; console sem erros. Fluxo autenticado completo e
mobile seguem conferências manuais pendentes. `pnpm check` parou na formatação preexistente em
sete arquivos externos à mudança (TD-007); não declarar validação agregada verde.
