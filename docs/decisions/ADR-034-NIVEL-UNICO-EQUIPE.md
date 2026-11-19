# ADR-034 — Recepção e Profissional viram um nível só: Equipe

- Data: 2026-11-19
- Estado: implementado (migration 0053)
- Substitui parcialmente: [ADR-033](ADR-033-NIVEIS-DE-ACESSO-E-LINK-MAGICO.md) (dois níveis
  ajustáveis, Recepção e Profissional)

## Contexto

O ADR-033 deixou quatro níveis, dois deles com oito interruptores cada e padrões diferentes. Na
maioria dos espaços pequenos a recepcionista e a profissional são a mesma pessoa. A dona tinha
que escolher entre dois níveis que na prática significam o mesmo, e a tela de Acessos ficou com
cinco cards e um seletor de nível.

## Decisão

- Níveis: Proprietária (`owner`), Gerente (`manager`) e Equipe (`team`). O convite oferece só
  Gerente ou Equipe.
- Equipe = base fixa (`client:read`, `agenda:read`, `media:read`) + a mesma lista fechada de
  opções do ADR-033, agora com um padrão único:

| Opção                        | Padrão |
| ---------------------------- | ------ |
| Marcar/remarcar atendimentos | sim    |
| Cadastrar/editar clientes    | sim    |
| Serviços, pacotes, promoções | sim    |
| Estoque                      | sim    |
| Enviar mídias                | sim    |
| Horários e dias fechados     | sim    |
| Marketing                    | não    |
| Férias e afastamentos        | não    |

- Financeiro, relatórios, configurações, acessos, pagamentos, auditoria e onboarding continuam
  fora da lista. `set_role_option` aceita só `team`; a tabela `role_permission_choices` só aceita
  `team`.
- Tela de Acessos: três cards (pessoas, dar acesso, "O que a Equipe pode fazer"). O passo a passo
  do convite virou a descrição do card de convite.
- Regras mantidas: só a proprietária dá, muda ou tira gerente; ninguém altera o próprio acesso.

## Migração (0053)

- Quem era Recepção ou Profissional passa a Equipe. Os papéis antigos e suas permissões são
  removidos.
- Para não tirar acesso de ninguém, em cada clínica existente uma opção da Equipe começa ligada se
  estava ligada para Recepção **ou** Profissional (escolha da clínica ou padrão antigo). Por isso
  clínicas existentes tendem a ter marketing ligado (padrão antigo do Profissional); clínicas novas
  começam com marketing desligado.
- Teste: `apps/api/tests/team-level-migration.test.ts` aplica até a 0052, cria membros nos níveis
  antigos e confere a migração.

## Consequências

- Exceção por pessoa ("só a Carla vê X") continua possível depois como ajuste sobre o nível, sem
  voltar a ter mais níveis.
- Membros vindos de Recepção podem ganhar o que só o Profissional tinha (e vice-versa). Aceitável na
  fase sem clientes reais; a dona desliga em Configurações → Acessos.
- Equipe ainda vê a agenda inteira, não só os próprios atendimentos (TD-010 do ADR-023).
