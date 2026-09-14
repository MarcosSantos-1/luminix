import { View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { KeyboardForm, dismissKeyboard } from '../components/KeyboardForm';
import { useState } from 'react';

export function ExampleScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name || !email) {
      Alert.alert('Erro', 'Preencha todos os campos!');
      return;
    }

    setIsLoading(true);
    
    // Simula uma requisição
    setTimeout(() => {
      setIsLoading(false);
      Alert.alert(
        'Sucesso! 🎉',
        `Olá ${name}!\n\nSeu email ${email} foi cadastrado.`
      );
    }, 2000);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <KeyboardForm style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        {/* Header */}
        <View className="bg-gradient-to-r from-pink-500 to-purple-500 p-6">
          <Text className="text-white text-3xl font-bold">
            Exemplo de Tela
          </Text>
          <Text className="text-white text-base mt-2">
            Veja como criar uma tela completa
          </Text>
        </View>

        {/* Conteúdo */}
        <View className="p-6">
          {/* Formulário */}
          <Card title="📝 Cadastro" className="mb-6">
            <Input
              label="Nome completo"
              placeholder="Digite seu nome"
              value={name}
              onChangeText={setName}
              icon="👤"
            />
            <Input
              label="E-mail"
              placeholder="seu@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              icon="✉️"
            />
            <Button
              title="Cadastrar"
              onPress={() => {
                dismissKeyboard();
                void handleSubmit();
              }}
              isLoading={isLoading}
            />
          </Card>

          {/* Botões de Exemplo */}
          <Card title="🎨 Variantes de Botões" className="mb-6">
            <View className="space-y-3">
              <Button
                title="Botão Primary"
                onPress={() => Alert.alert('Primary', 'Botão primary clicado!')}
                variant="primary"
              />
              <Button
                title="Botão Secondary"
                onPress={() => Alert.alert('Secondary', 'Botão secondary clicado!')}
                variant="secondary"
              />
              <Button
                title="Botão Outline"
                onPress={() => Alert.alert('Outline', 'Botão outline clicado!')}
                variant="outline"
              />
            </View>
          </Card>

          {/* Card Clicável */}
          <Card
            title="📍 Card Clicável"
            onPress={() => Alert.alert('Card', 'Você clicou no card!')}
            className="mb-6"
          >
            <Text className="text-gray-600">
              Este card inteiro é clicável! Toque nele para ver a ação.
            </Text>
          </Card>

          {/* Dicas */}
          <View className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg mb-6">
            <Text className="text-blue-900 font-bold mb-2">
              💡 Dicas para React Native
            </Text>
            <Text className="text-blue-800 text-sm mb-2">
              • Use Alert.alert() ao invés de alert()
            </Text>
            <Text className="text-blue-800 text-sm mb-2">
              • Todos os textos devem estar dentro de &lt;Text&gt;
            </Text>
            <Text className="text-blue-800 text-sm mb-2">
              • TouchableOpacity para elementos clicáveis
            </Text>
            <Text className="text-blue-800 text-sm">
              • ScrollView para conteúdo que pode rolar
            </Text>
          </View>

          {/* Lista de Features */}
          <Card title="✨ Features Implementadas">
            <Feature icon="✅" text="Componentes reutilizáveis" />
            <Feature icon="✅" text="Formulários com validação" />
            <Feature icon="✅" text="Estados e loading" />
            <Feature icon="✅" text="NativeWind (Tailwind)" />
            <Feature icon="✅" text="TypeScript" />
            <Feature icon="✅" text="Safe Area" />
          </Card>
        </View>
      </KeyboardForm>
    </SafeAreaView>
  );
}

// Componente auxiliar
function Feature({ icon, text }: { icon: string; text: string }) {
  return (
    <View className="flex-row items-center mb-3">
      <Text className="text-2xl mr-3">{icon}</Text>
      <Text className="text-gray-700 flex-1">{text}</Text>
    </View>
  );
}


