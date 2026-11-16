// Anamnesis script shared by the site and the app (ADR-030). One question per screen, grouped in
// short steps. Each space requires a level; a record of a higher level serves lower ones, and the
// steps already answered are never asked again unless the client wants to fill a fresh record.
//
//   Level I   basic: photo, sex, birth date, allergies            (salons, barbershops)
//   Level II  + health, medications, pregnancy, conditions        (nails, brows, waxing, tattoo)
//   Level III + body, habits, activity, skin, procedures, goals   (aesthetics, massage, chiropractic)

export type Level = 1 | 2 | 3
export type AnswerValue = string | boolean | number | string[]
export type Answers = Record<string, AnswerValue>

/** What the API stores for a record (account or space). */
export type AnamnesisRecord = {
  version: 2
  level: Level
  answeredAt: string
  answers: Answers
  photo: string
}

export type Option = { value: string; label: string }

export type Question =
  | { kind: 'choice'; key: string; label?: string; options: Option[] }
  | { kind: 'yesno'; key: string; label: string; details?: { key: string; placeholder: string } }
  | { kind: 'multi'; key: string; label?: string; options: Option[] }
  | {
      kind: 'toggles'
      label?: string
      items: { key: string; label: string; details?: { key: string; placeholder: string } }[]
    }
  | { kind: 'date'; key: string; label: string }
  | { kind: 'counter'; key: string; label: string; min: number; max: number; unit: string }
  | { kind: 'photo'; key: 'photo' }

export type Step = {
  id: string
  level: Level
  title: string
  subtitle: string
  /** Keys that must have an answer before moving on. */
  required: string[]
  questions: Question[]
  when?: (answers: Answers) => boolean
}

const yesNoUnknown: Option[] = [
  { value: 'no', label: 'Não' },
  { value: 'yes', label: 'Sim' },
  { value: 'unknown', label: 'Não sei' },
]
const habit: Option[] = [
  { value: 'never', label: 'Não' },
  { value: 'socially', label: 'Socialmente' },
  { value: 'yes', label: 'Sim, com frequência' },
]

export const steps: Step[] = [
  {
    id: 'photo',
    level: 1,
    title: 'Uma foto para reconhecerem você',
    subtitle: 'Rosto visível, sem filtro. Aparece na sua ficha e para a equipe na recepção.',
    required: ['photo'],
    questions: [{ kind: 'photo', key: 'photo' }],
  },
  {
    id: 'about',
    level: 1,
    title: 'Sobre você',
    subtitle: 'O básico para indicar os cuidados certos.',
    required: ['sex', 'birthDate'],
    questions: [
      {
        kind: 'choice',
        key: 'sex',
        label: 'Sexo biológico',
        options: [
          { value: 'female', label: 'Feminino' },
          { value: 'male', label: 'Masculino' },
        ],
      },
      { kind: 'date', key: 'birthDate', label: 'Data de nascimento' },
    ],
  },
  {
    id: 'allergies',
    level: 1,
    title: 'Você tem alguma alergia?',
    subtitle: 'Para deixar produtos e ambiente seguros para você.',
    required: ['allergies', 'cosmeticAllergy'],
    questions: [
      {
        kind: 'yesno',
        key: 'allergies',
        label: 'Alergia a remédios, alimentos ou materiais',
        details: { key: 'allergiesDetails', placeholder: 'Ex.: dipirona, látex, níquel' },
      },
      {
        kind: 'choice',
        key: 'cosmeticAllergy',
        label: 'Alergia a cosméticos ou esmaltes',
        options: yesNoUnknown,
      },
    ],
  },
  {
    id: 'health',
    level: 2,
    title: 'Alguma doença diagnosticada?',
    subtitle: 'Ajuda a evitar procedimentos que não combinam com o seu histórico.',
    required: ['diagnosedDisease', 'medicalTreatment'],
    questions: [
      {
        kind: 'yesno',
        key: 'diagnosedDisease',
        label: 'Doença diagnosticada',
        details: { key: 'diagnosedDiseaseDetails', placeholder: 'Qual?' },
      },
      {
        kind: 'yesno',
        key: 'medicalTreatment',
        label: 'Em tratamento médico agora',
        details: { key: 'medicalTreatmentDetails', placeholder: 'Qual tratamento?' },
      },
    ],
  },
  {
    id: 'medications',
    level: 2,
    title: 'Usa algum medicamento contínuo?',
    subtitle: 'Alguns remédios mudam cicatrização, sensibilidade e resultado.',
    required: ['continuousMedications'],
    questions: [
      {
        kind: 'yesno',
        key: 'continuousMedications',
        label: 'Medicamento de uso contínuo',
        details: { key: 'continuousMedicationsDetails', placeholder: 'Quais?' },
      },
      {
        kind: 'toggles',
        label: 'Marque se usa algum destes',
        items: [
          { key: 'anticoagulants', label: 'Anticoagulante' },
          { key: 'roacutan', label: 'Isotretinoína (Roacutan)' },
          { key: 'corticosteroids', label: 'Corticoide' },
        ],
      },
    ],
  },
  {
    id: 'moment',
    level: 2,
    title: 'Um momento especial?',
    subtitle: 'Gestação e amamentação mudam o que é seguro oferecer agora.',
    required: ['pregnant'],
    when: (answers) => answers.sex === 'female',
    questions: [
      {
        kind: 'choice',
        key: 'pregnant',
        label: 'Está grávida?',
        options: [
          { value: 'no', label: 'Não' },
          { value: 'yes', label: 'Sim' },
          { value: 'suspect', label: 'Suspeito' },
        ],
      },
      {
        kind: 'toggles',
        items: [
          { key: 'breastfeeding', label: 'Amamentando' },
          { key: 'birthControl', label: 'Uso anticoncepcional' },
        ],
      },
    ],
  },
  {
    id: 'attention',
    level: 2,
    title: 'Alguma condição de atenção?',
    subtitle: 'Checagens rápidas para proteger você durante o atendimento.',
    required: ['aestheticReaction'],
    questions: [
      {
        kind: 'toggles',
        label: 'Marque o que se aplica',
        items: [
          { key: 'diabetes', label: 'Diabetes' },
          { key: 'hypertension', label: 'Pressão alta' },
          { key: 'epilepsy', label: 'Epilepsia' },
        ],
      },
      {
        kind: 'yesno',
        key: 'aestheticReaction',
        label: 'Já teve reação a algum procedimento estético',
        details: { key: 'aestheticReactionDetails', placeholder: 'O que aconteceu?' },
      },
    ],
  },
  {
    id: 'body',
    level: 3,
    title: 'Seu corpo e histórico',
    subtitle: 'Importante para aparelhos, correntes e protocolos específicos.',
    required: ['physicalLimitation'],
    questions: [
      {
        kind: 'toggles',
        label: 'Marque o que se aplica',
        items: [
          { key: 'pacemaker', label: 'Marcapasso' },
          {
            key: 'metalImplants',
            label: 'Implante metálico ou prótese',
            details: { key: 'metalImplantsDetails', placeholder: 'Onde?' },
          },
          {
            key: 'cancerHistory',
            label: 'Histórico de câncer',
            details: { key: 'cancerHistoryDetails', placeholder: 'Qual e quando?' },
          },
        ],
      },
      {
        kind: 'yesno',
        key: 'physicalLimitation',
        label: 'Alguma limitação física',
        details: { key: 'physicalLimitationDetails', placeholder: 'Qual?' },
      },
    ],
  },
  {
    id: 'habits',
    level: 3,
    title: 'Como anda o seu ritmo?',
    subtitle: 'Fumo e álcool influenciam a pele e a recuperação. Sem julgamento.',
    required: ['smoking', 'alcohol'],
    questions: [
      { kind: 'choice', key: 'smoking', label: 'Fuma?', options: habit },
      { kind: 'choice', key: 'alcohol', label: 'Bebe?', options: habit },
    ],
  },
  {
    id: 'activity',
    level: 3,
    title: 'Movimento e hidratação',
    subtitle: 'Corpo ativo e hidratado responde melhor aos tratamentos.',
    required: ['physicalActivity', 'waterIntake'],
    questions: [
      { kind: 'yesno', key: 'physicalActivity', label: 'Pratica atividade física' },
      {
        kind: 'counter',
        key: 'activityPerWeek',
        label: 'Quantas vezes por semana?',
        min: 1,
        max: 7,
        unit: 'x',
      },
      {
        kind: 'choice',
        key: 'waterIntake',
        label: 'Quanta água bebe por dia?',
        options: [
          { value: 'low', label: 'Pouca' },
          { value: 'medium', label: '1 a 2 litros' },
          { value: 'high', label: 'Mais de 2 litros' },
        ],
      },
    ],
  },
  {
    id: 'skin',
    level: 3,
    title: 'Como você sente a sua pele?',
    subtitle: 'Não precisa ser técnica: a sua percepção já ajuda.',
    required: ['skinType'],
    questions: [
      {
        kind: 'choice',
        key: 'skinType',
        options: [
          { value: 'oily', label: 'Oleosa' },
          { value: 'dry', label: 'Seca' },
          { value: 'combination', label: 'Mista' },
          { value: 'sensitive', label: 'Sensível' },
          { value: 'unknown', label: 'Não sei' },
        ],
      },
      {
        kind: 'toggles',
        items: [
          { key: 'acne', label: 'Acne' },
          {
            key: 'spots',
            label: 'Manchas',
            details: { key: 'spotsDetails', placeholder: 'Onde?' },
          },
        ],
      },
    ],
  },
  {
    id: 'procedures',
    level: 3,
    title: 'Já fez procedimento estético?',
    subtitle: 'O que você já experimentou guia o próximo passo.',
    required: ['previousAesthetic'],
    questions: [
      { kind: 'yesno', key: 'previousAesthetic', label: 'Já fiz procedimento estético' },
      {
        kind: 'multi',
        key: 'previousProcedures',
        label: 'Quais?',
        options: [
          { value: 'botox', label: 'Botox' },
          { value: 'filler', label: 'Preenchimento' },
          { value: 'laser', label: 'Laser' },
          { value: 'cleaning', label: 'Limpeza de pele' },
          { value: 'microneedling', label: 'Microagulhamento' },
          { value: 'peeling', label: 'Peeling' },
          { value: 'other', label: 'Outros' },
        ],
      },
    ],
  },
  {
    id: 'goals',
    level: 3,
    title: 'O que você busca?',
    subtitle: 'Pode marcar mais de um.',
    required: [],
    questions: [
      {
        kind: 'multi',
        key: 'goals',
        label: 'Objetivos',
        options: [
          { value: 'rejuvenation', label: 'Rejuvenescimento' },
          { value: 'weight_loss', label: 'Emagrecimento' },
          { value: 'localized_fat', label: 'Gordura localizada' },
          { value: 'cellulite', label: 'Celulite' },
          { value: 'sagging', label: 'Flacidez' },
          { value: 'acne', label: 'Acne' },
          { value: 'spots', label: 'Manchas' },
          { value: 'hair_removal', label: 'Depilação' },
          { value: 'relaxation', label: 'Relaxamento' },
        ],
      },
      {
        kind: 'multi',
        key: 'regions',
        label: 'Regiões',
        options: [
          { value: 'face', label: 'Rosto' },
          { value: 'abdomen', label: 'Abdômen' },
          { value: 'legs', label: 'Pernas' },
          { value: 'arms', label: 'Braços' },
          { value: 'back', label: 'Costas' },
          { value: 'groin', label: 'Virilha' },
          { value: 'full_body', label: 'Corpo todo' },
        ],
      },
    ],
  },
]

export const levelNames: Record<Level, string> = {
  1: 'Ficha básica',
  2: 'Ficha de saúde',
  3: 'Ficha completa',
}

/** Days a record stays valid; basic records do not expire. */
export const validityDays: Record<Level, number | null> = { 1: null, 2: 365, 3: 365 }

const answered = (value: AnswerValue | undefined) =>
  value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)

/** Hidden conditional questions (details, counters) shown only when they make sense. */
export function questionVisible(question: Question, answers: Answers) {
  if (question.kind === 'counter') return answers.physicalActivity === 'yes'
  if (question.kind === 'multi' && question.key === 'previousProcedures')
    return answers.previousAesthetic === 'yes'
  return true
}

export function stepsFor(level: Level, answers: Answers) {
  return steps.filter((step) => step.level <= level && (!step.when || step.when(answers)))
}

export function stepComplete(step: Step, answers: Answers, photo?: string) {
  return step.required.every((key) => (key === 'photo' ? Boolean(photo) : answered(answers[key])))
}

/** Steps still unanswered for a level: what to ask when an existing record is reused. */
export function missingSteps(level: Level, answers: Answers, photo?: string) {
  return stepsFor(level, answers).filter((step) => !stepComplete(step, answers, photo))
}

export function expiresAt(record: Pick<AnamnesisRecord, 'level' | 'answeredAt'>) {
  const days = validityDays[record.level]
  return days ? new Date(Date.parse(record.answeredAt) + days * 86_400_000) : null
}

export type RecordState = 'missing' | 'incomplete' | 'expired' | 'ok'

/** Whether a record serves a space that needs `level`. */
export function recordState(
  record: AnamnesisRecord | null,
  level: Level,
  now = Date.now(),
): RecordState {
  if (!record) return 'missing'
  if (record.level < level || missingSteps(level, record.answers, record.photo).length)
    return 'incomplete'
  const expiry = expiresAt(record)
  return expiry && expiry.getTime() < now ? 'expired' : 'ok'
}

/** Records saved before version 2 (flat sex/birthDate/allergies/healthNotes). */
export function normalizeRecord(raw: unknown, photo: string | null): AnamnesisRecord | null {
  if (!raw || typeof raw !== 'object' || !photo) return null
  const value = raw as Record<string, unknown>
  if (value.version === 2 && value.answers && typeof value.answers === 'object')
    return {
      version: 2,
      level: ([1, 2, 3].includes(Number(value.level)) ? Number(value.level) : 1) as Level,
      answeredAt: String(value.answeredAt ?? new Date(0).toISOString()),
      answers: value.answers as Answers,
      photo,
    }
  const allergies = String(value.allergies ?? '').trim()
  return {
    version: 2,
    level: 1,
    answeredAt: String(value.answeredAt ?? new Date(0).toISOString()),
    answers: {
      ...(value.sex ? { sex: String(value.sex) } : {}),
      ...(value.birthDate ? { birthDate: String(value.birthDate) } : {}),
      allergies: allergies ? 'yes' : 'no',
      ...(allergies ? { allergiesDetails: allergies } : {}),
      cosmeticAllergy: 'unknown',
      ...(value.healthNotes ? { notes: String(value.healthNotes) } : {}),
    },
    photo,
  }
}

/** Minutes to fill the given steps, for the intro screen. */
export const minutesFor = (count: number) => Math.max(1, Math.round(count * 0.4))

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/**
 * Level a space asks for, from its services ("category name" texts). The API holds the
 * authoritative copy (`luminix.clinic_anamnesis_level`); this one previews it before linking.
 */
export function levelFromServices(texts: string[]): Level {
  let level: Level = 1
  for (const text of texts.map(fold)) {
    if (
      /(estetic|facial|corporal|massag|massot|quiropr|harmoniz|biomed|peeling|laser|drenag|limpeza de pele|microagulh)/.test(
        text,
      )
    )
      return 3
    if (
      /(unha|manicure|pedicure|nail|sobrancel|cilio|depil|tatu|tattoo|piercing|micropig|lash|cera)/.test(
        text,
      )
    )
      level = 2
  }
  return level
}
