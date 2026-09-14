# [02-BANCO-E-DADOS.md](http://02-BANCO-E-DADOS.md)

## PostgreSQL é a fonte da verdade

Não duplicar regras importantes apenas no frontend.

Sempre que possível, usar o banco para garantir invariantes através de:

- FOREIGN KEY;
- UNIQUE;
- NOT NULL;
- CHECK;
- constraints;
- transactions.

Exemplo:

Não confiar apenas na aplicação para impedir dois registros incompatíveis.

Quando possível, fazer o próprio banco impedir estados inválidos.

## Tenant

Tabelas pertencentes à clínica devem conter clinic_id explicitamente.

Exceções devem ser documentadas.

## Índices

Nenhum índice deve ser criado "porque talvez ajude".

Antes de criar:

- identificar query;
- analisar filtros;
- analisar ordenação;
- observar cardinalidade;
- medir com EXPLAIN / EXPLAIN ANALYZE quando necessário.

Consultas comuns tenant-aware provavelmente precisarão de índices começando por clinic_id.

Exemplo:

```sql
(clinic_id, starts_at)
```

em consultas frequentes de agenda.

## Paginação

Nenhum endpoint de coleção potencialmente grande deve retornar todos os registros por padrão.

Aplicar paginação.

Preferir cursor pagination quando volume e ordenação justificarem.

## Transações

Usar transaction quando múltiplas mudanças precisam ser consideradas uma única operação lógica.

Exemplo:

- descontar sessão de pacote;
- criar appointment;
- registrar evento financeiro.

Ou tudo acontece, ou nada acontece.

## Concorrência

Sempre perguntar:

"O que acontece se duas requests executarem isso ao mesmo tempo?"

Especial atenção para:

- horários;
- pacotes;
- estoque;
- pagamentos;
- códigos promocionais;
- contadores;
- saldo;
- limites.

---
