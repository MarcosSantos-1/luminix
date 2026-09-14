# 06-JOBS-E-INTEGRACOES.md

## Toda integração externa pode falhar.

Stripe pode falhar.
OpenAI pode falhar.
R2 pode falhar.
Resend pode falhar.
WhatsApp pode falhar.

Nunca construir lógica supondo disponibilidade perfeita.

## Timeout

Toda integração deve ter timeout explícito.

## Retry

Retry deve ser controlado.

Nunca:

```text
while failed:
    retry
```

Preferir:

- limite de tentativas;
- exponential backoff;
- classificação de erros retryable/non-retryable.

## Idempotência

Operações importantes devem suportar repetição sem duplicar efeitos.

Pergunta obrigatória:

"O que acontece se essa operação chegar duas vezes?"

Exemplos:

Stripe envia o mesmo webhook 3 vezes.

O sistema NÃO pode:

- criar 3 pagamentos;
- liberar 3 pacotes;
- mandar 3 recibos;
- alterar saldo 3 vezes.

Persistir identificadores externos relevantes.

Exemplo:

```text
stripe_event_id UNIQUE
```

## Jobs

Cada job deve ter estados claros:

```text
pending
processing
completed
failed
```

Preferencialmente também:

- attempts;
- last_error;
- created_at;
- started_at;
- finished_at.

---
