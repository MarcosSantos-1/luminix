# Fonte sanitizada do aplicativo cliente

`legacy-source/` preserva telas, componentes, assets e regras de apresentação do aplicativo
Charme & Bela para migração incremental. Essa fonte não participa do build, typecheck ou lint do
Luminix e não deve ser ativada integralmente.

Foram excluídos da cópia:

- arquivos `.env`, credenciais Google/Firebase e configuração EAS;
- identificadores de bundle, projeto, owner e endpoints produtivos;
- cliente HTTP do backend legado;
- autenticação Firebase/Apple/telefone, push notifications e dados fixos da clínica;
- manifests e lockfile do projeto legado.

O original permanece intacto em `legacy/charme-bela/mobile/`. Migre cada funcionalidade conforme
`docs/11-MIGRACAO-DO-LEGADO.md`, adicionando contratos e autorização multi-tenant antes de conectá-la
à API Luminix.
