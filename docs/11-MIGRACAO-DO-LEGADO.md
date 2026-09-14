# Migração do Charme & Bela

## Estado

O legado está em `legacy/charme-bela/`, contendo `backend/`, `web/`, `mobile/`, documentação e `.git/` próprios. O [inventário estático inicial](12-INVENTARIO-LEGADO.md) foi concluído em 2026-09-10. Não é uma auditoria completa de segurança nem validação em execução. Não há migration de dados ou reaproveitamento executado.

Essa cópia fica fora do futuro workspace, builds, lint e testes do Luminix. O `.gitignore` da raiz a exclui do futuro repositório principal para evitar importar código, histórico e possíveis arquivos sensíveis inadvertidamente. Preservar a cópia e seu histórico; definir backup/origem recuperável antes de depender dela em outra máquina. Não é um submódulo configurado.

## Procedimento por funcionalidade

1. Localizar implementação, documentação e testes relevantes no legado; não carregar a árvore inteira como contexto.
2. Mapear comportamento observado e dependências. Separar regra de produto de acidente da implementação.
3. Identificar dados globais, dados da clínica, vínculos e suposições single-tenant.
4. Definir destino no Luminix e decidir entre reutilizar, adaptar ou reimplementar, com justificativa.
5. Definir contratos, autorização e testes de preservação de comportamento e isolamento.
6. Quando houver migração de dados, documentar mapeamento, validação, ensaio em ambiente isolado e recuperação antes de executar.
7. Registrar resultado e pendências no inventário abaixo; decisões estruturais em ADR e dívida conhecida no registro próprio.

Não executar scripts, instalar dependências ou conectar serviços do legado como consequência automática de uma leitura. Não copiar `.env`, dumps ou credenciais para o Luminix.

## Inventário incremental

O registro está no [inventário inicial](12-INVENTARIO-LEGADO.md), com IDs F01–F19 e riscos R01–R12. Atualizar esse registro ao aprofundar cada funcionalidade; não manter tabelas concorrentes nem marcar como migrado sem implementação e validação.

Status sugeridos: não analisado, analisado, em migração, validado, descartado com justificativa.

## Em aberto

- Aprofundamento funcional, validação isolada e matriz de autorização por endpoint.
- Estratégia de importação de dados e transição operacional.
- Local recuperável e política de conservação da referência legada.
