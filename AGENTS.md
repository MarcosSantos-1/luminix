# Luminix — Instruções para agentes

Este projeto é um SaaS B2B multi-tenant para clínicas, salões e studios.

Antes de realizar alterações relevantes, consulte `docs/README.md` para identificar quais documentos adicionais são necessários para a tarefa.

## Regras obrigatórias

* Não realizar alterações estruturais sem analisar a implementação existente.
* Não assumir padrões se já existir implementação equivalente no projeto.
* Não criar novas dependências sem necessidade clara.
* Não alterar schema do banco sem migration versionada.
* Não modificar produção diretamente.
* Não confiar em dados de tenant enviados pelo frontend.
* Toda entidade tenant-aware deve respeitar isolamento por clínica.
* Segurança e integridade dos dados têm prioridade sobre conveniência.
* Não remover código ou comportamento existente sem entender seu uso.
* Não criar abstrações prematuramente.
* Não transformar o projeto em microserviços sem decisão arquitetural explícita.
* Não realizar refatorações grandes junto com uma feature não relacionada.

## Antes de implementar

Para alterações não triviais:

1. Identifique os arquivos envolvidos.
2. Leia a documentação aplicável.
3. Entenda o comportamento atual.
4. Identifique riscos.
5. Apresente um plano curto.
6. Só então altere o código.

## Depois de implementar

Verifique:

* TypeScript;
* lint;
* testes existentes;
* testes relacionados à alteração;
* segurança;
* tenant isolation;
* migrations;
* regressões aparentes.

Quando relevante, informe:

* arquivos alterados;
* comportamento alterado;
* riscos;
* testes realizados;
* testes ainda necessários;
* dívida técnica criada.

## Documentação

* O Luminix está em preparação; pastas reservadas não representam implementação pronta.
* Consulte `docs/00-ARQUITETURA.md` para localizar responsabilidades antes de criar arquivos.
* `legacy/charme-bela/` é referência, não padrão obrigatório nem parte do workspace Luminix. Não altere ou execute o legado sem tarefa específica. Para migração, consulte `docs/11-MIGRACAO-DO-LEGADO.md`.
* Instruções e convenções do legado se aplicam ao legado; não devem ser copiadas automaticamente para o Luminix.
* Diferencie estado implementado, decisões adotadas, planos e questões em aberto nos documentos.
* Ao trabalhar com múltiplos agentes, siga a coordenação em `docs/08-PADROES-DE-CODIGO-IA.md`.

Não leia toda a pasta `/docs` indiscriminadamente.

Comece por:

`docs/README.md`

e carregue somente os documentos relevantes para a tarefa.

## Mudanças arquiteturais

Mudanças importantes de arquitetura, infraestrutura, banco, autenticação ou modelo multi-tenant devem ser registradas em `/docs/decisions`.

## Dívida técnica

Se um problema conhecido for conscientemente adiado, registre ou atualize `/docs/technical-debt`.

Não esconder problemas conhecidos apenas para considerar a tarefa concluída.
