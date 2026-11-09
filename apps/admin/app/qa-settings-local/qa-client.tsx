'use client'

import { useMemo } from 'react'
import { ManagerHome } from '@/components/manager/manager-home'
import { ClinicSettings } from '@/components/manager/sections/clinic-settings'
import { MediaLibrary } from '@/components/manager/media/media-library'
import { HomeDashboard } from '@/components/manager/business/home-dashboard'
import { ServicesPanel } from '@/components/manager/business/services-panel'
import { FinancePanel } from '@/components/manager/business/finance-panel'
import { ReportsPanel } from '@/components/manager/business/reports-panel'
import { InventoryPanel } from '@/components/manager/business/inventory-panel'
import { MarketingPanel } from '@/components/manager/business/marketing-panel'
import { allowedSections } from '@/lib/access'

const qaPermissions = [
  'agenda:read',
  'agenda:manage',
  'client:read',
  'clinic:manage',
  'finance:manage',
  'inventory:manage',
  'settings:manage',
  'media:read',
]
import { ClinicApiProvider, type ClinicApi } from '@/components/manager/settings/clinic-api'
import { SiteEditor } from '@/components/site-editor/site-editor'
import { SpaceThemeProvider } from '@/components/space-theme'
import '@/app/dashboard/manager.css'

const web = 'http://localhost:3001'
const services = [
  ['a1b2c3d4-0000-4000-8000-000000000001', 'Corte feminino', 'Cabelo', 12000, 'instant'],
  ['a1b2c3d4-0000-4000-8000-000000000002', 'Coloração', 'Cabelo', 25000, 'instant'],
  ['a1b2c3d4-0000-4000-8000-000000000003', 'Limpeza de pele', 'Estética facial', 18000, 'instant'],
  [
    'a1b2c3d4-0000-4000-8000-000000000004',
    'Design de sobrancelhas',
    'Sobrancelhas',
    6000,
    'instant',
  ],
  [
    'a1b2c3d4-0000-4000-8000-000000000005',
    'Laser CO2',
    'Estética avançada',
    90000,
    'manual_release',
  ],
] as const
const fixtures: Record<string, unknown> = {
  profile: {
    clinic: {
      name: 'Studio Lumière',
      slug: 'studio-lumiere',
      status: 'active',
      shareCode: 'KW-4374',
    },
    region: { locale: 'pt-BR', timezone: 'America/Sao_Paulo', currency: 'BRL' },
    profile: {
      name: 'Studio Lumière',
      ownerName: 'Maria Aparecida',
      email: 'maria@example.com',
      phone: '+5511987654321',
      whatsapp: '+5511987654321',
      foundedYear: '2012',
      instagram: '@studiolumiere',
      facebook: '',
      website: '',
      logoAssetId: '',
      logoUrl: null,
      taxId: '•••0001',
      taxIdKind: 'cnpj',
      addressLine: 'Rua Augusta',
      addressNumber: '1500',
      addressDistrict: 'Consolação',
      addressNote: '',
      city: 'São Paulo',
      state: 'SP',
      postalCode: '01304001',
    },
  },
  'booking-rules': {
    acceptInApp: false,
    rules: {
      bookingNoticeHours: 1,
      bookingWindowDays: 30,
      cancellationHours: 4,
      specialCancellationHours: 24,
      reschedulingHours: null,
      clientInstructions: '',
      lateChangeRetentionPercent: 0,
      noShowRetentionPercent: 0,
      depositScope: 'none',
      depositPercent: 20,
      depositThresholdCents: 30000,
    },
    services: services.map(([id, name, category, priceCents, bookingMode]) => ({
      id,
      name,
      category,
      description: '',
      priceCents,
      durationMinutes: 60,
      priceType: 'fixed',
      bookingMode,
      audience: 'all',
      sensitive: false,
      resourceName: '',
      cancellationHours: null,
      depositRequired: false,
      lateChangeRetentionPercent: null,
      noShowRetentionPercent: null,
    })),
  },
  publication: {
    publication: {
      slug: 'studio-lumiere',
      status: 'active',
      enabled: true,
      address: true,
      contacts: true,
    },
  },
  slug: { slug: 'studio-lumiere', previous: ['kw-4374'], suggestion: null },
  team: {
    selfMembershipId: 'm-owner',
    clinicHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      enabled: weekday > 0,
      start: '08:00',
      end: weekday === 6 ? '14:00' : '19:00',
      breaks: [],
    })),
    services: services.map(([id, name, category]) => ({
      id,
      name,
      category,
      sensitive: false,
      audience: 'all',
    })),
    professionals: [
      {
        id: 'b1b2c3d4-0000-4000-8000-000000000001',
        name: 'Joana Lima',
        role: 'Cabeleireira',
        gender: 'female',
        audience: 'all',
        membershipId: 'm-joana',
        photoAssetId: '',
        photoUrl: null,
        serviceIds: [services[0][0], services[1][0]],
        serviceAudiences: {},
        days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          enabled: weekday >= 2 && weekday <= 6,
          start: '09:00',
          end: weekday === 6 ? '14:00' : '18:00',
          breaks: weekday === 6 ? [] : [{ start: '12:00', end: '13:00' }],
        })),
      },
    ],
  },
  staff: {
    members: [
      {
        id: 'm-owner',
        name: 'Maria Aparecida',
        email: 'maria@example.com',
        role: 'owner',
        status: 'active',
        isSelf: true,
        professionalId: null,
        invitedAt: null,
        lastSignInAt: '2026-11-08T12:00:00.000Z',
      },
      {
        id: 'm-joana',
        name: 'Joana Lima',
        email: 'joana@example.com',
        role: 'professional',
        status: 'active',
        isSelf: false,
        professionalId: 'b1b2c3d4-0000-4000-8000-000000000001',
        invitedAt: '2026-11-01T12:00:00.000Z',
        lastSignInAt: '2026-11-07T12:00:00.000Z',
      },
      {
        id: 'm-ana',
        name: 'Ana Recepção',
        email: 'ana@example.com',
        role: 'reception',
        status: 'active',
        isSelf: false,
        professionalId: null,
        invitedAt: '2026-11-08T12:00:00.000Z',
        lastSignInAt: null,
      },
      {
        id: 'm-bia',
        name: 'Bia',
        email: 'bia@example.com',
        role: 'reception',
        status: 'revoked',
        isSelf: false,
        professionalId: null,
        invitedAt: '2026-10-01T12:00:00.000Z',
        lastSignInAt: '2026-10-05T12:00:00.000Z',
      },
    ],
  },
  library: {
    storageReady: true,
    canManage: true,
    usage: { libraryBytes: 48_500_000, otherBytes: 1_200_000, items: 3, trashed: 0 },
    folders: [
      { id: 'f-clients', name: 'Clientes', systemKey: 'clients', count: 0 },
      { id: 'f-ba', name: 'Antes e depois', systemKey: 'before_after', count: 0 },
      { id: 'f-mkt', name: 'Marketing', systemKey: 'marketing', count: 3 },
      { id: 'f-space', name: 'Espaço', systemKey: 'space', count: 0 },
      { id: 'f-team', name: 'Equipe', systemKey: 'team', count: 0 },
      { id: 'f-brides', name: 'Noivas 2026', systemKey: null, count: 0 },
    ],
  },
  'library/items?folder=f-mkt': {
    items: ['demo-hair', 'demo-studio', 'demo-portrait'].map((name, index) => ({
      id: `i-${index}`,
      folderId: 'f-mkt',
      title: ['Coloração cobre', 'Recepção nova', 'Ensaio de penteado'][index],
      createdAt: '2026-11-08T12:00:00.000Z',
      bytes: 420_000,
      thumbUrl: `${web}/clinic/${name}.webp`,
      fullUrl: `${web}/clinic/${name}.webp`,
    })),
  },
  dashboard: {
    today: '2026-11-09',
    upcomingWeek: 14,
    canManageAgenda: true,
    activePromotions: 1,
    clients: { newThisMonth: 4, total: 87 },
    finance: { monthIncomeCents: 482000, monthExpenseCents: 61000, todayExpectedCents: 61000 },
    lowStock: [{ name: 'Esmalte nude', quantity: 1, unit: 'fr' }],
    appointments: [
      ['09:00', 'Juliana Lima', 'Corte feminino', 'completed', 12000],
      ['10:30', 'Camila Santos', 'Coloração', 'confirmed', 20000],
      ['13:00', 'Beatriz Alves', 'Limpeza de pele', 'confirmed', 18000],
      ['15:30', 'Mariana Costa', 'Design de sobrancelhas', 'no_show', 6000],
    ].map(([time, client, service, status, price], index) => ({
      id: `a-${index}`,
      startsAt: `2026-11-09T${time}:00-03:00`,
      endsAt: `2026-11-09T${time}:00-03:00`,
      status,
      client,
      phone: '+5511987654321',
      service,
      professional: 'Joana Lima',
      priceCents: price,
      promotion: index === 1,
    })),
    activity: [
      {
        entity: 'appointments',
        action: 'INSERT',
        label: 'Camila Santos',
        detail: 'Coloração · 09/11 10:30',
        createdAt: new Date(Date.now() - 300000).toISOString(),
      },
      {
        entity: 'finance_entries',
        action: 'INSERT',
        label: 'Corte feminino · Juliana Lima',
        detail: '120,00',
        createdAt: new Date(Date.now() - 1800000).toISOString(),
      },
      {
        entity: 'clinic_clients',
        action: 'INSERT',
        label: 'Patrícia Gomes',
        detail: null,
        createdAt: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        entity: 'inventory_movements',
        action: 'INSERT',
        label: 'Esmalte nude',
        detail: 'Saída · saldo 1',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ],
  },
  catalog: {
    today: '2026-11-09',
    canManage: true,
    services: services.map(([id, name, category, priceCents, bookingMode], index) => ({
      id,
      name,
      category,
      description: '',
      priceCents,
      priceType: index === 4 ? 'from' : 'fixed',
      durationMinutes: 60,
      bookingMode,
      audience: 'all',
      sensitive: false,
      status: 'active',
      professionals: index === 2 ? 0 : 1,
      bookings90d: 12 - index * 2,
      promotion:
        index === 1 ? { id: 'p1', percent: 20, endsOn: '2026-11-30', priceCents: 20000 } : null,
    })),
    promotions: [
      {
        id: 'p1',
        name: 'Novembro colorido',
        percent: 20,
        startsOn: '2026-11-01',
        endsOn: '2026-11-30',
        status: 'active',
        showOnSite: true,
        serviceIds: [services[1][0]],
      },
    ],
  },
  'finance?month=2026-11': {
    month: '2026-11',
    today: '2026-11-09',
    totals: { incomeCents: 482000, expenseCents: 61000, balanceCents: 421000 },
    forecast: { cents: 380000, appointments: 21 },
    pending: [
      {
        appointmentId: 'x1',
        startsAt: '2026-11-09T12:00:00.000Z',
        priceCents: 12000,
        client: 'Juliana Lima',
        service: 'Corte feminino',
      },
    ],
    entries: [
      {
        id: 'e1',
        kind: 'income',
        amountCents: 20000,
        occurredOn: '2026-11-08',
        description: 'Coloração · Ana Paula',
        category: 'Atendimentos',
        method: 'pix',
        appointmentId: 'y',
      },
      {
        id: 'e2',
        kind: 'expense',
        amountCents: 61000,
        occurredOn: '2026-11-05',
        description: 'Reposição de produtos',
        category: 'Produtos',
        method: 'debit',
        appointmentId: null,
      },
    ],
  },
  inventory: {
    lowStock: 1,
    stockValueCents: 154000,
    items: [
      {
        id: 'i1',
        name: 'Esmalte nude',
        category: 'Unhas',
        unit: 'fr',
        quantity: 1,
        minQuantity: 3,
        costCents: 1200,
      },
      {
        id: 'i2',
        name: 'Shampoo profissional 1L',
        category: 'Cabelo',
        unit: 'fr',
        quantity: 6,
        minQuantity: 2,
        costCents: 4500,
      },
      {
        id: 'i3',
        name: 'Luvas descartáveis',
        category: 'Descartáveis',
        unit: 'cx',
        quantity: 12,
        minQuantity: 4,
        costCents: 3200,
      },
    ],
    movements: [
      {
        id: 'm1',
        name: 'Esmalte nude',
        unit: 'fr',
        kind: 'out',
        quantity: 2,
        balance: 1,
        note: 'Uso nos atendimentos',
        createdAt: new Date().toISOString(),
      },
    ],
  },
  marketing: {
    today: '2026-11-09',
    site: { slug: 'studio-lumiere', published: true },
    birthdays: [{ id: 'c1', name: 'Fernanda Rocha', phone: '+5511987654321', day: 14 }],
    inactive: [
      {
        id: 'c2',
        name: 'Patrícia Gomes',
        phone: '+5511987654321',
        lastVisit: '2026-08-20T12:00:00.000Z',
      },
    ],
  },
  overview: {
    services: services.map(([, name, , price]) => ({
      name,
      price_cents: price,
      duration_minutes: 60,
    })),
    professionals: [
      { display_name: 'Maria Aparecida', photo_url: null },
      { display_name: 'Joana Lima', photo_url: null },
    ],
  },
  showcase: {
    showcase: {
      style: 'classic',
      subtitle: 'Beleza e cuidado feitos para você',
      featured: [],
      gallery: ['g1', 'g2'],
    },
    initialHero: 'cabelo',
    services: services.map(([id, name, category]) => ({ id, name, category })),
    photos: [
      { id: 'g1', url: `${web}/clinic/demo-hair.webp` },
      { id: 'g2', url: `${web}/clinic/demo-studio.webp` },
    ],
  },
  'showcase/preview': {
    publication: { enabled: true, address: true, contacts: true },
    clinic: {
      slug: 'studio-lumiere',
      code: 'KW-4374',
      name: 'Studio Lumière',
      theme: 'rosa',
      heroCategory: 'cabelo',
      style: 'classic',
      subtitle: null,
      hidden: [],
      foundedYear: 2012,
      logoUrl: null,
      whatsapp: '+5511987654321',
      instagram: '@studiolumiere',
      facebook: null,
      website: null,
      location: {
        line: 'Rua Augusta',
        number: '1500',
        district: 'Consolação',
        city: 'São Paulo',
        state: 'SP',
        postalCode: '01304001',
      },
      hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        available: weekday > 0,
        periods: weekday > 0 ? [{ start: '09:00', end: '18:00' }] : [],
      })),
      services: services.map(([id, name, category, priceCents, bookingMode]) => ({
        id,
        name,
        category,
        description: null,
        priceCents,
        priceType: 'fixed',
        durationMinutes: 60,
        bookingMode,
      })),
      gallery: [],
      featured: [],
      servicePhotos: [],
    },
  },
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export default function QASettings({ view, tab }: { view: 'settings' | 'editor'; tab?: string }) {
  const api = useMemo<ClinicApi>(
    () => ({
      ready: true,
      async get<T>(path: string, query?: Record<string, string>) {
        await wait(700)
        if (path === 'slug' && query?.check) {
          const taken = ['lumiere', 'studio'].includes(query.check)
          return {
            ...(fixtures.slug as object),
            check: { slug: query.check, available: !taken, problem: taken ? 'taken' : null },
            suggestion: taken ? `${query.check}-sp` : null,
          } as T
        }
        if (path.startsWith('library/items') && !fixtures[path]) return { items: [] } as T
        if (path.startsWith('reports'))
          return {
            from: '2026-11-01',
            to: '2026-11-09',
            appointments: {
              total: 46,
              byStatus: {
                completed: { count: 38, cents: 512000 },
                no_show: { count: 3, cents: 0 },
                canceled: { count: 5, cents: 0 },
              },
              averageTicketCents: 13470,
              noShowRate: 0.073,
              cancelRate: 0.108,
            },
            finance: { incomeCents: 482000, expenseCents: 61000, balanceCents: 421000 },
            newClients: 4,
            topServices: [
              { name: 'Corte feminino', count: 18, cents: 216000 },
              { name: 'Coloração', count: 9, cents: 180000 },
              { name: 'Limpeza de pele', count: 7, cents: 126000 },
            ],
            professionals: [
              { name: 'Joana Lima', count: 27, cents: 330000 },
              { name: 'Maria Aparecida', count: 19, cents: 192000 },
            ],
            daily: Array.from({ length: 9 }, (_, index) => ({
              day: `2026-11-0${index + 1}`,
              appointments: [4, 6, 5, 7, 3, 0, 6, 8, 4][index],
              incomeCents: [48000, 72000, 51000, 90000, 36000, 0, 66000, 98000, 21000][index],
            })),
          } as T
        return structuredClone(fixtures[path]) as T
      },
      async put<T>() {
        await wait(600)
        return { saved: true } as T
      },
      async post<T>(path: string) {
        await wait(600)
        return (
          path === 'staff' ? { accountCreated: true, member: { id: 'x' } } : { archived: true }
        ) as T
      },
      async sendAccessEmail() {
        await wait(400)
      },
      async upload(_kind, file) {
        await wait(500)
        return { id: crypto.randomUUID(), url: URL.createObjectURL(file) }
      },
      async postalCode() {
        await wait(400)
        return {
          street: 'Avenida Paulista',
          district: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
        }
      },
    }),
    [],
  )
  const clinic = {
    id: '00000000-0000-4000-8000-000000000000',
    name: 'Studio Lumière',
    slug: 'studio-lumiere',
    status: 'active',
  }
  return (
    <ClinicApiProvider value={api}>
      <SpaceThemeProvider initialTheme="rosa">
        {view === 'editor' ? (
          <SiteEditor clinic={{ ...clinic, theme: 'rosa' }} backHref="/qa-settings-local" />
        ) : (
          <ManagerHome
            clinicName={clinic.name}
            userName="Maria"
            canManageSettings
            initialSection="configuracoes"
            initialSettingsTab={tab}
            media={<MediaLibrary clinicId={clinic.id} />}
            panels={{
              inicio: ({ navigate }) => (
                <HomeDashboard
                  clinicId={clinic.id}
                  sections={allowedSections(qaPermissions)}
                  onNavigate={navigate}
                />
              ),
              servicos: ({ createSignal, navigate }) => (
                <ServicesPanel
                  clinicId={clinic.id}
                  createSignal={createSignal}
                  onOpenTeam={() => navigate('Equipe e horários')}
                />
              ),
              financeiro: ({ createSignal }) => (
                <FinancePanel clinicId={clinic.id} createSignal={createSignal} />
              ),
              relatorios: () => <ReportsPanel clinicId={clinic.id} />,
              estoque: ({ createSignal }) => (
                <InventoryPanel clinicId={clinic.id} createSignal={createSignal} />
              ),
              marketing: ({ navigate }) => (
                <MarketingPanel clinicId={clinic.id} clinicName={clinic.name} onOpen={navigate} />
              ),
            }}
            shareCode="KW-4374"
            settings={(current, open) => (
              <ClinicSettings
                tab={current}
                onOpen={open}
                clinic={clinic}
                shareCode="KW-4374"
                canContinueOnboarding
                permissions={[
                  'settings:manage',
                  'team:manage',
                  'professional:manage',
                  'clinic:manage',
                ]}
                ownName="Maria Aparecida"
              />
            )}
          />
        )}
      </SpaceThemeProvider>
    </ClinicApiProvider>
  )
}
