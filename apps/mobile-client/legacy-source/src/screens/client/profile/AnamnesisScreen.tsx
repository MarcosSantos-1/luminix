import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../contexts/AuthContext';
import { getAnamnesis } from '../../../lib/api';
import { getApiErrorMessage } from '../../../types/commercial';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { brand } from '../../../theme/brand';
import { AnamnesisFlow } from '../../anamnesis/AnamnesisFlow';
import { formatBirthDateBr } from '../../../lib/anamnesisDates';

const LABELS: Record<string, string> = {
  fullName: 'Nome completo',
  diagnosedDisease: 'Doença diagnosticada',
  diagnosedDiseaseDetails: 'Quais doenças',
  medicalTreatment: 'Tratamento médico',
  medicalTreatmentDetails: 'Qual tratamento',
  physicalLimitation: 'Limitação física',
  physicalLimitationDetails: 'Detalhes da limitação',
  allergies: 'Alergias',
  allergiesDetails: 'Quais alergias',
  cosmeticAllergy: 'Alergia a cosméticos',
  cosmeticAllergyDetails: 'Quais cosméticos',
  aestheticReaction: 'Reação a procedimento',
  aestheticReactionDetails: 'Qual reação',
  continuousMedications: 'Medicamentos contínuos',
  continuousMedicationsDetails: 'Quais medicamentos',
  anticoagulants: 'Anticoagulantes',
  roacutan: 'Roacutan',
  roacutanSince: 'Roacutan desde',
  corticosteroids: 'Corticoides',
  pregnant: 'Gestação',
  pregnantWeeks: 'Semanas de gestação',
  breastfeeding: 'Amamentando',
  iud: 'DIU',
  birthControl: 'Anticoncepcional',
  pacemaker: 'Marcapasso',
  metalImplants: 'Implantes metálicos',
  metalImplantsDetails: 'Onde',
  cancerHistory: 'Histórico de câncer',
  cancerHistoryDetails: 'Detalhes',
  epilepsy: 'Epilepsia',
  diabetes: 'Diabetes',
  diabetesDetails: 'Tipo / controle',
  hypertension: 'Hipertensão',
  smoking: 'Fumo',
  alcohol: 'Álcool',
  physicalActivity: 'Atividade física',
  physicalActivityPerWeek: 'Vezes por semana',
  waterIntake: 'Ingestão de água',
  skinType: 'Tipo de pele',
  acne: 'Acne',
  spots: 'Manchas',
  spotsDetails: 'Onde ficam as manchas',
  previousAesthetic: 'Procedimentos anteriores',
  previousAestheticProcedures: 'Quais procedimentos',
  goals: 'Objetivos',
  otherGoal: 'Outro objetivo',
  regions: 'Regiões',
  mainGoal: 'Objetivo principal',
  objective: 'Objetivo',
};

const VALUE_LABELS: Record<string, string> = {
  yes: 'Sim',
  no: 'Não',
  unknown: 'Não sei',
  never: 'Nunca',
  socially: 'Socialmente',
  female: 'Feminino',
  male: 'Masculino',
  other: 'Outro',
  prefer_not: 'Prefiro não informar',
  low: 'Pouca',
  medium: 'Média',
  high: 'Alta',
  oily: 'Oleosa',
  dry: 'Seca',
  combination: 'Mista',
  sensitive: 'Sensível',
  suspect: 'Suspeita',
  rejuvenation: 'Rejuvenescimento',
  weight_loss: 'Emagrecimento',
  localized_fat: 'Gordura localizada',
  cellulite: 'Celulite',
  sagging: 'Flacidez',
  acne: 'Acne',
  spots: 'Manchas',
  hair_removal: 'Depilação',
  relaxation: 'Relaxamento',
  face: 'Rosto',
  abdomen: 'Abdômen',
  legs: 'Pernas',
  armpits: 'Axilas',
  groin: 'Virilha',
  back: 'Costas',
  full_body: 'Corpo todo',
  botox: 'Botox',
  filler: 'Preenchimento',
  laser: 'Laser',
  cleaning: 'Limpeza de pele',
  microneedling: 'Microagulhamento',
  peeling: 'Peeling',
};

type SectionMeta = {
  key: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  accentSoft: string;
  value: any;
  hideNegatives?: boolean;
};

export function AnamnesisScreen({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    setError(null);
    try {
      setData(await getAnamnesis(user.id));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const requestEdit = () => {
    if (!data) {
      setEditing(true);
      return;
    }
    Alert.alert(
      'Editar ficha de anamnese?',
      'A ficha contém dados clínicos. Só altere se quiser atualizar as informações. Ao salvar, as respostas atuais serão substituídas.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Habilitar edição', onPress: () => setEditing(true) },
      ],
    );
  };

  if (editing && user) {
    return (
      <AnamnesisFlow
        user={user}
        initialForm={data}
        onComplete={async () => {
          setEditing(false);
          await load();
        }}
      />
    );
  }

  const personal = data?.personalData || {};
  const fullName = personal.fullName || personal.name || '—';
  const birthDate = formatBirthDateBr(personal.birthDate) || personal.birthDate || '—';
  const sexLabel =
    personal.sex === 'female' || personal.sexo === 'feminino'
      ? 'Feminino'
      : personal.sex === 'male' || personal.sexo === 'masculino'
        ? 'Masculino'
        : personal.sex === 'other' || personal.sexo === 'outro'
          ? 'Outro'
          : personal.sex === 'prefer_not'
            ? 'Prefiro não informar'
            : null;
  const address = personal.address as
    | {
        street?: string;
        number?: string;
        complement?: string;
        neighborhood?: string;
        city?: string;
        state?: string;
        cep?: string;
      }
    | undefined;
  const addressLine = [address?.street, address?.number, address?.complement]
    .filter(Boolean)
    .join(', ');
  const addressCity = [
    address?.neighborhood,
    address?.city && address?.state ? `${address.city}/${address.state}` : address?.city,
    address?.cep,
  ]
    .filter(Boolean)
    .join(' · ');

  const detailSections: SectionMeta[] = data
    ? [
        {
          key: 'health',
          title: 'Saúde',
          icon: 'heart',
          accent: brand.roseDeep,
          accentSoft: '#f3f4f6',
          value: data.healthData,
          hideNegatives: true,
        },
        {
          key: 'lifestyle',
          title: 'Estilo de vida & pele',
          icon: 'leaf',
          accent: '#9a6b3c',
          accentSoft: '#f3f4f6',
          value: data.lifestyleData,
        },
        {
          key: 'objectives',
          title: 'Objetivos',
          icon: 'flower',
          accent: '#8a6d1f',
          accentSoft: '#f3f4f6',
          value: data.objectivesData,
        },
      ]
    : [];

  return (
    <View style={styles.container}>
      <ScreenHeader>
        <TouchableOpacity onPress={onBack} style={styles.back}>
          <Ionicons name="arrow-back" size={24} color={brand.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Ficha de Anamnese</Text>
        {data ? (
          <TouchableOpacity onPress={requestEdit} style={styles.back}>
            <Ionicons name="create-outline" size={20} color={brand.rose} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={load} style={styles.back}>
            <Ionicons name="refresh" size={20} color={brand.rose} />
          </TouchableOpacity>
        )}
      </ScreenHeader>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={brand.rose} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={brand.rose} />
          }
        >
          <View style={styles.info}>
            <Ionicons name="heart" size={20} color={brand.rose} />
            <Text style={styles.infoText}>
              Suas respostas ajudam a clínica a cuidar de você com mais segurança.
            </Text>
          </View>
          {error ? (
            <View style={styles.center}>
              <Text style={styles.error}>{error}</Text>
              <TouchableOpacity onPress={load}>
                <Text style={styles.retry}>Tentar novamente</Text>
              </TouchableOpacity>
            </View>
          ) : !data ? (
            <View style={styles.center}>
              <Ionicons name="document-text-outline" size={50} color="#d1d5db" />
              <Text style={styles.empty}>Você ainda não possui uma ficha preenchida.</Text>
              <Text style={styles.hint}>
                No primeiro acesso, o app abre o questionário completo para você.
              </Text>
              <TouchableOpacity style={styles.editBtn} onPress={requestEdit}>
                <Text style={styles.editBtnText}>Preencher agora</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity style={styles.editBtn} onPress={requestEdit}>
                <Ionicons name="create-outline" size={18} color={brand.white} />
                <Text style={styles.editBtnText}>Atualizar ficha</Text>
              </TouchableOpacity>
              <View style={styles.updated}>
                <Ionicons name="time-outline" size={15} color={brand.muted} />
                <Text style={styles.updatedText}>
                  Atualizada em {new Date(data.updatedAt).toLocaleDateString('pt-BR')}
                  {data.termsAccepted ? ' · Completa' : ' · Pendente'}
                </Text>
              </View>

              {/* Dados pessoais — só nome + nascimento */}
              <View style={styles.section}>
                <View style={[styles.sectionHeader, { backgroundColor: '#f3f4f6' }]}>
                  <View style={[styles.sectionIcon, { backgroundColor: '#ffffff' }]}>
                    <Ionicons name="person" size={16} color="#7c3aed" />
                  </View>
                  <Text style={[styles.sectionTitle, { color: '#5b21b6' }]}>Dados pessoais</Text>
                </View>
                <View style={styles.personalCard}>
                  <View style={styles.personalRow}>
                    <Text style={styles.personalLabel}>Nome completo</Text>
                    <Text style={styles.personalValue}>{String(fullName)}</Text>
                  </View>
                  <View style={styles.personalDivider} />
                  <View style={styles.personalRow}>
                    <Text style={styles.personalLabel}>Data de nascimento</Text>
                    <Text style={styles.personalValue}>{String(birthDate)}</Text>
                  </View>
                  {sexLabel ? (
                    <>
                      <View style={styles.personalDivider} />
                      <View style={styles.personalRow}>
                        <Text style={styles.personalLabel}>Sexo</Text>
                        <Text style={styles.personalValue}>{sexLabel}</Text>
                      </View>
                    </>
                  ) : null}
                  {addressLine ? (
                    <>
                      <View style={styles.personalDivider} />
                      <View style={styles.personalRow}>
                        <Text style={styles.personalLabel}>Endereço</Text>
                        <Text style={styles.personalValue}>
                          {addressLine}
                          {addressCity ? `\n${addressCity}` : ''}
                        </Text>
                      </View>
                    </>
                  ) : null}
                </View>
              </View>

              {detailSections.map((section) => {
                const entries = readableEntries(section.value, section.hideNegatives);
                return (
                  <View key={section.key} style={styles.section}>
                    <View style={[styles.sectionHeader, { backgroundColor: section.accentSoft }]}>
                      <View style={[styles.sectionIcon, { backgroundColor: brand.white }]}>
                        <Ionicons name={section.icon} size={16} color={section.accent} />
                      </View>
                      <Text style={[styles.sectionTitle, { color: section.accent }]}>
                        {section.title}
                      </Text>
                      <Text style={[styles.sectionCount, { color: section.accent }]}>
                        {entries.length}
                      </Text>
                    </View>
                    <View style={styles.card}>
                      {entries.length === 0 ? (
                        <Text style={styles.emptySection}>Nada relevante informado</Text>
                      ) : (
                        entries.map(([key, value], index) => (
                          <FieldRow
                            key={key}
                            label={labelFor(key)}
                            value={value}
                            isLast={index === entries.length - 1}
                            accent={section.accent}
                          />
                        ))
                      )}
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function FieldRow({
  label,
  value,
  isLast,
  accent,
}: {
  label: string;
  value: any;
  isLast: boolean;
  accent: string;
}) {
  const isBool = typeof value === 'boolean';
  const isYesNo =
    isBool || value === 'yes' || value === 'no' || value === true || value === false;
  const isArray = Array.isArray(value);

  return (
    <View style={[styles.row, !isLast && styles.rowBorder]}>
      <Text style={styles.label}>{label}</Text>
      {isArray ? (
        <View style={styles.chips}>
          {value.map((v: any) => (
            <View key={String(v)} style={[styles.chip, { backgroundColor: `${accent}18` }]}>
              <Text style={[styles.chipText, { color: accent }]}>
                {VALUE_LABELS[String(v)] || String(v)}
              </Text>
            </View>
          ))}
        </View>
      ) : isYesNo ? (
        <View
          style={[
            styles.chip,
            {
              backgroundColor:
                value === true || value === 'yes' ? '#d1fae5' : '#f3f4f6',
            },
          ]}
        >
          <Text
            style={[
              styles.chipText,
              {
                color:
                  value === true || value === 'yes' ? '#047857' : brand.muted,
              },
            ]}
          >
            {formatValue(value)}
          </Text>
        </View>
      ) : (
        <Text style={styles.value}>{formatValue(value)}</Text>
      )}
    </View>
  );
}

function readableEntries(value: any, hideNegatives = false): [string, any][] {
  if (!value || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value).filter(([k, v]) => {
    if (k === 'cpf') return false;
    if (v == null || v === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    if (hideNegatives) {
      if (v === false || v === 'no' || v === 'never') return false;
    }
    return true;
  });
}

function labelFor(key: string) {
  return (
    LABELS[key] ||
    key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^./, (l) => l.toUpperCase())
  );
}

function formatValue(value: any): string {
  if (Array.isArray(value)) {
    return value.length
      ? value.map((v) => VALUE_LABELS[String(v)] || String(v)).join(', ')
      : 'Não informado';
  }
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (value && typeof value === 'object') {
    return (
      Object.entries(value)
        .map(([k, v]) => `${labelFor(k)}: ${formatValue(v)}`)
        .join(' · ') || 'Não informado'
    );
  }
  const raw = String(value ?? '');
  return VALUE_LABELS[raw] || raw || 'Não informado';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '700', color: brand.ink },
  content: { padding: 16, paddingBottom: 40 },
  center: {
    flex: 1,
    minHeight: 300,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 26,
  },
  info: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  infoText: { flex: 1, color: brand.roseDeep, lineHeight: 18, fontSize: 13 },
  updated: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 14,
  },
  updatedText: { color: brand.muted, fontSize: 12 },
  section: { marginBottom: 14 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.7,
  },
  personalCard: {
    backgroundColor: brand.white,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: brand.border,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  personalRow: {
    paddingVertical: 10,
  },
  personalDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: brand.border,
  },
  personalLabel: { color: brand.muted, fontSize: 11, marginBottom: 2 },
  personalValue: { color: brand.ink, fontSize: 15, fontWeight: '700' },
  card: {
    backgroundColor: brand.white,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: brand.border,
  },
  row: {
    paddingVertical: 8,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: brand.border,
  },
  label: { color: brand.muted, fontSize: 11, marginBottom: 4 },
  value: { color: brand.ink, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptySection: {
    color: brand.muted,
    fontSize: 13,
    paddingVertical: 10,
    fontStyle: 'italic',
  },
  error: { color: '#b91c1c', textAlign: 'center' },
  retry: { color: brand.rose, fontWeight: '700', marginTop: 12 },
  empty: {
    color: brand.ink,
    fontSize: 17,
    textAlign: 'center',
    marginTop: 12,
  },
  hint: {
    color: brand.muted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
  },
  editBtn: {
    alignSelf: 'stretch',
    backgroundColor: brand.rose,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 2,
  },
  editBtnText: {
    color: brand.white,
    fontWeight: '600',
    fontSize: 15,
  },
});
