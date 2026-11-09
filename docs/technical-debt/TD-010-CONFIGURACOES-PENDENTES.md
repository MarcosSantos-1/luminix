# TD-010 — Configurações ainda não editáveis e limites do editor do site

```text
ID: TD-010
Data: 2026-11-08
Módulo: admin (Configurações, editor do site), web (/c/previa)
Problema:
  - Equipe e catálogo de serviços continuam somente leitura no painel (ADR-022).
  - Idioma: o banco aceita só pt-BR; inglês e espanhol aparecem como “Em breve”.
  - A prévia do editor só aceita origens fixas do admin; deploys de preview da Vercel
    com outro domínio não conseguem emoldurar /c/previa.
  - Fotos removidas da galeria/serviços não são apagadas do R2 (ver TD-006).
Impacto atual: gestora precisa refazer o onboarding para mudar equipe/serviços (não possível
  após concluir); prévia não funciona em domínios de preview.
Risco futuro: suporte manual para ajustes de catálogo; objetos órfãos no R2.
Workaround atual: suporte ajusta dados diretamente; testar o editor em produção ou local.
Quando deve ser resolvido: antes de abrir para clientes reais (catálogo/equipe).
Prioridade: P1 (catálogo/equipe), P3 (idiomas, origens de preview)
Status: aberto
```
