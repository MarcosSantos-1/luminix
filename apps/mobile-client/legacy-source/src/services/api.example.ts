// Exemplo de como fazer chamadas de API no React Native
// Este arquivo é apenas um exemplo - adapte para sua API real!

// Opção 1: Usando fetch nativo
export async function fetchWithNativeFetch() {
  try {
    const response = await fetch('https://api.example.com/data', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Adicione seu token de auth aqui
        // 'Authorization': `Bearer ${token}`
      },
    });

    if (!response.ok) {
      throw new Error('Erro na requisição');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Erro:', error);
    throw error;
  }
}

// Opção 2: Configurar com axios (recomendado)
// Primeiro instale: npm install axios
/*
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://sua-api.com',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Interceptor para adicionar token em todas as requisições
api.interceptors.request.use(
  async (config) => {
    // Pegue o token do AsyncStorage (equivalente ao localStorage)
    // const token = await AsyncStorage.getItem('token');
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Exemplos de uso
export async function getServices() {
  const response = await api.get('/services');
  return response.data;
}

export async function createAppointment(data: any) {
  const response = await api.post('/appointments', data);
  return response.data;
}

export async function updateProfile(id: string, data: any) {
  const response = await api.put(`/users/${id}`, data);
  return response.data;
}
*/

// Opção 3: Usando React Query (MELHOR para cache e gerenciamento de estado)
// Instale: npm install @tanstack/react-query
/*
import { useQuery, useMutation, QueryClient } from '@tanstack/react-query';

// Configurar o QueryClient no App.tsx
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutos
      cacheTime: 1000 * 60 * 30, // 30 minutos
    },
  },
});

// Hook personalizado para buscar serviços
export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const response = await api.get('/services');
      return response.data;
    },
  });
}

// Hook para criar agendamento
export function useCreateAppointment() {
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/appointments', data);
      return response.data;
    },
    onSuccess: () => {
      // Invalida a cache dos agendamentos para recarregar
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

// Uso nos componentes:
function MyComponent() {
  const { data: services, isLoading, error } = useServices();
  const createAppointment = useCreateAppointment();

  if (isLoading) return <Text>Carregando...</Text>;
  if (error) return <Text>Erro!</Text>;

  return (
    <View>
      {services.map(service => (
        <Text key={service.id}>{service.name}</Text>
      ))}
    </View>
  );
}
*/

export {};


