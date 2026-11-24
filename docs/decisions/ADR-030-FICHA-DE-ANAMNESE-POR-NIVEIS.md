# ADR-030 — Ficha de anamnese por níveis, reaproveitada entre espaços

Status: Accepted (implementado: migration 0035, `packages/contracts`, site e app)

Data: 2026-11-16

## Contexto

Espaços diferentes precisam de fichas diferentes: um salão não pergunta sobre fumo ou atividade
física; uma clínica de estética precisa. A cliente não deve repetir foto, nascimento e alergias a
cada espaço, e fichas de saúde envelhecem.

## Decisão

- **Três níveis:** I básico (foto, sexo, nascimento, alergias); II saúde (doenças, tratamento,
  medicamentos, gestação, condições, reações); III completo (corpo e implantes, hábitos,
  atividade e água, pele, procedimentos anteriores, objetivos e regiões). Perguntas baseadas na
  ficha do Charme & Bela, sem CPF e endereço.
- **Nível do espaço:** `luminix.clinic_anamnesis_level` usa `clinic_profiles.anamnesis_level`
  quando definido e, senão, o maior nível entre os serviços ativos (estética, massagem,
  quiropraxia → III; unhas, sobrancelhas, cílios, depilação, tatuagem, piercing → II; demais → I).
- **Roteiro único:** `packages/contracts/src/anamnesis.ts` define etapas, perguntas, condições
  (ex.: gestação só para sexo feminino), níveis e validade. Site e app renderizam o mesmo roteiro,
  uma etapa por janela, com abertura e consentimento.
- **Reaproveitamento:** ao entrar em um espaço, a cliente escolhe "usar a ficha da conta" (só as
  etapas que faltam para o nível do espaço; a ficha da conta sobe de nível) ou "ficha só para este
  espaço" (preenche do zero e nada da conta é compartilhado).
- **Validade:** níveis II e III valem 365 dias; o nível I não vence. Vencida, a ficha reabre
  preenchida para confirmar ("Nada mudou, confirmar").
- **Servidor:** guarda `{version: 2, level, answeredAt, answers}`; valida forma e chaves
  obrigatórias de cada nível; recusa agendamento com ficha ausente, abaixo do nível ou vencida
  (`Record required` / `Record expired`). Fichas versão 1 continuam valendo para espaços nível I.

## Consequências

- O gestor ainda não escolhe o nível nem vê a ficha no admin (TD-012).
- Mudar uma pergunta obrigatória exige atualizar `requiredKeys` na API e o roteiro compartilhado.

## Quando revisar

Ao criar perguntas por espaço (adicionais escolhidas pelo gestor) ou a tela da ficha no admin.

## Revisão 2026-11-24 — perguntas opcionais e alertas (ADR-038)

Perguntas novas, todas opcionais (sem mudar `requiredKeys`): pressão baixa, sangramento,
queloide, herpes, trombose/varizes, doença de pele, alteração hormonal, sol recente, ácidos e os
objetivos rugas, olheiras e estrias. `anamnesisAlerts`/`anamnesisGoals` no mesmo roteiro alimentam
os alertas do admin.
