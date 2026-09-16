# Light Mode — base temporária

Status: login/sessão conectado ao Firebase/API em `/login`, com validação autenticada da UI
hospedada pendente. O formulário após login cria a primeira clínica draft/owner na API. O
onboarding real fica em `/clinics/:clinicId/onboarding`: salva cada etapa, permite retomada e
conclui a clínica. A home dessa clínica mostra ocupações, serviços, profissionais e código reais.
A landing e o onboarding visual em `/`, bem como `/dashboard`, continuam demonstrativos.

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

## Limites do protótipo público

O formulário público em `/` mantém estado apenas durante a sessão da página. O link de convite,
pagamentos e dados de `/dashboard` são demonstrações visuais. Nenhum dado dessas páginas é
enviado ao backend. O fluxo autenticado e persistente tem contrato próprio na ADR-011.

O primeiro lançamento recolhe nome, ocupações, serviços com preço/duração e profissionais sem
login. Salas, equipamentos, funcionamento especial, integrações e convites aguardam modelos
próprios. O código gerado não concede acesso à equipe.

## Próxima evolução

1. Extrair tokens Light e Glass para uma camada compartilhada quando o segundo tema tiver consumidor real.
2. Trocar dados fixos por contratos tipados e estados de carregamento, vazio e erro.
3. Expandir o acesso da equipe para convites, delegação e proteção do último proprietário.
4. Conectar busca/entrada por código no app cliente quando o fluxo de vínculo estiver definido.
5. Executar testes de contraste, teclado, telas pequenas e uso prolongado.
