# Mapa técnico do legado

Snapshot estático de 2026-09-10. Índice de localização, não prova de execução. Consulte o [inventário principal](../12-INVENTARIO-LEGADO.md) para contexto e riscos.

## Endpoints declarados

Extraídos das declarações diretas app.get/post/put/patch/delete em backend/src/routes. A autenticação global está em server.ts; esta tabela não é uma matriz de autorização.

### anamnesis.ts

[Código](../../legacy/charme-bela/backend/src/routes/anamnesis.ts)

| Método | Rota                      | Linha |
| ------ | ------------------------- | ----- |
| GET    | `/anamnesis`              | 59    |
| GET    | `/anamnesis/user/:userId` | 91    |
| POST   | `/anamnesis`              | 132   |
| PUT    | `/anamnesis/user/:userId` | 251   |
| DELETE | `/anamnesis/user/:userId` | 375   |

### appointments.ts

[Código](../../legacy/charme-bela/backend/src/routes/appointments.ts)

| Método | Rota                                       | Linha |
| ------ | ------------------------------------------ | ----- |
| POST   | `/appointments/cancel-expired`             | 42    |
| PUT    | `/appointments/:id/release-hold`           | 66    |
| POST   | `/appointments/auto-complete-previous-day` | 152   |
| GET    | `/appointments`                            | 253   |
| GET    | `/appointments/:id`                        | 370   |
| POST   | `/appointments`                            | 430   |
| PUT    | `/appointments/:id/confirm`                | 816   |
| PUT    | `/appointments/:id/complete`               | 858   |
| PUT    | `/appointments/:id/cancel`                 | 924   |
| PUT    | `/appointments/:id/retry-refund`           | 1155  |
| PUT    | `/appointments/:id/reschedule`             | 1179  |
| DELETE | `/appointments/:id`                        | 1373  |
| PUT    | `/appointments/clear-history/:userId`      | 1446  |

### banners.ts

[Código](../../legacy/charme-bela/backend/src/routes/banners.ts)

| Método | Rota               | Linha |
| ------ | ------------------ | ----- |
| GET    | `/banners`         | 22    |
| POST   | `/banners`         | 67    |
| PUT    | `/banners/reorder` | 145   |
| PUT    | `/banners/:id`     | 191   |
| DELETE | `/banners/:id`     | 266   |

### config.ts

[Código](../../legacy/charme-bela/backend/src/routes/config.ts)

| Método | Rota      | Linha |
| ------ | --------- | ----- |
| GET    | `/config` | 144   |
| PUT    | `/config` | 165   |

### health.ts

[Código](../../legacy/charme-bela/backend/src/routes/health.ts)

| Método | Rota      | Linha |
| ------ | --------- | ----- |
| GET    | `/health` | 7     |

### machineRentals.ts

[Código](../../legacy/charme-bela/backend/src/routes/machineRentals.ts)

| Método | Rota                                  | Linha |
| ------ | ------------------------------------- | ----- |
| GET    | `/machine-rentals`                    | 81    |
| PUT    | `/machine-rentals/settings/:kind`     | 109   |
| GET    | `/machine-rentals/:id/change-preview` | 149   |
| PUT    | `/machine-rentals/:id/date`           | 197   |
| POST   | `/machine-rentals/:id/cancel-month`   | 273   |
| POST   | `/machine-rentals/:id/release`        | 350   |
| POST   | `/machine-rentals/:id/unrelease`      | 445   |

### notifications.ts

[Código](../../legacy/charme-bela/backend/src/routes/notifications.ts)

| Método | Rota                           | Linha |
| ------ | ------------------------------ | ----- |
| GET    | `/notifications`               | 31    |
| GET    | `/notifications/unread-count`  | 98    |
| GET    | `/notifications/:id`           | 144   |
| POST   | `/notifications`               | 197   |
| PUT    | `/notifications/:id/read`      | 292   |
| PUT    | `/notifications/mark-all-read` | 330   |
| DELETE | `/notifications/:id`           | 386   |
| DELETE | `/notifications/clear-all`     | 420   |
| DELETE | `/notifications/clear-expired` | 469   |

### packages.ts

[Código](../../legacy/charme-bela/backend/src/routes/packages.ts)

| Método | Rota                               | Linha |
| ------ | ---------------------------------- | ----- |
| GET    | `/packages/purchases`              | 57    |
| GET    | `/packages/purchases/:id`          | 79    |
| POST   | `/packages/purchases`              | 99    |
| POST   | `/packages/purchases/:id/sessions` | 367   |
| PUT    | `/packages/purchases/:id/refund`   | 523   |

### payments.ts

[Código](../../legacy/charme-bela/backend/src/routes/payments.ts)

| Método | Rota                           | Linha |
| ------ | ------------------------------ | ----- |
| POST   | `/payments/checkout`           | 691   |
| POST   | `/payments/checkout/pix`       | 855   |
| POST   | `/payments/subscribe`          | 962   |
| POST   | `/payments/upgrade`            | 1102  |
| POST   | `/payments/manage`             | 1195  |
| POST   | `/payments/add-card`           | 1200  |
| POST   | `/payments/abandon`            | 1205  |
| GET    | `/payments/status/:paymentId`  | 1295  |
| GET    | `/payments/methods`            | 1375  |
| GET    | `/payments/methods/:userId`    | 1394  |
| PATCH  | `/payments/methods/:id`        | 1413  |
| DELETE | `/payments/methods/:id`        | 1498  |
| POST   | `/payments/charge-saved-card`  | 1548  |
| POST   | `/payments/retry-subscription` | 1840  |
| GET    | `/payments/history`            | 1882  |
| GET    | `/payments/history/:userId`    | 1918  |
| GET    | `/payments/monthly-revenue`    | 1953  |
| POST   | `/asaas/webhook`               | 2013  |

### plans.ts

[Código](../../legacy/charme-bela/backend/src/routes/plans.ts)

| Método | Rota                         | Linha |
| ------ | ---------------------------- | ----- |
| GET    | `/plans`                     | 19    |
| GET    | `/plans/:id`                 | 60    |
| GET    | `/plans/tier/:tier`          | 111   |
| POST   | `/plans`                     | 159   |
| PUT    | `/plans/:id`                 | 221   |
| PUT    | `/plans/:id/services/add`    | 283   |
| PUT    | `/plans/:id/services/remove` | 333   |
| PUT    | `/plans/:id/services/set`    | 378   |

### schedule.ts

[Código](../../legacy/charme-bela/backend/src/routes/schedule.ts)

| Método | Rota                        | Linha |
| ------ | --------------------------- | ----- |
| GET    | `/schedule/available`       | 155   |
| GET    | `/schedule/admin-slots`     | 412   |
| GET    | `/schedule/manager`         | 560   |
| POST   | `/schedule/manager`         | 583   |
| GET    | `/schedule/week`            | 634   |
| POST   | `/schedule/week/preview`    | 697   |
| POST   | `/schedule/week`            | 719   |
| POST   | `/schedule/manager/preview` | 758   |
| POST   | `/schedule/manager/batch`   | 780   |
| GET    | `/schedule/overrides`       | 818   |
| POST   | `/schedule/overrides`       | 854   |
| DELETE | `/schedule/overrides/:date` | 910   |
| GET    | `/schedule/available-days`  | 943   |
| GET    | `/schedule/day-markers`     | 1077  |

### services.ts

[Código](../../legacy/charme-bela/backend/src/routes/services.ts)

| Método | Rota            | Linha |
| ------ | --------------- | ----- |
| GET    | `/services`     | 16    |
| GET    | `/services/:id` | 63    |
| POST   | `/services`     | 96    |
| PUT    | `/services/:id` | 236   |
| DELETE | `/services/:id` | 330   |

### subscriptions.ts

[Código](../../legacy/charme-bela/backend/src/routes/subscriptions.ts)

| Método | Rota                                      | Linha |
| ------ | ----------------------------------------- | ----- |
| GET    | `/subscriptions`                          | 42    |
| GET    | `/subscriptions/user/:userId`             | 81    |
| POST   | `/subscriptions`                          | 151   |
| PUT    | `/subscriptions/:userId/cancel`           | 259   |
| PUT    | `/subscriptions/:userId/pause`            | 396   |
| PUT    | `/subscriptions/:userId/reactivate`       | 446   |
| PUT    | `/subscriptions/:userId/change-plan`      | 559   |
| DELETE | `/subscriptions/:userId/pending-plan`     | 702   |
| POST   | `/subscriptions/check-expiration/:userId` | 726   |

### testimonials.ts

[Código](../../legacy/charme-bela/backend/src/routes/testimonials.ts)

| Método | Rota                | Linha |
| ------ | ------------------- | ----- |
| GET    | `/testimonials`     | 7     |
| GET    | `/testimonials/:id` | 36    |
| POST   | `/testimonials`     | 68    |
| PUT    | `/testimonials/:id` | 124   |
| DELETE | `/testimonials/:id` | 178   |

### users.ts

[Código](../../legacy/charme-bela/backend/src/routes/users.ts)

| Método | Rota                           | Linha |
| ------ | ------------------------------ | ----- |
| GET    | `/users/birthdays`             | 21    |
| GET    | `/users`                       | 102   |
| GET    | `/users/firebase/:firebaseUid` | 151   |
| GET    | `/users/:id`                   | 215   |
| POST   | `/users`                       | 300   |
| PUT    | `/users/:id`                   | 405   |
| DELETE | `/users/:id`                   | 522   |

### vouchers.ts

[Código](../../legacy/charme-bela/backend/src/routes/vouchers.ts)

| Método | Rota                                | Linha |
| ------ | ----------------------------------- | ----- |
| GET    | `/vouchers`                         | 34    |
| GET    | `/vouchers/user/:userId`            | 78    |
| POST   | `/vouchers/merge`                   | 155   |
| GET    | `/vouchers/:id`                     | 227   |
| POST   | `/vouchers`                         | 273   |
| PUT    | `/vouchers/:id/use`                 | 397   |
| POST   | `/vouchers/:id/activate-free-month` | 455   |
| POST   | `/vouchers/validate`                | 585   |
| DELETE | `/vouchers/:id`                     | 693   |

## Modelos Prisma

[Schema](../../legacy/charme-bela/backend/prisma/schema.prisma)

| Modelo                  | Linha |
| ----------------------- | ----- |
| User                    | 17    |
| SavedCard               | 58    |
| Service                 | 80    |
| SubscriptionPlan        | 118   |
| Subscription            | 144   |
| MonthlyUsage            | 184   |
| Appointment             | 210   |
| PackageItem             | 273   |
| PackagePurchase         | 286   |
| ProcessedWebhookEvent   | 319   |
| Voucher                 | 332   |
| AnamnesisForm           | 376   |
| ManagerSchedule         | 410   |
| ScheduleOverride        | 423   |
| Testimonial             | 441   |
| Banner                  | 464   |
| MachineRentalSettings   | 504   |
| MachineRentalOccurrence | 516   |
| SystemConfig            | 538   |
| Notification            | 671   |

## Páginas web

Presença de página não comprova integração; gestão de acessos usa mock.

- [web/app/admin-login/page.tsx](../../legacy/charme-bela/web/app/admin-login/page.tsx)
- [web/app/admin/acessos/page.tsx](../../legacy/charme-bela/web/app/admin/acessos/page.tsx)
- [web/app/admin/agendamentos/page.tsx](../../legacy/charme-bela/web/app/admin/agendamentos/page.tsx)
- [web/app/admin/anamneses/page.tsx](../../legacy/charme-bela/web/app/admin/anamneses/page.tsx)
- [web/app/admin/atividades/page.tsx](../../legacy/charme-bela/web/app/admin/atividades/page.tsx)
- [web/app/admin/clientes/page.tsx](../../legacy/charme-bela/web/app/admin/clientes/page.tsx)
- [web/app/admin/configuracoes/page.tsx](../../legacy/charme-bela/web/app/admin/configuracoes/page.tsx)
- [web/app/admin/landing/page.tsx](../../legacy/charme-bela/web/app/admin/landing/page.tsx)
- [web/app/admin/page.tsx](../../legacy/charme-bela/web/app/admin/page.tsx)
- [web/app/admin/planos/page.tsx](../../legacy/charme-bela/web/app/admin/planos/page.tsx)
- [web/app/admin/promocoes/page.tsx](../../legacy/charme-bela/web/app/admin/promocoes/page.tsx)
- [web/app/admin/servicos/page.tsx](../../legacy/charme-bela/web/app/admin/servicos/page.tsx)
- [web/app/admin/vouchers/page.tsx](../../legacy/charme-bela/web/app/admin/vouchers/page.tsx)
- [web/app/cadastro/page.tsx](../../legacy/charme-bela/web/app/cadastro/page.tsx)
- [web/app/cliente/agenda/page.tsx](../../legacy/charme-bela/web/app/cliente/agenda/page.tsx)
- [web/app/cliente/anamnese/page.tsx](../../legacy/charme-bela/web/app/cliente/anamnese/page.tsx)
- [web/app/cliente/anamnese/visualizar/page.tsx](../../legacy/charme-bela/web/app/cliente/anamnese/visualizar/page.tsx)
- [web/app/cliente/checkout/page.tsx](../../legacy/charme-bela/web/app/cliente/checkout/page.tsx)
- [web/app/cliente/historico/page.tsx](../../legacy/charme-bela/web/app/cliente/historico/page.tsx)
- [web/app/cliente/pacotes/[id]/page.tsx](../../legacy/charme-bela/web/app/cliente/pacotes/%5Bid%5D/page.tsx)
- [web/app/cliente/pagamentos/page.tsx](../../legacy/charme-bela/web/app/cliente/pagamentos/page.tsx)
- [web/app/cliente/page.tsx](../../legacy/charme-bela/web/app/cliente/page.tsx)
- [web/app/cliente/perfil/page.tsx](../../legacy/charme-bela/web/app/cliente/perfil/page.tsx)
- [web/app/cliente/plano/page.tsx](../../legacy/charme-bela/web/app/cliente/plano/page.tsx)
- [web/app/cliente/privacidade/page.tsx](../../legacy/charme-bela/web/app/cliente/privacidade/page.tsx)
- [web/app/cliente/servicos/page.tsx](../../legacy/charme-bela/web/app/cliente/servicos/page.tsx)
- [web/app/login/page.tsx](../../legacy/charme-bela/web/app/login/page.tsx)
- [web/app/page.tsx](../../legacy/charme-bela/web/app/page.tsx)
- [web/app/planos/page.tsx](../../legacy/charme-bela/web/app/planos/page.tsx)
- [web/app/recuperar-senha/page.tsx](../../legacy/charme-bela/web/app/recuperar-senha/page.tsx)
- [web/app/servicos/page.tsx](../../legacy/charme-bela/web/app/servicos/page.tsx)
- [web/app/verificar-email/page.tsx](../../legacy/charme-bela/web/app/verificar-email/page.tsx)

## Migrations encontradas

Lista local, não histórico aplicado no banco. A ausência de migrations de máquinas é descrita no inventário.

- [20251014204413_migration](../../legacy/charme-bela/backend/prisma/migrations/20251014204413_migration/migration.sql)
- [20251016143121_update_schema_with_business_rules](../../legacy/charme-bela/backend/prisma/migrations/20251016143121_update_schema_with_business_rules/migration.sql)
- [20251016191908_add_combo_category](../../legacy/charme-bela/backend/prisma/migrations/20251016191908_add_combo_category/migration.sql)
- [20251018042903_add_clinic_info_to_system_config](../../legacy/charme-bela/backend/prisma/migrations/20251018042903_add_clinic_info_to_system_config/migration.sql)
- [20251018043653_add_plan_prices_to_system_config](../../legacy/charme-bela/backend/prisma/migrations/20251018043653_add_plan_prices_to_system_config/migration.sql)
- [20251018044913_create_testimonials](../../legacy/charme-bela/backend/prisma/migrations/20251018044913_create_testimonials/migration.sql)
- [20251018232946_add_payment_expiration](../../legacy/charme-bela/backend/prisma/migrations/20251018232946_add_payment_expiration/migration.sql)
- [20251019020336_add_hidden_from_history](../../legacy/charme-bela/backend/prisma/migrations/20251019020336_add_hidden_from_history/migration.sql)
- [20251019024111_add_notifications](../../legacy/charme-bela/backend/prisma/migrations/20251019024111_add_notifications/migration.sql)
- [20260708120000_dynamic_slots_capacity](../../legacy/charme-bela/backend/prisma/migrations/20260708120000_dynamic_slots_capacity/migration.sql)
- [20260709010000_cancellation_window_4h](../../legacy/charme-bela/backend/prisma/migrations/20260709010000_cancellation_window_4h/migration.sql)
- [20260728200000_anamnesis_schema_version](../../legacy/charme-bela/backend/prisma/migrations/20260728200000_anamnesis_schema_version/migration.sql)
- [20260803040000_user_club_welcome_seen](../../legacy/charme-bela/backend/prisma/migrations/20260803040000_user_club_welcome_seen/migration.sql)
- [20260807010000_user_expo_push](../../legacy/charme-bela/backend/prisma/migrations/20260807010000_user_expo_push/migration.sql)
- [20260810090000_add_banners](../../legacy/charme-bela/backend/prisma/migrations/20260810090000_add_banners/migration.sql)
- [20260816185900_add_package_origin](../../legacy/charme-bela/backend/prisma/migrations/20260816185900_add_package_origin/migration.sql)
- [20260816190000_add_packages](../../legacy/charme-bela/backend/prisma/migrations/20260816190000_add_packages/migration.sql)
- [20260816210000_add_asaas](../../legacy/charme-bela/backend/prisma/migrations/20260816210000_add_asaas/migration.sql)
- [20260816223000_add_user_cpf](../../legacy/charme-bela/backend/prisma/migrations/20260816223000_add_user_cpf/migration.sql)
- [20260817010000_add_asaas_saved_card](../../legacy/charme-bela/backend/prisma/migrations/20260817010000_add_asaas_saved_card/migration.sql)
- [20260817023000_saved_card_nickname_kind](../../legacy/charme-bela/backend/prisma/migrations/20260817023000_saved_card_nickname_kind/migration.sql)
- [20260817040000_subscription_pending_plan](../../legacy/charme-bela/backend/prisma/migrations/20260817040000_subscription_pending_plan/migration.sql)
- [20260818010000_cancel_settlement_credit](../../legacy/charme-bela/backend/prisma/migrations/20260818010000_cancel_settlement_credit/migration.sql)
- [20260820120000_package_purchase_voucher](../../legacy/charme-bela/backend/prisma/migrations/20260820120000_package_purchase_voucher/migration.sql)
- [20260829211500_subscription_past_due_since](../../legacy/charme-bela/backend/prisma/migrations/20260829211500_subscription_past_due_since/migration.sql)
- [20260907120000_centralize_plan_catalog](../../legacy/charme-bela/backend/prisma/migrations/20260907120000_centralize_plan_catalog/migration.sql)
