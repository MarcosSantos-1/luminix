# ADR-020 — Tipos de reserva e destino do sinal simplificados

Status: Accepted. Data: 2026-11-01.

## Contexto

O público principal do onboarding tem pouca familiaridade com tecnologia. As etapas 8 e 9 ofereciam
quatro escopos de sinal, limite em reais, percentuais separados de retenção, exceções por serviço em
diálogo próprio e vários avisos longos. A complexidade aparecia justamente nas últimas etapas.

## Decisão

Cada serviço passa a ser apresentado como um de três tipos de reserva, sem campo novo:

- **Especial:** `bookingMode = 'manual_release'` (aparelho alugado ou material preparado), marcado
  em Detalhes. Usa `specialCancellationHours`. Pede sinal conforme `depositRequired`, ligado ou
  desligado por aparelho em Pagamentos (imagem do aparelho e acordeão com os tratamentos afetados).
- **Com sinal:** `depositRequired = true` em serviço comum, numa lista opcional (switch) com busca.
- **Gratuita:** os demais. Sem pagamento antecipado, não há o que reter.

Pagamentos oferece apenas "sem sinal" ou "com sinal", o percentual, os aparelhos e a lista. O
escopo salvo passa a ser sempre `none` ou `selected`, e em `selected` vale só `depositRequired`.
Ao ligar o sinal sem nenhum serviço marcado, os especiais vêm pré-marcados (recomendação), mas a
gestora pode desligá-los. O percentual começa vazio e é obrigatório: `depositProblem` bloqueia o
avanço sem percentual ou sem nenhum serviço com sinal. Um exemplo com um serviço real da clínica
mostra quanto a cliente paga para reservar e no dia. `normalizeLegacyDepositScope` converte
rascunhos `all`, `threshold` e `special` para `selected`, marcando exatamente os serviços que já se
enquadravam. Escopo `none` não é alterado e preserva seleções, como na ADR-019.

Regras substitui o editor de percentuais e exceções por uma pergunta, "E o sinal?", com três cartões
gravados nos campos existentes da ADR-018:

| Cartão                                        | `lateChangeRetentionPercent` | `noShowRetentionPercent` |
| --------------------------------------------- | ---------------------------- | ------------------------ |
| Devolver sempre (padrão)                      | 0                            | 0                        |
| Ficar com o sinal só se faltar sem avisar     | 0                            | 100                      |
| Ficar com o sinal se cancelar depois do prazo | 100                          | 100                      |

Escolher um cartão limpa retenções por serviço (`null`) e preserva prazos por serviço. Rascunhos com
percentuais ou exceções diferentes aparecem como "regra personalizada" e ficam intactos até a gestora
escolher um cartão. Sem sinal, a etapa só informa que não há cobrança.

## Limite da retenção

A base continua sendo o valor efetivamente antecipado pelo avulso (ADR-018). Como o sinal é o único
pagamento antecipado oferecido, 100% equivale ao sinal. Regra de produto: **nunca reter mais que o
sinal**, mesmo se no futuro houver pagamento integral antecipado. Cancelamento pelo espaço devolve o
sinal inteiro; aviso dentro do prazo devolve ou, com concordância da cliente, aproveita o valor em
outro horário. Pacotes preservam sessões. Retenções tardia e falta não se somam.

A orientação legal fica em um único acordeão: Código Civil arts. 417 a 420 (arras), CDC art. 6º, III
(informação prévia), art. 49 (arrependimento em contratação fora do estabelecimento) e art. 51
(cláusulas abusivas), além da possibilidade de devolver em imprevistos. Não é parecer jurídico.

## Substitui

Da ADR-019: escopos `all`, `threshold` e `special` deixam de ser oferecidos (continuam aceitos pela
API e pelo banco). Da ADR-018: percentuais 10–50% e exceções financeiras por serviço deixam de ser
editáveis no onboarding. O diálogo de exceções foi removido.

## Persistência e validação

Sem migration, dependência, permissão ou mudança de API/trigger: a API já aceita 0–100 e os escopos
existentes. Testes do admin cobrem seleção por serviço (inclusive especial desligado), pré-marcação
dos especiais, validação do percentual e da lista, normalização de escopos antigos,
estabilidade, resumo, mapeamento dos cartões, detecção de regra personalizada e limpeza das exceções.
Cobrança, devolução e aplicação no agendamento público continuam na TD-009.
