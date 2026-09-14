# 01-SEGURANCA.md

## Regra principal

O frontend nunca é considerado uma fonte confiável.

Tudo recebido do cliente deve ser tratado como potencialmente:

- adulterado;
- repetido;
- incompleto;
- malformado;
- pertencente a outro tenant;
- enviado fora da ordem esperada.

## Princípios

1. Toda autorização deve acontecer no backend.

2. Autenticação responde:
   "Quem é o usuário?"

   Autorização responde:
   "O que esse usuário pode fazer?"

   São problemas diferentes.

3. Nunca assumir que possuir um ID significa possuir acesso ao recurso.

4. Toda entidade sensível deve ser acessada considerando:

   - user_id;
   - clinic_id;
   - role/permissão;
   - resource_id quando aplicável.

5. Nunca armazenar secrets no frontend.

6. Nunca enviar para o cliente:

   - stack traces;
   - SQL errors;
   - tokens internos;
   - secrets;
   - dados de outros tenants;
   - informações desnecessárias.

7. Senhas nunca devem ser armazenadas em texto puro.

8. Tokens devem possuir expiração.

9. Operações sensíveis devem ser auditáveis.

10. Toda rota sensível deve possuir rate limiting adequado.

11. Uploads devem validar:

- tipo;
- tamanho;
- extensão;
- autorização;
- tenant proprietário.

12. Nunca confiar somente no MIME enviado pelo cliente.

13. Webhooks externos devem ter assinatura verificada.

14. Ações destrutivas devem ter proteção contra execução acidental.

15. Exclusão de dados importantes deve preferir soft-delete quando fizer sentido.

16. Logs nunca devem conter:

- senha;
- token completo;
- dados financeiros sensíveis;
- documentos desnecessários.

## Regra de ouro

Uma funcionalidade não está pronta apenas porque funciona.

Ela está pronta quando:

- funciona;
- falha corretamente;
- impede acesso indevido;
- é observável;
- é testável;
- não corrompe dados em execução duplicada.

---

## Extras:

- Identificdores:
  - Chaves primárias públicas devem usar UUID (preferencialmente UUIDv7 ordenável) para evitar enumeração de recursos.
- Idempotência:
  - Rotas com cobranças, liquidação de pacotes e agendamentos devem aceitar cabeçalho `Idempotency-Key` para prevenir execuções duplicadas acidentais.
- Privacidade e LGPD:
  - Dados de fichas de anamnese, registros visuais e histórico clínico são estritamente confidenciais e jamais devem trafegar em logs ou respostas sem escopo restrito.
