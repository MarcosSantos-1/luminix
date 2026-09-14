# Produto e contexto

## Adotado

Luminix é um SaaS B2B para negócios de beleza, estética e serviços relacionados. O público inicial são clínicas de estética e esteticistas, com expansão possível para salões, manicures, massoterapeutas e designers de sobrancelhas. Não é um marketplace.

Cada estabelecimento é um tenant independente. Uma identidade de cliente pode participar de várias clínicas e alternar entre elas, sem compartilhar automaticamente histórico, anamnese ou outros dados locais entre estabelecimentos.

Há três públicos distintos: cliente final, equipe da clínica e operadores da plataforma Luminix. Administrar a plataforma não implica acesso irrestrito a dados clínicos.

## Planejado

Interfaces do Luminix: API, web institucional e público, painel da clínica e aplicativos mobile separados para cliente e gestora/profissional. O painel corporativo será um projeto externo da empresa-mãe, reunindo Luminix, Kota e outros produtos; nome da empresa ainda não definido.

O painel global poderá reunir indicações, afiliados, métricas, analytics, dashboards, quantidade de clientes, estimativas de rentabilidade e rankings. As definições dos indicadores, permissões e fontes de dados serão estabelecidas ao desenvolver cada funcionalidade.

Primeira frente de produto priorizada: configuração completa da clínica, equipe, salas/macas, ocupações, catálogo sugerido, tratamentos e regras personalizáveis. Cadastro de clientes em etapas, convites, pré-cadastro e anamnese administrativa precisam de especificação própria. Ver [registro incremental PR01–PR20](13-REQUISITOS-PENDENTES-DO-PRODUTO.md).

Escolhas definidas: Cloudflare R2 para storage, Stripe Connect para pagamentos (sem Asaas no Luminix), CPF/senha e recuperação SMS para cliente final, Firebase para equipe/gestor. Desenho de recuperação assistida e modelo financeiro ainda pendentes; ver [ADR-002](decisions/ADR-002-DIRECOES-DO-PRODUTO.md).

Ordem aproximada de evolução:

1. Arquitetura, banco, autenticação, autorização, Tenant Context e design system.
2. Clínicas, configurações e onboarding.
3. Serviços, profissionais e clientes.
4. Agenda e agendamentos.
5. Pacotes/recorrência e anamnese.
6. App do cliente.
7. Pagamentos, mídia, relatórios, campanhas e IA.

A ordem pode ser revista conforme dependências reais. Possibilidades futuras não justificam implementação antecipada. Design será tratado em etapa própria.

## Legado

O Charme & Bela é a referência funcional single-tenant em `legacy/charme-bela/`. Reaproveitamento exige análise de comportamento, dados e riscos; não se presume compatibilidade multi-tenant.
