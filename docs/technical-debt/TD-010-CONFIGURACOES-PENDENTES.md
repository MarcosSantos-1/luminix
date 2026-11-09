# TD-010 — Pendências das Configurações, equipe e editor do site

```text
ID: TD-010
Data: 2026-11-08 (revisado no mesmo dia após ADR-023)
Módulo: admin (Configurações, editor do site), API (team, operations), web (/c/previa)
Problema:
  - Catálogo de serviços continua somente leitura (pertence à seção Serviços, não a Configurações).
  - Nível Profissional vê toda a agenda; falta filtrar pela profissional ligada ao login.
  - Folgas/férias por profissional não existem (só overrides da clínica inteira).
  - Permissões customizadas por pessoa não existem; apenas os quatro níveis prontos.
  - Idioma: o banco aceita só pt-BR; inglês e espanhol aparecem como “Em breve”.
  - E-mail de convite usa o modelo de redefinição de senha do Firebase; personalizar o texto no
    console (03-AUTENTICACAO) ou adotar provedor de e-mail (PR10).
  - A prévia do editor só aceita origens fixas do admin; previews da Vercel com outro domínio não
    conseguem emoldurar /c/previa.
  - Fotos removidas (galeria, serviços, profissionais) não são apagadas do R2 (ver TD-006).
  - modules/operations mantém um helper de autorização próprio (duplicado de createAuthorizedRoute).
Impacto atual: ajustes de catálogo dependem de suporte; profissional enxerga atendimentos de colegas.
Risco futuro: exposição desnecessária de agenda entre profissionais; objetos órfãos no R2.
Workaround atual: usar o nível Profissional só para pessoas de confiança; suporte ajusta catálogo.
Quando deve ser resolvido: catálogo e filtro da agenda antes de clientes reais.
Prioridade: P1 (catálogo, agenda por profissional), P2 (folgas), P3 (idiomas, origens, helper)
Status: aberto
```
