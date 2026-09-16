# Light Mode — base temporária

Status: protótipo funcional; login/sessão conectado ao Firebase/API em `/login`, com validação
autenticada da UI hospedada pendente. Formulário após login cria primeira clínica draft/owner
na API; seletor e workspace clínico revalidam o vínculo na API. Onboarding e dashboard
continuam demonstrativos.

O Light Mode serve como bancada visual para desenvolver onboarding, autenticação, tenant e integrações antes da decisão final de identidade. A implementação inicial está em `apps/admin` e usa os mesmos componentes funcionais que deverão aceitar o tema `glass` no futuro.

## Direção visual

- Canvas blush muito claro e superfícies brancas opacas.
- Pink da marca reservado para ações, seleção, foco e destaques.
- Cartão principal da agenda pode usar gradiente forte.
- Bordas discretas, sombras suaves e raios amplos.
- Painel mobile prioriza agenda, ações frequentes e navegação inferior.
- Onboarding desktop usa contexto/progresso à esquerda e uma etapa por vez à direita.

As referências fornecidas estão em `assets/references/design/light-mode/`.

## Estado implementado

- Landing temporária que inicia o onboarding.
- Onboarding navegável com sete etapas: clínica, serviços, estrutura, equipe, funcionamento, preferências e conclusão.
- Resumo e link de convite ilustrativos.
- Painel Light responsivo em `/dashboard` com dados de demonstração.
- Background e logos oficiais copiados para os assets públicos do app.

## Limites intencionais

O formulário mantém estado apenas durante a sessão da página. “Salvo automaticamente”, criação da clínica, convite, pagamentos e dados do painel são demonstrações visuais. Nenhum dado é enviado ao backend, Firebase, Neon, Stripe, WhatsApp ou R2.

Antes de conectar o onboarding, definir o contrato de rascunho versionado, idempotência da conclusão, criação de tenant e autorização do proprietário. A tela não deve determinar o schema sozinha: campos ainda em definição podem ser armazenados como rascunho, mas dados centrais exigem modelo explícito.

## Próxima evolução

1. Extrair tokens Light e Glass para uma camada compartilhada quando o segundo tema tiver consumidor real.
2. Trocar dados fixos por contratos tipados e estados de carregamento, vazio e erro.
3. Expandir o acesso da equipe para convites, delegação e proteção do último proprietário.
4. Persistir rascunho do onboarding no backend e concluir a clínica de forma transacional.
5. Executar testes de contraste, teclado, telas pequenas e uso prolongado.
