import { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../../components/ScreenHeader';
import type { ClinicInfo } from '../../../constants/clinicInfo';
import { brand } from '../../../theme/brand';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type FaqItem = {
  id: string;
  question: string;
  answer: string;
  keywords?: string[];
};

type FaqCategory = {
  id: string;
  category: string;
  icon: keyof typeof Ionicons.glyphMap;
  questions: FaqItem[];
};

function faqItems(clinic: ClinicInfo): FaqCategory[] {
  return [
  {
    id: '1',
    category: 'Agendamentos',
    icon: 'calendar-outline',
    questions: [
      {
        id: '1-1',
        question: 'Como agendar um procedimento?',
        keywords: ['marcar', 'horário', 'booking', 'agenda'],
        answer:
          'No app, abra a aba Serviços, escolha o tratamento e toque em agendar. Selecione data e horário disponíveis e confirme. Com plano ativo, o procedimento pode ser descontado da sua cota mensal; sem plano, você pode pagar avulso pelo checkout seguro. Também dá para falar com a clínica pelo WhatsApp.',
      },
      {
        id: '1-2',
        question: 'Posso reagendar meu horário?',
        keywords: ['remarcar', 'mudar', 'trocar'],
        answer:
          'Sim. Na aba Agenda, toque no agendamento futuro e escolha Reagendar. Escolha um novo horário disponível. Se o app não permitir (por exemplo, muito perto do horário), fale com a clínica pelo WhatsApp para ajustar.',
      },
      {
        id: '1-3',
        question: 'Como cancelar um agendamento?',
        keywords: ['desmarcar', 'cancelamento'],
        answer:
          'Na Agenda, abra o horário e toque em Cancelar. O prazo aparece na hora (a gestora pode alterar). Com o prazo inteiro (ex.: 4h ou mais), avulso pago: reembolso em dinheiro ou crédito. Com menos que o prazo (ex.: 3h59), avulso não tem dinheiro de volta — só crédito; no plano, a sessão é perdida. Tratamento especial de máquina tem prazo maior (ex.: 24h): com menos que isso ainda há reembolso, mas com multa (ex.: 25%) e sem crédito.',
      },
      {
        id: '1-4',
        question: 'O que acontece se eu faltar?',
        keywords: ['falta', 'no-show', 'não compareci', 'atraso'],
        answer:
          'Se você não comparecer sem cancelar, o horário pode ser registrado como falta. Isso ajuda a clínica a organizar a agenda e, em alguns casos, pode afetar a disponibilidade ou regras do plano. Sempre que não puder vir, cancele ou remarque pelo app com o máximo de antecedência.',
      },
      {
        id: '1-5',
        question: 'Por que meu horário de pagamento expirou?',
        keywords: ['hold', 'checkout', 'pendente', '5 minutos'],
        answer:
          'Em agendamentos avulsos com pagamento online, o horário fica reservado por alguns minutos enquanto você conclui o pagamento. Se o tempo acabar sem confirmação, a reserva é liberada automaticamente e o horário volta a ficar disponível. Basta escolher outro horário e pagar dentro do prazo.',
      },
    ],
  },
  {
    id: '2',
    category: 'Planos e pagamentos',
    icon: 'card-outline',
    questions: [
      {
        id: '2-1',
        question: 'Como funciona o Charme & Bela Club?',
        keywords: ['assinatura', 'mensal', 'club', 'plano'],
        answer:
          'O Club é uma assinatura mensal com acesso a tratamentos incluídos no seu plano (Essencial, Plus ou Premium), com limite de procedimentos por mês (e regras semanais). Você agenda pelo app e o tratamento entra como uso do plano quando elegível. Detalhes do seu plano ficam em Perfil → Plano e Pagamentos.',
      },
      {
        id: '2-2',
        question: 'Posso cancelar ou pausar meu plano?',
        keywords: ['cancelar assinatura', 'pausar'],
        answer:
          'Sim. Em Plano e Pagamentos você pode cancelar a assinatura; o acesso costuma permanecer até o fim do período já pago. Também há opção de pausar, conforme as regras da clínica. Para pagar, ver faturas ou usar cartão, use o checkout seguro do Asaas na mesma tela.',
      },
      {
        id: '2-3',
        question: 'Os tratamentos não usados passam para o mês seguinte?',
        keywords: ['acumular', 'saldo', 'cota'],
        answer:
          'Não. A cota do plano é mensal: o que não for utilizado no mês não acumula para o próximo. Por isso vale a pena planejar seus horários na Agenda ao longo do mês.',
      },
      {
        id: '2-4',
        question: 'Como pagar um procedimento avulso?',
        keywords: ['avulso', 'stripe', 'cartão', 'single'],
        answer:
          'Ao agendar um serviço fora do plano (ou quando o plano não cobre aquele tratamento), o app abre o pagamento seguro. Conclua o checkout no prazo indicado. Depois da confirmação, o agendamento fica confirmado na sua Agenda.',
      },
      {
        id: '2-5',
        question: 'O que é um voucher?',
        keywords: ['cupom', 'benefício', 'cortesia'],
        answer:
          'Vouchers e créditos ficam na sua conta. Crédito em reais pode ser usado em vários procedimentos até zerar o saldo. Se tiver mais de um crédito, toque nos dois (ou em Unificar) para somar os valores num só. Tratamento cortesia ou desconto percentual segue a regra de cada voucher.',
      },
      {
        id: '2-6',
        question: 'Como funciona o reembolso se eu cancelar?',
        keywords: ['reembolso', 'estorno', 'crédito', 'pix'],
        answer:
          'O horário é liberado na hora. Avulso pago com o prazo cheio (ex.: 4h ou mais): você escolhe Pix/cartão de volta ou crédito. Com menos que o prazo (ex.: 3h59): sem dinheiro, só crédito. Máquina especial com menos que o prazo dela (ex.: 20h de 24h): reembolso com multa, sem crédito. Pix costuma voltar rápido; cartão pode levar até 10 dias úteis.',
      },
    ],
  },
  {
    id: '3',
    category: 'Procedimentos e anamnese',
    icon: 'fitness-outline',
    questions: [
      {
        id: '3-1',
        question: 'Preciso preencher a anamnese?',
        keywords: ['ficha', 'saúde', 'formulário'],
        answer:
          'Sim. A ficha de anamnese é necessária para a equipe avaliar segurança e contraindicações antes dos procedimentos. No primeiro acesso o app solicita o preenchimento; depois você pode atualizar em Perfil → Ficha de Anamnese.',
      },
      {
        id: '3-2',
        question: 'Quanto tempo dura cada procedimento?',
        keywords: ['duração', 'minutos', 'tempo'],
        answer:
          'A duração aparece em cada serviço (em geral entre 30 e 90 minutos, conforme o tratamento). No agendamento e no detalhe do horário você vê a duração prevista.',
      },
      {
        id: '3-3',
        question: 'Há contraindicações?',
        keywords: ['risco', 'gestante', 'alergia'],
        answer:
          'Sim. Gestação, alergias, uso de certos medicamentos e condições de saúde podem restringir alguns tratamentos. Por isso a anamnese é importante: a equipe usa essas informações para orientar o que é seguro para você.',
      },
      {
        id: '3-4',
        question: 'Onde vejo o histórico dos procedimentos?',
        keywords: ['histórico', 'passados', 'concluídos'],
        answer:
          'Em Perfil → Histórico você encontra os procedimentos concluídos, com filtros por período. Toque em um item para ver detalhes como data, duração e forma de pagamento.',
      },
    ],
  },
  {
    id: '4',
    category: 'Conta e acesso',
    icon: 'person-outline',
    questions: [
      {
        id: '4-1',
        question: 'Como entro no app?',
        keywords: ['login', 'google', 'apple', 'telefone', 'sms'],
        answer:
          'Você pode entrar com Google, Apple (quando disponível) ou telefone com código SMS. Não há senha do app: use sempre o mesmo método (ou vincule um segundo método em Dados Pessoais → Métodos de acesso).',
      },
      {
        id: '4-2',
        question: 'Perdi o acesso à minha conta. O que faço?',
        keywords: ['recuperar', 'bloquear', 'não consigo entrar'],
        answer:
          'Tente entrar novamente com o mesmo Google, Apple ou número de telefone usado no cadastro. Em Dados Pessoais você pode vincular Google, Apple ou Celular para facilitar. Se ainda não conseguir, fale com a clínica pelo WhatsApp informando seu nome e telefone/e-mail.',
      },
      {
        id: '4-3',
        question: 'Como atualizo meu telefone ou data de nascimento?',
        keywords: ['dados pessoais', 'perfil', 'editar'],
        answer:
          'Abra Perfil → Dados Pessoais, ajuste a data de nascimento e toque em Salvar. Para alterar seu celular, abra Métodos de acesso → Celular e confirme o código SMS. O nome da conta aparece como somente leitura.',
      },
    ],
  },
  {
    id: '5',
    category: 'Clínica e contato',
    icon: 'location-outline',
    questions: [
      {
        id: '5-1',
        question: 'Onde fica a Charme & Bela?',
        keywords: ['endereço', 'localização', 'mapa'],
        answer: `Estamos na ${clinic.addressLine1}, ${clinic.addressLine2} — ${clinic.cityState}. No app, toque no logo da clínica (Home ou Perfil) para ver mapa, Waze e Google.`,
      },
      {
        id: '5-2',
        question: 'Como falo com a clínica?',
        keywords: ['whatsapp', 'telefone', 'contato'],
        answer: `Pelo WhatsApp ${clinic.whatsappDisplay}, telefone ${clinic.phoneDisplay}, Instagram ${clinic.instagramHandle}, site ou e-mail ${clinic.contactEmail}. Use também Perfil → Fale Conosco.`,
      },
    ],
  },
  ];
}

const GUIDES = [
  {
    id: 'g1',
    title: 'Primeiros passos no app',
    body: '1) Entre com Google, Apple ou telefone.\n2) Complete a anamnese quando solicitado.\n3) Explore Serviços e escolha um tratamento.\n4) Agende na data disponível e acompanhe tudo na Agenda.',
  },
  {
    id: 'g2',
    title: 'Usando seu plano Club',
    body: 'Confira em Plano e Pagamentos quantos tratamentos ainda restam no mês. Ao agendar um serviço incluído, o app usa a cota do plano. Serviços fora do plano seguem como avulso com pagamento no checkout.',
  },
  {
    id: 'g3',
    title: 'Dia do procedimento',
    body: 'Chegue com alguns minutos de antecedência. Se precisar remarcar, faça pelo app o quanto antes. Em caso de sintomas novos ou mudanças de saúde, avise a equipe e atualize a anamnese.',
  },
];

type HelpCenterScreenProps = {
  onBack: () => void;
  clinic: ClinicInfo;
  onOpenPlan?: () => void;
  onOpenAnamnesis?: () => void;
  onOpenServices?: () => void;
  onOpenContact?: () => void;
};

export function HelpCenterScreen({
  onBack,
  clinic,
  onOpenPlan,
  onOpenAnamnesis,
  onOpenServices,
  onOpenContact,
}: HelpCenterScreenProps) {
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const faq = useMemo(() => faqItems(clinic), [clinic]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return faq;

    return faq.map((cat) => ({
      ...cat,
      questions: cat.questions.filter((item) => {
        const hay = [
          item.question,
          item.answer,
          cat.category,
          ...(item.keywords || []),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      }),
    })).filter((cat) => cat.questions.length > 0);
  }, [faq, query]);

  const filteredGuides = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GUIDES;
    return GUIDES.filter(
      (g) => g.title.toLowerCase().includes(q) || g.body.toLowerCase().includes(q)
    );
  }, [query]);

  const toggleFaq = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const totalMatches = filtered.reduce((acc, c) => acc + c.questions.length, 0);

  return (
    <View style={styles.container}>
      <ScreenHeader>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={brand.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Central de Ajuda</Text>
        <View style={styles.placeholder} />
      </ScreenHeader>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.searchContainer}>
          <View style={styles.searchInput}>
            <Ionicons name="search" size={20} color="#6b7280" />
            <TextInput
              style={styles.searchField}
              placeholder="Buscar ajuda..."
              placeholderTextColor="#9ca3af"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>
          {query.trim().length > 0 && (
            <Text style={styles.searchMeta}>
              {totalMatches + filteredGuides.length === 0
                ? 'Nenhum resultado'
                : `${totalMatches + filteredGuides.length} resultado${totalMatches + filteredGuides.length === 1 ? '' : 's'}`}
            </Text>
          )}
        </View>

        {!query.trim() && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ações rápidas</Text>

            <TouchableOpacity style={styles.quickAction} onPress={onOpenServices}>
              <View style={styles.quickActionIcon}>
                <Ionicons name="calendar-outline" size={24} color={brand.rose} />
              </View>
              <View style={styles.quickActionInfo}>
                <Text style={styles.quickActionTitle}>Agendar procedimento</Text>
                <Text style={styles.quickActionSubtitle}>Escolher serviço e horário</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickAction} onPress={onOpenPlan}>
              <View style={styles.quickActionIcon}>
                <Ionicons name="card-outline" size={24} color={brand.rose} />
              </View>
              <View style={styles.quickActionInfo}>
                <Text style={styles.quickActionTitle}>Gerenciar plano</Text>
                <Text style={styles.quickActionSubtitle}>Assinatura e pagamentos</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickAction, styles.quickActionLast]}
              onPress={onOpenAnamnesis}
            >
              <View style={styles.quickActionIcon}>
                <Ionicons name="document-text-outline" size={24} color={brand.rose} />
              </View>
              <View style={styles.quickActionInfo}>
                <Text style={styles.quickActionTitle}>Minha anamnese</Text>
                <Text style={styles.quickActionSubtitle}>Ver ou atualizar a ficha</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
            </TouchableOpacity>
          </View>
        )}

        {filteredGuides.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Guias rápidos</Text>
            {filteredGuides.map((guide, index) => (
              <View
                key={guide.id}
                style={[
                  styles.guideCard,
                  index === filteredGuides.length - 1 && styles.guideCardLast,
                ]}
              >
                <View style={styles.guideHeader}>
                  <Ionicons name="book-outline" size={18} color={brand.rose} />
                  <Text style={styles.guideTitle}>{guide.title}</Text>
                </View>
                <Text style={styles.guideBody}>{guide.body}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Perguntas frequentes</Text>

          {filtered.length === 0 ? (
            <View style={styles.emptyFaq}>
              <Text style={styles.emptyFaqText}>
                Nada encontrado para “{query.trim()}”. Tente outras palavras ou fale com a clínica.
              </Text>
            </View>
          ) : (
            filtered.map((category) => (
              <View key={category.id} style={styles.categoryContainer}>
                <View style={styles.categoryHeader}>
                  <Ionicons name={category.icon} size={16} color={brand.rose} />
                  <Text style={styles.categoryTitle}>{category.category}</Text>
                </View>

                {category.questions.map((item) => {
                  const open = expandedId === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.faqItem, open && styles.faqItemOpen]}
                      onPress={() => toggleFaq(item.id)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.faqQuestionRow}>
                        <Text style={styles.faqQuestion}>{item.question}</Text>
                        <Ionicons
                          name={open ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color="#9ca3af"
                        />
                      </View>
                      {open && <Text style={styles.faqAnswer}>{item.answer}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ainda precisa de ajuda?</Text>
          <TouchableOpacity style={styles.contactButton} onPress={onOpenContact}>
            <View style={styles.contactIcon}>
              <Ionicons name="chatbubbles-outline" size={24} color="white" />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactTitle}>Fale conosco</Text>
              <Text style={styles.contactSubtitle}>
                WhatsApp {clinic.whatsappDisplay}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: brand.ink,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingBottom: 32,
  },
  searchContainer: {
    padding: 20,
    paddingBottom: 8,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: brand.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 4,
    borderWidth: 1,
    borderColor: brand.border,
    gap: 12,
  },
  searchField: {
    flex: 1,
    fontSize: 16,
    color: brand.ink,
    paddingVertical: 8,
  },
  searchMeta: {
    marginTop: 8,
    fontSize: 12,
    color: brand.muted,
    fontWeight: '600',
  },
  section: {
    backgroundColor: brand.white,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: brand.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: brand.ink,
    padding: 16,
    paddingBottom: 10,
    backgroundColor: '#fafafa',
  },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  quickActionLast: {
    borderBottomWidth: 0,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    backgroundColor: '#f3f4f6',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  quickActionInfo: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: brand.ink,
    marginBottom: 2,
  },
  quickActionSubtitle: {
    fontSize: 13,
    color: brand.muted,
  },
  guideCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  guideCardLast: {
    borderBottomWidth: 0,
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  guideTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: brand.ink,
  },
  guideBody: {
    fontSize: 13,
    color: brand.muted,
    lineHeight: 20,
  },
  categoryContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    marginTop: 4,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: brand.rose,
  },
  faqItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    marginBottom: 8,
  },
  faqItemOpen: {
    backgroundColor: '#f3f4f6',
  },
  faqQuestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: brand.ink,
  },
  faqAnswer: {
    marginTop: 10,
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 20,
  },
  emptyFaq: {
    padding: 20,
  },
  emptyFaqText: {
    fontSize: 14,
    color: brand.muted,
    lineHeight: 20,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  contactIcon: {
    width: 48,
    height: 48,
    backgroundColor: brand.rose,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  contactInfo: {
    flex: 1,
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: brand.ink,
    marginBottom: 2,
  },
  contactSubtitle: {
    fontSize: 13,
    color: brand.muted,
  },
});
