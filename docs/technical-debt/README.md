# Dívida técnica

Objetivo:

Registrar problemas conhecidos que não justificam correção imediata.

Cada item deve possuir:

```text
ID:
Data:
Módulo:
Problema:
Impacto atual:
Risco futuro:
Workaround atual:
Quando deve ser resolvido:
Prioridade:
Status:
```

Prioridades:

```text
P0 — risco crítico
P1 — resolver em breve
P2 — importante
P3 — melhoria
```

Exemplo:

```text
TD-004

Módulo:
media

Problema:
Uploads ainda passam pelo backend antes do storage.

Impacto:
Uso desnecessário de bandwidth e memória.

Quando resolver:
Antes de liberar vídeos para clínicas.

Prioridade:
P2
```

---

## Situação revisada em 2026-11-02

- TD-004: resolvida (integração da principal).
- TD-007: resolvida (check agregado verde; PGlite com concorrência limitada).
- TD-001: aberta para riscos do legado; fronteira corporativa documental já resolvida.
- TD-002: dependências transitivas ainda exigem revisão antes do build nativo; não reavaliadas por esta entrega.
- TD-003: critérios de ativação e identidade do cliente ainda abertos.
- TD-005: acesso visual/persistência corrigidos; termos, consentimentos, conteúdo e ensaio hospedado pendentes.
- TD-006: retenção/limpeza e domínio de mídia pendentes.
- TD-008: cobrança, eventos, conciliação, pacotes e billing pendentes.
- TD-009: aplicação operacional das regras de reserva pendente.

Consulte os arquivos por ID para critérios de fechamento. Onboarding concluído não encerra essas
frentes. A sequência de implementação e os caminhos de código estão em `../00-ARQUITETURA.md`.
