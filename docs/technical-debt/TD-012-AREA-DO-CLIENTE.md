# TD-012 — Área do cliente: pendências da primeira versão real

ID: TD-012
Data: 2026-11-16
Módulo: API `/client/*`, `apps/web/app/cliente`, `apps/mobile-client`

Problema:

1. Foto da ficha guardada como data URL no banco (`client_profiles.photo_data`,
   `clinic_clients.client_photo_data`, até ~400 kB) em vez do bucket privado de mídia.
2. Ficha nível I e foto não aparecem para a equipe no admin.
3. Regras de cliente (mapeamento de horários, avisos derivados, pagamentos simulados) duplicadas
   entre web e app.
4. Avisos derivados no cliente: sem push; "lido" é por aparelho. O voucher de uso único fica
   persistido e aparece na central enquanto disponível. A entrega do e-mail atual é assíncrona,
   sem fila de reenvio. WhatsApp é compartilhamento manual com autorização de mensagens.
5. Variáveis `NEXT_PUBLIC_FIREBASE_*` e `NEXT_PUBLIC_API_URL` configuradas só em Production na
   Vercel (`luminix-web`); Preview não tem login de cliente.
6. Nível da ficha só é derivado dos serviços: falta a escolha do gestor
   (`clinic_profiles.anamnesis_level`) e perguntas adicionais por espaço.
7. Lista de chaves obrigatórias por nível duplicada entre a API (`requiredKeys`) e
   `packages/contracts` (a API não importa o pacote).
8. Recursos (salas/equipamentos), atendimento a domicílio e feriados da profissional não entram no
   cálculo de horários livres.

Impacto atual: baixo (sem clientes reais).
Risco futuro: custo/tamanho do banco (1), equipe sem a ficha (2), divergência web/app (3).
Workaround atual: nenhum necessário.
Quando deve ser resolvido: antes de clientes reais (1, 2, 5); com push/app nas lojas (4); ao
crescer a área (3, 6).
Prioridade: P1
Status: aberto
