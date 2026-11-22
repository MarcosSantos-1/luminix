# TD-013 — Feriados e fechamentos: pendências da primeira versão

ID: TD-013
Data: 2026-11-18
Módulo: `apps/admin/lib/holidays.ts`, `holiday-prompt.tsx`, `schedule_closures`

Problema:

1. Feriados municipais só das capitais, mantidos à mão no código; outras cidades dependem da
   gestora marcar em "Datas especiais". Falta fonte oficial por código IBGE e revisão anual.
2. "Perguntar depois" é guardado por aparelho (`localStorage`); outro aparelho pergunta de novo.
3. O aviso de feriados aparece só na Agenda (não no sino/Atividades nem no Início).
4. Férias de uma profissional não reduzem a agenda "Sem preferência" do gestor: os blocos
   consideram todas as profissionais; a API avisa ao confirmar.
5. ~~Não há aviso proativo listando os atendimentos já marcados dentro de um fechamento novo.~~
   Resolvido pela ADR-035.

Impacto atual: baixo (sem clientes reais).
Risco futuro: feriado municipal não perguntado (1); pergunta repetida (2).
