# ADR-001 — Base do repositório e fronteiras das aplicações

Status: Accepted

Substituição parcial em 2026-09-10: a [ADR-002](ADR-002-DIRECOES-DO-PRODUTO.md) transfere o painel corporativo para projeto externo. O restante desta decisão permanece vigente; a decisão original abaixo é preservada como histórico.

Data: 2026-09-10

## Contexto

Preparar o Luminix para migração de um sistema single-tenant e desenvolvimento com assistência de agentes, sem implementar o produto nesta etapa.

## Decisão

- Organizar aplicações em `apps/`, compartilhamento real em `packages/` e contexto em `docs/`.
- Usar backend como monólito modular, com banco inicialmente sob responsabilidade da API.
- Separar painel da clínica (`admin`) e gestão global (`platform-admin`), mantendo uma API com políticas de acesso explícitas.
- Manter institucional e páginas públicas das clínicas em `web` inicialmente.
- Manter aplicações mobile de cliente e gestora como destinos separados.
- Preservar `legacy/charme-bela/` como referência fora do workspace e do versionamento principal; conservar seu histórico próprio.
- Pastas reservadas não determinam criação de packages ou funcionalidades. Configurações compartilhadas começam na raiz; extração depende de necessidade concreta.

## Alternativas consideradas

Painel único com perfis: possível, mas mistura superfícies operacionais muito diferentes. Backends separados: aumentam custo de operação sem necessidade atual. Dividir marketing e páginas públicas: possível quando houver necessidade independente de operação.

## Consequências

Destinos previsíveis para desenvolvimento e migração, com menor duplicação. A separação visual dos painéis não garante segurança: a API deve aplicar autorização de plataforma e de clínica explicitamente. Packages e código de aplicações não podem criar dependências circulares.

## Riscos e revisão

A cópia legada local não será recuperada ao clonar o futuro repositório; sua origem/backup precisa ser definida. Rever separações quando houver consumidores reais, limites de deploy ou equipes independentes. Mudanças devem atualizar este registro por substituição explícita e sincronizar a arquitetura.
