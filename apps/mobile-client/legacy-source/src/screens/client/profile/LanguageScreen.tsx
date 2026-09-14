import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../../components/ScreenHeader';

const LANGUAGES = [
  { code: 'pt-BR', name: 'Português (Brasil)', flag: '🇧🇷', selected: true },
  { code: 'en-US', name: 'English (US)', flag: '🇺🇸', selected: false },
  { code: 'es-ES', name: 'Español', flag: '🇪🇸', selected: false },
];

export function LanguageScreen({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.container}>
      <ScreenHeader>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Idioma</Text>
        <View style={styles.placeholder} />
      </ScreenHeader>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Current Language */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Idioma Atual</Text>
          <View style={styles.currentLanguage}>
            <Text style={styles.flag}>🇧🇷</Text>
            <View style={styles.languageInfo}>
              <Text style={styles.languageName}>Português (Brasil)</Text>
              <Text style={styles.languageSubtitle}>Idioma selecionado</Text>
            </View>
            <Ionicons name="checkmark-circle" size={24} color="#10b981" />
          </View>
        </View>

        {/* Available Languages */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Idiomas Disponíveis</Text>
          
          {LANGUAGES.map((language) => (
            <TouchableOpacity 
              key={language.code} 
              style={[
                styles.languageItem,
                language.selected && styles.languageItemSelected
              ]}
            >
              <Text style={styles.flag}>{language.flag}</Text>
              <View style={styles.languageInfo}>
                <Text style={[
                  styles.languageName,
                  language.selected && styles.languageNameSelected
                ]}>
                  {language.name}
                </Text>
                <Text style={styles.languageSubtitle}>
                  {language.selected ? 'Idioma atual' : 'Disponível'}
                </Text>
              </View>
              {language.selected ? (
                <Ionicons name="checkmark-circle" size={24} color="#10b981" />
              ) : (
                <Ionicons name="chevron-forward" size={20} color="#d1d5db" />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Info */}
        <View style={styles.infoSection}>
          <View style={styles.infoIcon}>
            <Ionicons name="information-circle" size={24} color="#6366f1" />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Sobre as traduções</Text>
            <Text style={styles.infoText}>
              Algumas funcionalidades podem não estar disponíveis em todos os idiomas. 
              O conteúdo dos procedimentos e informações da clínica permanecem em português.
            </Text>
          </View>
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
    color: '#111827',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: 'white',
    marginTop: 20,
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    padding: 20,
    paddingBottom: 12,
    backgroundColor: '#f9fafb',
  },
  currentLanguage: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  languageItemSelected: {
    backgroundColor: '#f0fdf4',
  },
  flag: {
    fontSize: 24,
    marginRight: 16,
  },
  languageInfo: {
    flex: 1,
  },
  languageName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  languageNameSelected: {
    color: '#10b981',
    fontWeight: '600',
  },
  languageSubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  infoSection: {
    flexDirection: 'row',
    backgroundColor: 'white',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e7ff',
  },
  infoIcon: {
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366f1',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
});
