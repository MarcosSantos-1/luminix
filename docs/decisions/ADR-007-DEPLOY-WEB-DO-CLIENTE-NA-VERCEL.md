# ADR-007 — Deploy web do cliente na Vercel

Status: Accepted

Data: 2026-09-14

## Contexto

O aplicativo cliente é um shell Expo/React Native preparado para migração segura por funcionalidade.
Era necessário disponibilizar uma visualização hospedada para o desenvolvimento antes da criação dos
binários Android e iOS.

## Decisão

- habilitar o target web oficial do Expo com Metro, `react-native-web` e `@expo/metro-runtime`;
- gerar bundle estático com `expo export --platform web` em `dist`;
- publicar `apps/mobile-client` no projeto Vercel `luminix-client`;
- usar rewrite SPA no `vercel.json` do aplicativo;
- conectar o projeto ao mesmo repositório GitHub: `master` publica Production e demais branches/pull
  requests geram Preview;
- configurar apenas `EXPO_PUBLIC_API_URL`, apontando temporariamente para a API Fly compartilhada de
  desenvolvimento.

## Estado verificado

- build web, TypeScript e lint concluídos localmente;
- deployment Production disponível em `https://luminix-client.vercel.app`;
- resposta HTTP e conteúdo básico verificados;
- a publicação contém apenas o shell atual, não a implementação em `legacy-source`.

## Consequências e pendências

O deploy Vercel não substitui builds nativos Expo/EAS. Antes de dados reais, separar Preview e
Production, definir autenticação do cliente e revisar armazenamento seguro no dispositivo. A URL da
API é pública por definição e nunca pode conter credenciais.
