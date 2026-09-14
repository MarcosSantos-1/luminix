# TD-002 — Dependências transitivas do tooling inicial

ID: TD-002

Data: 2026-09-14

Módulo: workspace / Expo / lint

Status: aberto

Prioridade: P2

## Problema

`pnpm audit --prod` reporta a advisory `GHSA-w5hq-g745-h8pq` em `uuid@7.0.3` e `uuid@9.0.1`. A
primeira dependência é transitiva de `xcode@3.0.1`, usada pelo CLI/config plugins do Expo 57; a
segunda vem de `gaxios@6.7.1` pela cadeia de storage do Firebase Admin. O problema afeta as funções
UUID v3/v5/v6 quando recebem um buffer sem bounds check.

O ESLint 9.39.5 também informa fim de suporte, mas `eslint-config-next@16.3.5` ainda traz plugins
com peer ranges limitados ao ESLint 9. Usar ESLint 10 neste bootstrap deixa peers inválidos.

## Impacto atual

Os caminhos identificados não chamam diretamente as funções afetadas no código Luminix; nenhum
build mobile foi executado e a integração Firebase usa Auth, não o cliente Google Cloud Storage que
introduz o segundo caminho. O lint funciona, mas fica temporariamente preso à major 9.

## Risco futuro

Executar tooling nativo sobre entrada não confiável pode alcançar a dependência vulnerável. Manter
tooling fora de suporte aumenta o risco de incompatibilidades e correções atrasadas.

## Workaround atual

Não aceitar arquivos de projeto nativo de fontes não confiáveis e não executar Expo/prebuild em CI
privilegiada até revisar a árvore. Não foi aplicado override de `uuid` para uma major fora do range
de `xcode`/`gaxios`, pois isso poderia quebrar consumidores transitivos silenciosamente.

## Quando deve ser resolvido

Antes do primeiro prebuild/EAS build ou pipeline mobile. Atualizar Expo/CLI assim que a cadeia usar
`uuid >= 11.1.1`; atualizar Firebase Admin/Google Cloud quando a cadeia corrigida estiver disponível;
atualizar para ESLint 10 quando os plugins do Next declararem compatibilidade.
Reexecutar `pnpm audit --prod` e `pnpm peers check` após a atualização.
