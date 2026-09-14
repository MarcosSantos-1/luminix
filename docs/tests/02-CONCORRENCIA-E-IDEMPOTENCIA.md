# 02-CONCORRENCIA-E-IDEMPOTENCIA.md

Testar explicitamente:

## Appointment

Dois usuários tentam reservar o mesmo profissional no mesmo horário simultaneamente.

Resultado esperado:

Apenas um appointment pode ser confirmado.

## Pagamento

Mesmo webhook recebido:

- 2 vezes;
- 5 vezes;
- fora de ordem.

Resultado esperado:

Somente um efeito financeiro.

## Pacote

Duas sessões tentam consumir o último crédito simultaneamente.

Resultado esperado:

Nunca chegar a saldo negativo por race condition.

## Campanha

Mesmo job executado duas vezes.

Resultado esperado:

Não gerar disparos duplicados indevidos.

## Upload

Retry do upload/finalização.

Resultado esperado:

Não criar mídia duplicada ou órfã.

---
