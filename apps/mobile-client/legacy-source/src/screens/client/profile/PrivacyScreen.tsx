import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../../components/ScreenHeader';
import type { ClinicInfo } from '../../../constants/clinicInfo';
import { brand } from '../../../theme/brand';

function openUrl(url: string) {
  Linking.openURL(url).catch(() => {});
}

export function PrivacyScreen({ onBack, clinic }: { onBack: () => void; clinic: ClinicInfo }) {

  return (
    <View style={styles.container}>
      <ScreenHeader>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={brand.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacidade</Text>
        <View style={styles.placeholder} />
      </ScreenHeader>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.overviewCard}>
          <View style={styles.overviewIcon}>
            <Ionicons name="shield-checkmark" size={32} color="#10b981" />
          </View>
          <Text style={styles.overviewTitle}>Seus dados na {clinic.name}</Text>
          <Text style={styles.overviewText}>
            Este app é da clínica {clinic.name}. Tratamos seus dados conforme a LGPD, com
            acesso restrito à equipe da clínica e aos sistemas necessários para agendar,
            pagar e realizar seus procedimentos com segurança.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>O que coletamos</Text>

          <DataRow
            icon="person"
            title="Conta e identificação"
            description="Nome, e-mail (quando houver) e telefone — via Google, Apple ou SMS"
          />
          <DataRow
            icon="document-text"
            title="Ficha de anamnese"
            description="Saúde, estilo de vida, pele e objetivos — para segurança dos procedimentos"
          />
          <DataRow
            icon="calendar"
            title="Agendamentos e histórico"
            description="Procedimentos marcados, realizados, origem (plano/avulso) e status"
          />
          <DataRow
            icon="card"
            title="Pagamentos"
            description="Assinatura e cobranças avulsas processadas pelo Asaas (não armazenamos o cartão no app)"
          />
          <DataRow
            icon="phone-portrait"
            title="Uso do app"
            description="Informações técnicas básicas para login, sincronização e estabilidade"
            last
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Como usamos</Text>
          <UsageRow title="Agendamentos" text="Marcar, confirmar e acompanhar seus horários" />
          <UsageRow
            title="Segurança nos procedimentos"
            text="A equipe usa a anamnese para indicar ou adaptar tratamentos"
          />
          <UsageRow
            title="Planos e pagamentos"
            text="Gerenciar assinatura Club, cobranças e comprovantes via Asaas"
          />
          <UsageRow
            title="Comunicação"
            text="Lembretes e contato da clínica sobre seus atendimentos"
            last
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seus direitos (LGPD)</Text>
          <Text style={styles.rightsIntro}>
            Você pode solicitar acesso, correção, exclusão ou portabilidade dos seus dados.
            Também pode tirar dúvidas sobre o tratamento das informações.
          </Text>
          <View style={styles.rightsList}>
            <Text style={styles.rightBullet}>• Acessar e revisar dados no app (Perfil e Anamnese)</Text>
            <Text style={styles.rightBullet}>• Corrigir telefone e data de nascimento em Dados Pessoais</Text>
            <Text style={styles.rightBullet}>• Pedir exclusão ou cópia dos dados pelo canal abaixo</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fale sobre privacidade</Text>

          <TouchableOpacity
            style={styles.contactButton}
            onPress={() =>
              openUrl(
                `mailto:${clinic.contactEmail}?subject=${encodeURIComponent('Privacidade / LGPD — App Charme & Bela')}`
              )
            }
          >
            <View style={[styles.contactIcon, { backgroundColor: brand.rose }]}>
              <Ionicons name="mail" size={22} color="white" />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactTitle}>E-mail da clínica</Text>
              <Text style={styles.contactSubtitle}>{clinic.contactEmail}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.contactButton}
            onPress={() => {
              const msg = encodeURIComponent(
                'Olá! Gostaria de falar sobre privacidade / meus dados no app.'
              );
              Linking.openURL(
                `whatsapp://send?phone=${clinic.whatsappE164}&text=${msg}`
              ).catch(() => openUrl(`https://wa.me/${clinic.whatsappE164}?text=${msg}`));
            }}
          >
            <View style={[styles.contactIcon, { backgroundColor: '#25d366' }]}>
              <Ionicons name="logo-whatsapp" size={22} color="white" />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactTitle}>WhatsApp</Text>
              <Text style={styles.contactSubtitle}>{clinic.whatsappDisplay}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{clinic.name} · App do cliente</Text>
          <Text style={styles.footerText}>
            {clinic.addressLine1}, {clinic.addressLine2} — {clinic.cityState}
          </Text>
          <Text style={styles.footerText}>Última atualização: agosto de 2026</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function DataRow({
  icon,
  title,
  description,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.dataItem, last && styles.dataItemLast]}>
      <View style={styles.dataIcon}>
        <Ionicons name={icon} size={20} color={brand.rose} />
      </View>
      <View style={styles.dataInfo}>
        <Text style={styles.dataTitle}>{title}</Text>
        <Text style={styles.dataDescription}>{description}</Text>
      </View>
    </View>
  );
}

function UsageRow({
  title,
  text,
  last,
}: {
  title: string;
  text: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.usageItem, last && styles.dataItemLast]}>
      <Text style={styles.usageTitle}>{title}</Text>
      <Text style={styles.usageText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: brand.background,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: brand.blush,
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
  overviewCard: {
    marginTop: 16,
    marginHorizontal: 20,
    alignItems: 'center',
    padding: 22,
    backgroundColor: '#f0fdf4',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  overviewIcon: {
    marginBottom: 12,
  },
  overviewTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: brand.ink,
    marginBottom: 8,
    textAlign: 'center',
  },
  overviewText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 21,
  },
  section: {
    backgroundColor: brand.white,
    marginTop: 16,
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: brand.border,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: brand.ink,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  dataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  dataItemLast: {
    borderBottomWidth: 0,
    paddingBottom: 16,
  },
  dataIcon: {
    width: 40,
    height: 40,
    backgroundColor: brand.blush,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  dataInfo: {
    flex: 1,
  },
  dataTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: brand.ink,
    marginBottom: 2,
  },
  dataDescription: {
    fontSize: 13,
    color: brand.muted,
    lineHeight: 18,
  },
  usageItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  usageTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: brand.ink,
    marginBottom: 3,
  },
  usageText: {
    fontSize: 13,
    color: brand.muted,
    lineHeight: 18,
  },
  rightsIntro: {
    paddingHorizontal: 16,
    fontSize: 13,
    color: brand.muted,
    lineHeight: 19,
    marginBottom: 8,
  },
  rightsList: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 6,
  },
  rightBullet: {
    fontSize: 13,
    color: brand.ink,
    lineHeight: 19,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  contactIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  contactInfo: {
    flex: 1,
  },
  contactTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: brand.ink,
    marginBottom: 2,
  },
  contactSubtitle: {
    fontSize: 13,
    color: brand.muted,
  },
  footer: {
    padding: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 4,
    textAlign: 'center',
  },
});
