// AsyncStorage - equivalente ao localStorage no React Native
// Primeiro instale: npm install @react-native-async-storage/async-storage

/*
import AsyncStorage from '@react-native-async-storage/async-storage';

// Salvar dados
export async function saveData(key: string, value: any) {
  try {
    const jsonValue = JSON.stringify(value);
    await AsyncStorage.setItem(key, jsonValue);
  } catch (error) {
    console.error('Erro ao salvar:', error);
  }
}

// Ler dados
export async function getData(key: string) {
  try {
    const jsonValue = await AsyncStorage.getItem(key);
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (error) {
    console.error('Erro ao ler:', error);
    return null;
  }
}

// Remover dados
export async function removeData(key: string) {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.error('Erro ao remover:', error);
  }
}

// Limpar tudo
export async function clearAll() {
  try {
    await AsyncStorage.clear();
  } catch (error) {
    console.error('Erro ao limpar:', error);
  }
}

// Exemplo de uso com autenticação
export async function saveAuthToken(token: string) {
  await saveData('auth_token', token);
}

export async function getAuthToken() {
  return await getData('auth_token');
}

export async function removeAuthToken() {
  await removeData('auth_token');
}

export async function saveUser(user: any) {
  await saveData('user', user);
}

export async function getUser() {
  return await getData('user');
}

// Uso em componentes:
async function handleLogin() {
  const response = await api.post('/login', { email, password });
  await saveAuthToken(response.token);
  await saveUser(response.user);
}

async function handleLogout() {
  await removeAuthToken();
  await removeData('user');
}
*/

export {};


