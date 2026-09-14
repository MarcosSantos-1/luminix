E eu criaria testes explicitamente para quebrar o isolamento

Exemplo:

Clinic A:
appointment_a

Clinic B:
appointment_b

User A → Clinic A
User B → Clinic B

Testes:

User A solicita appointment_a → 200
User A solicita appointment_b → 404/403
User B solicita appointment_b → 200
User B solicita appointment_a → 404/403

Faça isso para:

clientes
agendamentos
mídias
pacotes
pagamentos
serviços
profissionais
relatórios
campanhas

É chato. É exatamente o tipo de teste que salva um SaaS.
