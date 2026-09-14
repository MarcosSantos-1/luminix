# ADR-002 — Integrações, identidade e painel corporativo

Status: Accepted (direções de produto; desenho técnico detalhado pendente)

Data: 2026-09-10

## Contexto

O usuário definiu diferenças explícitas entre o Luminix e o legado e esclareceu que o painel corporativo atenderá vários produtos. O inventário não deve transformar características do Charme & Bela em requisitos obrigatórios do Luminix.

## Decisão

- Cloudflare R2 é o storage oficial planejado.
- Stripe Connect é o gateway escolhido; Asaas permanece apenas no legado. Modelo de contas/cobranças e separação dos fluxos financeiros ainda serão detalhados.
- Cliente final terá login por CPF e senha, com recuperação por SMS; provedor técnico ainda em aberto.
- Gestor e equipe usarão Firebase, com contas individuais e autorização por vínculo/roles no backend.
- Recuperação assistida pela clínica é requisito a desenhar; não autoriza alteração arbitrária do fator de autenticação de uma identidade global.
- Painel corporativo pertence a projeto externo da empresa-mãe e poderá reunir Luminix, Kota e outros produtos. `apps/platform-admin/` não é aplicação obrigatória deste repositório. Eventual painel operacional específico do Luminix depende de necessidade concreta.

Esta última decisão substitui apenas a parte da ADR-001 que determina painel global interno. As demais fronteiras permanecem. O nome da empresa-mãe não está definido.

## Alternativas e consequências

Reaproveitar Asaas e autenticação do cliente legado reduziria mudanças imediatas, mas não atende às escolhas atuais. Separar painel corporativo evita acoplar o Luminix a outros produtos. Integrações futuras devem usar contratos autorizados; não conceder acesso irrestrito às tabelas ou dados clínicos.

## Em aberto

Tecnologia de login CPF/senha, recuperação assistida segura, modelo Stripe Connect, cobrança B2B, canais/provedores de mensagens e operação de ambientes. Nenhuma integração, migration ou aplicação foi implementada por esta decisão.

## Referência

[Registro de requisitos](../13-REQUISITOS-PENDENTES-DO-PRODUTO.md), incluindo a primeira frente de configuração da clínica.
