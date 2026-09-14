# 05-FALHAS-DE-INTEGRACOES.md

Simular:

- Stripe timeout;
- Stripe 500;
- banco temporariamente indisponível;
- storage timeout;
- IA timeout;
- IA retornando formato inválido;
- serviço de email indisponível;
- push notification falhando;
- webhook atrasado;
- webhook duplicado;
- resposta parcial;
- app fechando durante uma operação.

Pergunta para cada teste:

"O sistema continua consistente?"

Não é obrigatório que tudo funcione.

É obrigatório que a falha não deixe os dados em estado imprevisível.
