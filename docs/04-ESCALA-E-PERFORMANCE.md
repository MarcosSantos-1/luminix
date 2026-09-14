# 04-ESCALA-E-PERFORMANCE.md

## Regra

Nunca otimizar por medo.

Nunca ignorar performance por confiança.

Medir.

## Metas iniciais

Operações normais:

```text
API p95 < 300 ms
```

Queries comuns:

```text
idealmente < 100 ms
```

Endpoints de dashboard podem ser mais caros, mas devem possuir limites mensuráveis.

## Proibido sem justificativa

- SELECT * em tabelas grandes;
- carregar coleções inteiras;
- N+1 queries;
- gerar PDFs dentro de requests interativas;
- gerar imagens IA bloqueando requests;
- executar integrações externas lentas no caminho crítico;
- loops que fazem query individual para cada item;
- processamento pesado dentro de endpoints comuns.

## Estratégia

Operações lentas devem virar jobs.

Exemplo:

```text
request
→ cria job
→ responde

worker
→ executa trabalho
→ salva resultado
```

## Testes de escala

Antes de crescer, criar seeds grandes.

Exemplos:

```text
500 clínicas
150.000 clientes
1.000.000 appointments
```

Depois:

```text
2.000 clínicas
600.000 clientes
5.000.000 appointments
```

Executar fluxos reais e medir.

Não testar apenas endpoints isolados.

Testar:

- calendário;
- busca;
- dashboard;
- histórico;
- campanhas;
- listagens;
- relatórios.

---
