# ADR-005 — Container e deploy da API

Status: Accepted

Data: 2026-09-14

## Contexto

A API Fastify já possui bootstrap, integrações locais e health check. Era necessário tornar o build
reproduzível e preparar o Fly.io sem publicar uma aplicação incompleta nem depender de Docker
Desktop na máquina do operador.

## Decisão

- empacotar somente `apps/api` em uma imagem Docker multi-stage, usando o workspace e lockfile da
  raiz como contexto;
- executar em Node.js 22 como usuário sem privilégios e manter dependências de desenvolvimento fora
  da imagem final;
- hospedar a API em `gru`, com `shared-cpu-1x`, 256 MB, sem volume persistente;
- usar `auto_stop_machines = "stop"`, `auto_start_machines = true` e
  `min_machines_running = 0`; a primeira requisição após inatividade pode sofrer cold start;
- manter `/health` independente das integrações e usá-lo no health check do Fly Proxy;
- usar build remoto para que Docker Desktop não seja requisito local;
- executar CI em pushes e pull requests, mas manter o deploy por acionamento manual até existir
  estratégia formal de ambientes e um token de deploy restrito à app;
- nunca incluir secrets na imagem, no `fly.toml`, no workflow ou no Git. Secrets são configurados no
  Fly.io fora do repositório. O JSON Firebase Admin fica codificado em base64 no vault do Fly e é
  montado como arquivo somente em runtime;

## Consequências

O cadastro `luminix-api-marcos-santos` foi criado sem deploy ou Machine. O primeiro deploy criará
recurso faturável; auto-stop
reduz compute ocioso, mas Machine parada ainda pode gerar cobrança de root filesystem. Não há volume
Fly porque a persistência pertence ao Neon e ao R2.

Antes do primeiro deploy, configurar `FLY_API_TOKEN` no environment `production` do GitHub e revisar
os secrets da app. Automatizar deploy por push fica pendente até staging e production serem destinos
separados.
