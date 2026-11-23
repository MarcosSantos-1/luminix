# ADR-036 — Tipo do espaço e avaliação de primeira visita

Status: Accepted para o tipo do espaço e a marcação das avaliações (migration 0062). Proposed
para o fluxo de primeira visita pelo site (seção "Fluxo pelo site").

Data: 2026-11-23

## Contexto

O painel falava de forma genérica ("sua clínica", "seu espaço"), mesmo para um Studio de tatuagem
ou um salão. O nome também ficava solto: "Luniere", em vez de "Studio Luniere".

No catálogo, alguns itens não são tratamentos. São a avaliação ou a consulta que vem antes deles:

| Área                    | Item                        | Sugestão            |
| ----------------------- | --------------------------- | ------------------- |
| Estética facial         | Avaliação facial            | 30 min · R$ 0       |
| Estética corporal       | Avaliação corporal          | 30 min · R$ 0       |
| Massagem e Massoterapia | Avaliação em massoterapia   | 30 min · R$ 80      |
| Biomedicina             | Avaliação estética avançada | 1 h · R$ 150        |
| Quiropraxia             | Avaliação quiroprática      | 1 h · R$ 180        |
| Tatuagem                | Consulta para tatuagem      | 30 min · a combinar |
| Piercing                | Avaliação para piercing     | 30 min · R$ 0       |

Uma clínica de estética avançada precisa avaliar antes de qualquer procedimento, e um Studio de
tatuagem precisa de uma conversa antes de reservar a sessão. Um salão de cabelo não precisa.

## Decisão

### Tipo do espaço

- `clinics.space_kind`: `studio`, `clinica`, `salao`, `spa` ou `espaco`. É escolhido na etapa
  Espaço do onboarding (obrigatório para seguir) e pode ser trocado em Configurações → Dados do
  espaço.
- **Nome exibido:** a ativação grava o nome com o tipo na frente (trigger
  `compose_active_clinic_name`). "Luniere" com Studio vira "Studio Luniere", e um nome que já
  começa com o tipo é mantido. Trocar o tipo nas configurações troca o prefixo
  (`set_clinic_space_kind`): "Studio Luniere" vira "Clínica Luniere".
- **Textos:** `apps/admin/lib/space-kind.tsx` faz a concordância
  (sua clínica / seu Studio / do salão / no SPA). O componente `SpaceCopyEffect` aplica essa
  concordância à página inteira, modais incluídos, enquanto o painel ou o onboarding estão
  abertos. Os textos do código continuam genéricos, e não é preciso mexer em cada frase.
  Campos de digitação e elementos com `data-no-space-copy` não são alterados.

### Avaliação de primeira visita

- O catálogo marca esses itens com `avaliacao: true`. No onboarding, cada área mostra a sua
  avaliação em um card próprio, antes dos tratamentos, com a explicação. Ela fica fora do
  "Marcar todos", porque oferecer avaliação é uma escolha.
- `services.is_evaluation` é marcado na conclusão do onboarding a partir do rascunho.
- A avaliação continua sendo um serviço ativo e agendável pela equipe. Ela **sai só da listagem
  de serviços** do painel, que mostra uma nota explicando onde ela está.

## Fluxo pelo site (proposta, a decidir)

O objetivo é que a pessoa que encontra o site do espaço marque a primeira visita pelo Luminix,
sem precisar chamar no WhatsApp:

1. No site, a pessoa escolhe entre **agendar um tratamento direto** e **começar pela avaliação
   ou consulta**. Para áreas que exigem avaliação, o site pode sugerir começar por ela.
2. **Acesso rápido:** quem já tem conta entra. Quem não tem cria a conta com Google ou Apple,
   que trazem nome, e-mail e foto. Depois completa o mínimo: celular, data de nascimento e,
   se a foto não veio ou se quiser trocar, uma foto.
3. A pessoa escolhe data e horário, com as mesmas regras de horários livres da ADR-029.
4. O Luminix confirma por e-mail e, no futuro, por telefone/WhatsApp. Depois manda o lembrete
   de confirmação da consulta.
5. No espaço, a equipe pode pedir a anamnese (ADR-030). Se a pessoa já tem uma ficha completa
   na conta, ela pode liberar essa ficha para o espaço ou preencher de novo.

Em aberto:

- Se a avaliação pode ser obrigatória antes de certos tratamentos (por área ou por serviço) ou
  se é só uma sugestão.
- Avaliação paga: cobrar no app, cobrar no espaço ou abater do primeiro tratamento.
- Login com Google/Apple no Firebase (hoje só e-mail e senha, ADR-027/029) e quais dados pedir.
- Lembretes por WhatsApp/SMS: provedor, custo e consentimento (ADR de jobs/integrações).
- Como a avaliação aparece na vitrine pública (destaque por área, botão próprio).

## Alternativas consideradas

- **Reescrever as frases uma a uma com o tipo:** são mais de 200 frases entre painel e
  onboarding, e qualquer texto novo voltaria a ser genérico. A concordância aplicada na página
  cobre tudo, inclusive textos futuros.
- **Guardar só o nome digitado e montar "Studio Luniere" na exibição:** o nome aparece em
  e-mails, site, app do cliente e busca pública. Gravar o nome composto evita que cada um desses
  lugares precise repetir a regra.
- **Apagar a avaliação do painel:** a equipe ainda precisa marcar avaliações pela agenda e
  ajustar valor e duração.

## Consequências

- Espaços já ativos ficam sem tipo até alguém escolher em Configurações, e o texto continua
  genérico até lá.
- Conteúdo digitado pela equipe e exibido em texto (observações, por exemplo) também passa pela
  concordância. Onde isso não for desejado, marcar com `data-no-space-copy`.
- Adjetivos soltos não mudam de gênero ("uma clínica nova" vira "um Studio nova"). Hoje os
  textos não têm esse caso.
- Ainda não existe tela para editar valor e duração das avaliações depois do onboarding, porque
  elas saíram da listagem. Isso deve ser resolvido junto com o fluxo pelo site.

## Quando revisar

Ao implementar o fluxo de primeira visita no site, o login social ou os lembretes por telefone.
