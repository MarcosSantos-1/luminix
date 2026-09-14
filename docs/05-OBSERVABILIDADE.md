# 05-OBSERVABILIDADE.md

## Uma falha que não conseguimos investigar é um problema de arquitetura.

Toda API deve possuir logs estruturados.

Logs devem permitir identificar:

- request;
- usuário quando apropriado;
- tenant;
- endpoint;
- erro;
- duração;
- integração externa envolvida.

## IDs

Usar request_id/correlation_id.

Exemplo:

```text
req_abc123
```

Se Stripe → API → worker → banco participarem da mesma operação, deve ser possível seguir o fluxo.

## Métricas importantes

- p50/p95/p99 de latência;
- taxa de erro;
- uso de CPU;
- memória;
- conexões PostgreSQL;
- queries lentas;
- jobs pendentes;
- jobs falhando;
- webhooks com erro;
- IA com erro;
- custo IA;
- uploads;
- retries.

## Alertas

Não alertar por tudo.

Alertar por coisas que exigem ação.

Exemplo:

- aumento súbito de 5xx;
- banco sem conexões disponíveis;
- jobs acumulando;
- webhook crítico falhando;
- pagamento com taxa anormal de erro.

---
