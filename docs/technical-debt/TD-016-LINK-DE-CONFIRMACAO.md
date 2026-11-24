# TD-016 — Link de confirmação e alertas da anamnese: pendências

ID: TD-016
Data: 2026-11-24
Módulo: `appointment_links`, `apps/web/app/confirmar`, `packages/contracts/src/anamnesis.ts`

Problema:

1. O link é gerado à mão pela equipe. Ainda não sai sozinho ao criar o agendamento nem em um job
   de lembrete (24–48 h antes).
2. WhatsApp é compartilhamento manual (`wa.me`). A API oficial da conta Kommite recusa envio para
   o Brasil (erro 130497, portfólio não verificado); falta verificação da empresa ou número
   brasileiro próprio e o template de utilidade com o link.
3. A pessoa não consegue preencher a anamnese pelo link (sem conta). Hoje a página só avisa que a
   ficha está pendente; criar conta a partir dela duplicaria a ficha (ADR-029).
4. "Pediu para remarcar" e "não é a cliente" aparecem só no atendimento: não há aviso no sino nem
   filtro na agenda.
5. Os alertas da anamnese dependem de `client:manage` (quem lê a ficha). Profissional com
   `client:read` não vê contraindicações do próprio atendimento; precisa de decisão de LGPD.
6. Perguntas por segmento ainda são por nível (I–III), não por serviço ou tipo do espaço.
7. O limite de 30 req/min por IP vive em memória de cada máquina (como as rotas públicas).

Impacto atual: baixo (sem clientes reais).
Risco futuro: confirmações esquecidas (1), falta de canal (2), fichas incompletas na chegada (3),
profissional sem alerta (5).
Workaround atual: equipe gera e cola o link; ficha preenchida na recepção.
Quando deve ser resolvido: 1 e 3 antes de clientes reais; 2 quando a Meta liberar; 5 com a revisão
de níveis de acesso.
Prioridade: P1
Status: aberto
