# 08-PADROES-DE-CODIGO-IA.md

## Antes de implementar

Use `docs/README.md` como mapa e busque apenas o módulo, contrato e documentos relevantes. Amplie a leitura quando surgirem dependências; não carregue todo o legado por padrão. Prefira o padrão adotado no Luminix a uma convenção antiga do Charme & Bela.

## Coordenação entre agentes

Quando o trabalho com múltiplos agentes for solicitado ou fizer parte do fluxo autorizado:

- Definir resultado esperado, escopo de arquivos e critérios de validação para cada tarefa.
- Dividir por responsabilidades com o mínimo de edição concorrente dos mesmos arquivos.
- Coordenar contratos, migrations, lockfile e configurações compartilhadas antes de modificá-los.
- Designar quem integra resultados e verifica o fluxo completo; verificações isoladas não substituem integração.
- Entregar resumo de decisões, arquivos alterados, validações e pendências. Não depender de histórico de conversa para registrar decisões duradouras.

Não criar um `AGENTS.md` por pasta sem regras locais próprias. Não duplicar normas da raiz; instruções locais complementam o mapa comum.

## Análise da tarefa

A IA deve:

1. entender a arquitetura existente;
2. procurar implementação semelhante;
3. identificar impacto;
4. listar arquivos afetados;
5. considerar segurança;
6. considerar tenant isolation;
7. considerar migrations;
8. considerar testes;
9. considerar observabilidade.

## Durante implementação

Não criar:

- abstrações sem necessidade;
- serviços duplicados;
- helpers equivalentes;
- padrões novos quando já existe padrão estabelecido.

Não adicionar dependência sem explicar:

- por que;
- alternativa existente;
- impacto;
- manutenção.

## Depois da implementação

A IA deve responder:

```text
O que foi alterado:
Riscos:
Testes criados:
Testes manuais recomendados:
Migration:
Impacto de performance:
Impacto de segurança:
Dívida técnica criada:
```

## Regra

Não esconder trade-offs.

Se uma solução for temporária, marcar explicitamente como temporária.

---
