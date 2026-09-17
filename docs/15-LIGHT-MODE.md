# Light Mode — base temporária

Status: a landing em `/` explica o cadastro e inicia a conta (Google ou e-mail). O onboarding real
fica em `/clinics/:clinicId/onboarding`: contato da gestora, rascunho por etapa, retomada e
conclusão. `/dashboard` continua demonstrativo.

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

- Landing com apresentação do cadastro e acesso Google/e-mail.
- Onboarding autenticado com contato, clínica, ocupações, serviços, profissionais e revisão.
- Campos vazios com placeholder; rascunho persistido no backend, inclusive WhatsApp e e-mail.
- Painel Light em `/dashboard` com dados de demonstração, identificado como tal.

## Limites do protótipo público

O formulário público em `/` agora autentica e abre o rascunho. `/dashboard` permanece visual.
Nenhum dado do dashboard demo é enviado ao backend. O fluxo autenticado e persistente tem contrato
próprio na ADR-011.

O primeiro lançamento recolhe contato da gestora, nome, ocupações, serviços com preço/duração e
profissionais sem login. Salas, equipamentos, funcionamento especial, integrações e convites
aguardam modelos próprios. O código gerado não concede acesso à equipe. Follow-up de rascunho
incompleto é consulta ao payload; disparo automático de WhatsApp ainda não existe.

## Próxima evolução

1. Extrair tokens Light e Glass para uma camada compartilhada quando o segundo tema tiver consumidor real.
2. Trocar dados fixos por contratos tipados e estados de carregamento, vazio e erro.
3. Expandir o acesso da equipe para convites, delegação e proteção do último proprietário.
4. Conectar busca/entrada por código no app cliente quando o fluxo de vínculo estiver definido.
5. Executar testes de contraste, teclado, telas pequenas e uso prolongado.
