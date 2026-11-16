# @luminix/contracts

Regras de produto compartilhadas entre o site (`apps/web`) e o app (`apps/mobile-client`), em
TypeScript puro, sem dependências e sem build: cada app compila o código-fonte.

- `anamnesis`: roteiro da ficha em etapas, níveis I–III, reaproveitamento e validade (ADR-030).

A API não importa este pacote (o build dela não inclui código fora de `src/`); ela valida a forma
das respostas e as chaves obrigatórias de cada nível.
