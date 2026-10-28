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
