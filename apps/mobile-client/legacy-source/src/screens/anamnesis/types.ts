import { cpfDigits, maskCpf } from '../../lib/cpf';
import { birthDateToYmd, formatBirthDateBr } from '../../lib/anamnesisDates';
import { normalizePersonName } from '../../lib/userDisplay';

export type SexValue = 'female' | 'male' | 'other' | 'prefer_not';
export type YesNo = 'yes' | 'no';
export type YesNoUnknown = 'yes' | 'no' | 'unknown';
export type HabitFrequency = 'never' | 'socially' | 'yes';
export type WaterIntake = 'low' | 'medium' | 'high';
export type SkinType = 'oily' | 'dry' | 'combination' | 'sensitive' | 'unknown';
export type PregnancyStatus = 'no' | 'yes' | 'suspect';

export interface AnamnesisFormState {
  fullName: string;
  birthDate: string;
  sex: SexValue | null;
  phone: string;
  cpf: string;
  email: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  ibge: string;

  diagnosedDisease: YesNo | null;
  diagnosedDiseaseDetails: string;
  medicalTreatment: YesNo | null;
  medicalTreatmentDetails: string;
  physicalLimitation: YesNo | null;
  physicalLimitationDetails: string;

  allergies: YesNo | null;
  allergiesDetails: string;
  cosmeticAllergy: YesNoUnknown | null;
  cosmeticAllergyDetails: string;
  aestheticReaction: YesNo | null;
  aestheticReactionDetails: string;

  continuousMedications: YesNo | null;
  continuousMedicationsDetails: string;
  anticoagulants: boolean;
  roacutan: boolean;
  roacutanSince: string;
  corticosteroids: boolean;

  pregnant: PregnancyStatus | null;
  pregnantWeeks: string;
  breastfeeding: boolean;
  iud: boolean;
  birthControl: boolean;

  pacemaker: boolean;
  metalImplants: boolean;
  metalImplantsDetails: string;
  cancerHistory: boolean;
  cancerHistoryDetails: string;
  epilepsy: boolean;
  diabetes: boolean;
  diabetesDetails: string;
  hypertension: boolean;

  smoking: HabitFrequency | null;
  alcohol: HabitFrequency | null;
  physicalActivity: boolean;
  physicalActivityPerWeek: number;
  waterIntake: WaterIntake | null;

  skinType: SkinType | null;
  acne: boolean;
  spots: boolean;
  spotsDetails: string;
  previousAesthetic: boolean;
  previousAestheticProcedures: string[];

  goals: string[];
  otherGoal: string;
  regions: string[];

  consentTruth: boolean;
  consentUse: boolean;
  consentUpdate: boolean;
}

export type AnamnesisAction =
  | { type: 'PATCH'; payload: Partial<AnamnesisFormState> }
  | { type: 'TOGGLE_ARRAY'; field: 'goals' | 'regions' | 'previousAestheticProcedures'; value: string }
  | { type: 'RESET'; payload: AnamnesisFormState };

export function createInitialState(prefill?: {
  name?: string;
  email?: string;
  phone?: string;
  cpf?: string;
}): AnamnesisFormState {
  const looksPhone = (v?: string) => Boolean(v && /^\+?\d[\d\s().-]{7,}$/.test(v.trim()));
  return {
    fullName:
      prefill?.name && !looksPhone(prefill.name) ? normalizePersonName(prefill.name) : '',
    birthDate: '',
    sex: null,
    phone: prefill?.phone || '',
    cpf: prefill?.cpf ? maskCpf(prefill.cpf) : '',
    email: prefill?.email?.endsWith('@phone.charmebela.local') ? '' : prefill?.email || '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    ibge: '',

    diagnosedDisease: null,
    diagnosedDiseaseDetails: '',
    medicalTreatment: null,
    medicalTreatmentDetails: '',
    physicalLimitation: null,
    physicalLimitationDetails: '',

    allergies: null,
    allergiesDetails: '',
    cosmeticAllergy: null,
    cosmeticAllergyDetails: '',
    aestheticReaction: null,
    aestheticReactionDetails: '',

    continuousMedications: null,
    continuousMedicationsDetails: '',
    anticoagulants: false,
    roacutan: false,
    roacutanSince: '',
    corticosteroids: false,

    pregnant: null,
    pregnantWeeks: '',
    breastfeeding: false,
    iud: false,
    birthControl: false,

    pacemaker: false,
    metalImplants: false,
    metalImplantsDetails: '',
    cancerHistory: false,
    cancerHistoryDetails: '',
    epilepsy: false,
    diabetes: false,
    diabetesDetails: '',
    hypertension: false,

    smoking: null,
    alcohol: null,
    physicalActivity: false,
    physicalActivityPerWeek: 3,
    waterIntake: null,

    skinType: null,
    acne: false,
    spots: false,
    spotsDetails: '',
    previousAesthetic: false,
    previousAestheticProcedures: [],

    goals: [],
    otherGoal: '',
    regions: [],

    consentTruth: false,
    consentUse: false,
    consentUpdate: false,
  };
}

export function anamnesisReducer(
  state: AnamnesisFormState,
  action: AnamnesisAction,
): AnamnesisFormState {
  switch (action.type) {
    case 'PATCH':
      return { ...state, ...action.payload };
    case 'TOGGLE_ARRAY': {
      const current = state[action.field];
      const next = current.includes(action.value)
        ? current.filter((v) => v !== action.value)
        : [...current, action.value];
      return { ...state, [action.field]: next };
    }
    case 'RESET':
      return action.payload;
    default:
      return state;
  }
}

export const GOAL_OPTIONS = [
  { value: 'rejuvenation', label: 'Rejuvenescimento', emoji: '✨' },
  { value: 'weight_loss', label: 'Emagrecimento', emoji: '🌿' },
  { value: 'localized_fat', label: 'Gordura localizada', emoji: '💫' },
  { value: 'cellulite', label: 'Celulite', emoji: '🧡' },
  { value: 'sagging', label: 'Flacidez', emoji: '💪' },
  { value: 'acne', label: 'Acne', emoji: '🌸' },
  { value: 'spots', label: 'Manchas', emoji: '☀️' },
  { value: 'hair_removal', label: 'Depilação', emoji: '🕊️' },
  { value: 'relaxation', label: 'Relaxamento', emoji: '🧘' },
  { value: 'other', label: 'Outro', emoji: '💭' },
] as const;

export const REGION_OPTIONS = [
  { value: 'face', label: 'Rosto', emoji: '😊' },
  { value: 'abdomen', label: 'Abdômen', emoji: '🤍' },
  { value: 'legs', label: 'Pernas', emoji: '🦵' },
  { value: 'armpits', label: 'Axilas', emoji: '✨' },
  { value: 'groin', label: 'Virilha', emoji: '🌸' },
  { value: 'back', label: 'Costas', emoji: '🦋' },
  { value: 'full_body', label: 'Corpo todo', emoji: '💫' },
] as const;

export const PROCEDURE_OPTIONS = [
  { value: 'botox', label: 'Botox' },
  { value: 'filler', label: 'Preenchimento' },
  { value: 'laser', label: 'Laser' },
  { value: 'cleaning', label: 'Limpeza de pele' },
  { value: 'microneedling', label: 'Microagulhamento' },
  { value: 'peeling', label: 'Peeling' },
  { value: 'other', label: 'Outros' },
] as const;

export function toBackendPayload(state: AnamnesisFormState) {
  return {
    schemaVersion: 2,
    personalData: {
      fullName: normalizePersonName(state.fullName),
      birthDate: birthDateToYmd(state.birthDate) || state.birthDate.trim(),
      sex: state.sex,
      phone: state.phone.trim(),
      cpf: cpfDigits(state.cpf),
      email: state.email.trim(),
      address: {
        cep: state.cep.trim(),
        street: state.street.trim(),
        number: state.number.trim(),
        complement: state.complement.trim(),
        neighborhood: state.neighborhood.trim(),
        city: state.city.trim(),
        state: state.state.trim().toUpperCase(),
        ibge: state.ibge.trim(),
      },
    },
    healthData: {
      diagnosedDisease: state.diagnosedDisease,
      diagnosedDiseaseDetails: state.diagnosedDiseaseDetails.trim(),
      medicalTreatment: state.medicalTreatment,
      medicalTreatmentDetails: state.medicalTreatmentDetails.trim(),
      physicalLimitation: state.physicalLimitation,
      physicalLimitationDetails: state.physicalLimitationDetails.trim(),
      allergies: state.allergies,
      allergiesDetails: state.allergiesDetails.trim(),
      cosmeticAllergy: state.cosmeticAllergy,
      cosmeticAllergyDetails: state.cosmeticAllergyDetails.trim(),
      aestheticReaction: state.aestheticReaction,
      aestheticReactionDetails: state.aestheticReactionDetails.trim(),
      continuousMedications: state.continuousMedications,
      continuousMedicationsDetails: state.continuousMedicationsDetails.trim(),
      anticoagulants: state.anticoagulants,
      roacutan: state.roacutan,
      roacutanSince: state.roacutanSince.trim(),
      corticosteroids: state.corticosteroids,
      pregnant: state.sex === 'female' ? state.pregnant : null,
      pregnantWeeks:
        state.sex === 'female' && state.pregnant === 'yes' && state.pregnantWeeks
          ? Number(state.pregnantWeeks) || null
          : null,
      breastfeeding: state.sex === 'female' ? state.breastfeeding : false,
      iud: state.sex === 'female' ? state.iud : false,
      birthControl: state.sex === 'female' ? state.birthControl : false,
      pacemaker: state.pacemaker,
      metalImplants: state.metalImplants,
      metalImplantsDetails: state.metalImplantsDetails.trim(),
      cancerHistory: state.cancerHistory,
      cancerHistoryDetails: state.cancerHistoryDetails.trim(),
      epilepsy: state.epilepsy,
      diabetes: state.diabetes,
      diabetesDetails: state.diabetesDetails.trim(),
      hypertension: state.hypertension,
    },
    lifestyleData: {
      smoking: state.smoking,
      alcohol: state.alcohol,
      physicalActivity: state.physicalActivity,
      physicalActivityPerWeek: state.physicalActivity
        ? state.physicalActivityPerWeek
        : null,
      waterIntake: state.waterIntake,
      skinType: state.skinType,
      acne: state.acne,
      spots: state.spots,
      spotsDetails: state.spotsDetails.trim(),
      previousAesthetic: state.previousAesthetic,
      previousAestheticProcedures: state.previousAesthetic
        ? state.previousAestheticProcedures
        : [],
    },
    objectivesData: {
      goals: state.goals,
      otherGoal: state.otherGoal.trim(),
      regions: state.regions,
    },
    termsAccepted: state.consentTruth && state.consentUse && state.consentUpdate,
  };
}

/** Hydrate wizard state from a saved AnamnesisForm (edit mode). */
export function fromBackendForm(
  form: any,
  prefill?: { name?: string; email?: string; phone?: string; cpf?: string },
): AnamnesisFormState {
  const base = createInitialState(prefill);
  if (!form) return base;
  const p = form.personalData || {};
  const h = form.healthData || {};
  const l = form.lifestyleData || {};
  const o = form.objectivesData || {};

  return {
    ...base,
    fullName: normalizePersonName(p.fullName || p.name || base.fullName),
    birthDate: formatBirthDateBr(p.birthDate) || '',
    sex: (() => {
      const raw = String(p.sex || p.sexo || '').toLowerCase();
      const map: Record<string, SexValue> = {
        female: 'female',
        male: 'male',
        other: 'other',
        prefer_not: 'prefer_not',
        feminino: 'female',
        masculino: 'male',
        outro: 'other',
      };
      return map[raw] ?? null;
    })(),
    phone: p.phone || base.phone,
    cpf: maskCpf(p.cpf || base.cpf),
    email: p.email && !String(p.email).endsWith('@phone.charmebela.local') ? p.email : base.email,
    cep: (() => {
      const digits = String(p.address?.cep || '').replace(/\D/g, '').slice(0, 8);
      if (digits.length <= 5) return digits;
      return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    })(),
    street: p.address?.street || '',
    number: p.address?.number || '',
    complement: p.address?.complement || '',
    neighborhood: p.address?.neighborhood || '',
    city: p.address?.city || '',
    state: String(p.address?.state || '').toUpperCase(),
    ibge: String(p.address?.ibge || '').replace(/\D/g, ''),

    diagnosedDisease: h.diagnosedDisease ?? null,
    diagnosedDiseaseDetails: h.diagnosedDiseaseDetails || '',
    medicalTreatment: h.medicalTreatment ?? null,
    medicalTreatmentDetails: h.medicalTreatmentDetails || '',
    physicalLimitation: h.physicalLimitation ?? null,
    physicalLimitationDetails: h.physicalLimitationDetails || '',

    allergies: h.allergies ?? null,
    allergiesDetails: h.allergiesDetails || '',
    cosmeticAllergy: h.cosmeticAllergy ?? null,
    cosmeticAllergyDetails: h.cosmeticAllergyDetails || '',
    aestheticReaction: h.aestheticReaction ?? null,
    aestheticReactionDetails: h.aestheticReactionDetails || '',

    continuousMedications: h.continuousMedications ?? h.medications ?? null,
    continuousMedicationsDetails:
      h.continuousMedicationsDetails || h.medicationsDetails || '',
    anticoagulants: Boolean(h.anticoagulants),
    roacutan: Boolean(h.roacutan),
    roacutanSince: h.roacutanSince || '',
    corticosteroids: Boolean(h.corticosteroids),

    pregnant: h.pregnant ?? null,
    pregnantWeeks: h.pregnantWeeks != null ? String(h.pregnantWeeks) : '',
    breastfeeding: Boolean(h.breastfeeding === true || h.breastfeeding === 'yes'),
    iud: Boolean(h.iud),
    birthControl: Boolean(h.birthControl === true || h.birthControl === 'yes'),

    pacemaker: Boolean(h.pacemaker),
    metalImplants: Boolean(h.metalImplants || h.metalImplant),
    metalImplantsDetails: h.metalImplantsDetails || '',
    cancerHistory: Boolean(h.cancerHistory),
    cancerHistoryDetails: h.cancerHistoryDetails || h.cancerDetails || '',
    epilepsy: Boolean(h.epilepsy),
    diabetes: Boolean(h.diabetes),
    diabetesDetails: h.diabetesDetails || '',
    hypertension: Boolean(h.hypertension),

    smoking: l.smoking ?? null,
    alcohol: l.alcohol ?? null,
    physicalActivity: Boolean(l.physicalActivity || l.exerciseActivity === 'yes'),
    physicalActivityPerWeek: l.physicalActivityPerWeek ?? 3,
    waterIntake: l.waterIntake ?? null,

    skinType: l.skinType ?? null,
    acne: Boolean(l.acne),
    spots: Boolean(l.spots),
    spotsDetails: l.spotsDetails || '',
    previousAesthetic: Boolean(l.previousAesthetic),
    previousAestheticProcedures: Array.isArray(l.previousAestheticProcedures)
      ? l.previousAestheticProcedures
      : [],

    goals: Array.isArray(o.goals) ? o.goals : [],
    otherGoal: o.otherGoal || '',
    regions: Array.isArray(o.regions) ? o.regions : [],

    consentTruth: Boolean(form.termsAccepted),
    consentUse: Boolean(form.termsAccepted),
    consentUpdate: Boolean(form.termsAccepted),
  };
}
