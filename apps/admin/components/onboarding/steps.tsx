import { Button, Card, Checkbox, Separator, Switch, Label } from '@heroui/react'
import {
  AtSign,
  Building2,
  Calendar,
  Check,
  Clock3,
  CreditCard,
  Globe,
  Hash,
  IdCard,
  Mail,
  MapPin,
  Phone,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { formatBrPhone, toE164Phone } from '@/lib/phone'
import {
  categories,
  categoryIcon,
  dayNames,
  durationChoices,
  formatMoney,
  servicesInCategory,
  type Audience,
  type Payload,
  type Professional,
  type Service,
} from './model'
import {
  BlurDrawer,
  ChoiceCard,
  GlassField,
  GlassSelect,
  QuietButton,
  StepEnd,
  StepScroll,
  useOverlayState,
} from './ui'

const audienceOptions = [
  { id: 'all', label: 'Todos' },
  { id: 'women', label: 'Somente mulheres' },
  { id: 'men', label: 'Somente homens' },
]
const priceOptions = [
  { id: 'fixed', label: 'Preço fixo' },
  { id: 'from', label: 'A partir de' },
  { id: 'quote', label: 'Sob consulta' },
]
const bookingOptions = [
  { id: 'instant', label: 'Confirma na hora' },
  { id: 'request', label: 'Pedir confirmação' },
  { id: 'manual_release', label: 'Liberar datas manualmente' },
]

function priceLabel(service: Service) {
  if (service.priceType === 'quote') return 'Sob consulta'
  const prefix = service.priceType === 'from' ? 'A partir de ' : ''
  return `${prefix}${formatMoney(service.priceCents)}`
}

export function ContactStep({
  payload,
  phoneText,
  setPhoneText,
  setPayload,
  error,
  footer,
}: {
  payload: Payload
  phoneText: string
  setPhoneText: (value: string) => void
  setPayload: (value: Payload) => void
  error: string
  footer: ReactNode
}) {
  return (
    <Card className="ob2-panel">
      <Card.Content className="ob2-form">
        <GlassField
          label="Seu nome"
          icon={<UserRound size={18} />}
          autoComplete="name"
          value={payload.ownerName}
          placeholder="Ex.: Marina Alves"
          onChange={(value) => setPayload({ ...payload, ownerName: value })}
        />
        <GlassField
          label="E-mail de acesso"
          icon={<Mail size={18} />}
          type="email"
          autoComplete="email"
          value={payload.email}
          placeholder="marina@clinica.com"
          onChange={(value) => setPayload({ ...payload, email: value })}
        />
        <GlassField
          label="Celular com DDD"
          icon={<Phone size={18} />}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phoneText}
          placeholder="(11) 99999-0000"
          onChange={(value) => {
            setPhoneText(formatBrPhone(value) || value)
            setPayload({
              ...payload,
              phone: toE164Phone(value),
              clinic: { ...payload.clinic, whatsapp: toE164Phone(value) },
            })
          }}
        />
        <p className="ob2-copy">
          O celular ainda não recebe código. Quando o SMS estiver ativo, ele confirma que este
          cadastro é seu.
        </p>
        <Separator />
        <StepEnd error={error} footer={footer} />
      </Card.Content>
    </Card>
  )
}

export function ClinicStep({
  payload,
  setPayload,
  error,
  footer,
}: {
  payload: Payload
  setPayload: (value: Payload) => void
  error: string
  footer: ReactNode
}) {
  const details = useOverlayState()
  const change = (key: keyof Payload['clinic'], value: string) =>
    setPayload({ ...payload, clinic: { ...payload.clinic, [key]: value } })
  return (
    <>
      <Card className="ob2-panel">
        <Card.Content className="ob2-form">
          <GlassField
            label="Nome da clínica ou estúdio"
            icon={<Building2 size={18} />}
            value={payload.name}
            placeholder="Ex.: Studio Luna"
            onChange={(value) => setPayload({ ...payload, name: value })}
          />
          <QuietButton onPress={details.open}>Mais detalhes da clínica</QuietButton>
          <Separator />
          <StepEnd error={error} footer={footer} />
        </Card.Content>
      </Card>
      <BlurDrawer
        state={details}
        title="Mais detalhes"
        footer={
          <Button className="ob2-cta" fullWidth onPress={details.close}>
            Guardar nesta tela
          </Button>
        }
      >
        <p className="ob2-copy">
          Nada disto é obrigatório para abrir a clínica. Você completa quando quiser, no painel.
        </p>
        <GlassField
          label="Ano de abertura"
          icon={<Calendar size={18} />}
          inputMode="numeric"
          maxLength={4}
          value={payload.clinic.foundedYear}
          placeholder="2021"
          onChange={(value) => change('foundedYear', value.replace(/\D/g, ''))}
        />
        <GlassField
          label="Instagram"
          icon={<AtSign size={18} />}
          value={payload.clinic.instagram}
          placeholder="@studioluna"
          onChange={(value) => change('instagram', value)}
        />
        <GlassField
          label="Site ou página"
          icon={<Globe size={18} />}
          value={payload.clinic.website}
          placeholder="https://"
          onChange={(value) => change('website', value)}
        />
        <GlassField
          label="Facebook"
          icon={<Hash size={18} />}
          value={payload.clinic.facebook}
          placeholder="facebook.com/sua-clinica"
          onChange={(value) => change('facebook', value)}
        />
        <GlassField
          label="CPF ou CNPJ"
          icon={<IdCard size={18} />}
          value={payload.clinic.taxId}
          placeholder="Somente para o cadastro interno"
          onChange={(value) => change('taxId', value)}
        />
        <Separator />
        <p className="ob2-copy">
          A logo será enviada com segurança na primeira visita ao painel. A clínica já pode abrir
          sem ela.
        </p>
      </BlurDrawer>
    </>
  )
}

export function CatalogStep({
  payload,
  setPayload,
  error,
  footer,
}: {
  payload: Payload
  setPayload: (value: Payload) => void
  error: string
  footer: ReactNode
}) {
  const [area, setArea] = useState<string | null>(null)
  const custom = useOverlayState()
  const [customName, setCustomName] = useState('')
  const selectedNames = new Set(payload.services.map((service) => service.name))

  function toggle(item: { categoria: string; nome: string; descricao: string; duracao_minutos: number; preco_sugerido_brl: number }) {
    if (selectedNames.has(item.nome)) {
      const services = payload.services.filter((service) => service.name !== item.nome)
      setPayload({
        ...payload,
        services,
        occupations: payload.occupations.filter((category) =>
          services.some((service) => service.category === category),
        ),
      })
      return
    }
    setPayload({
      ...payload,
      occupations: [...new Set([...payload.occupations, item.categoria])],
      services: [
        ...payload.services,
        {
          category: item.categoria,
          name: item.nome,
          description: item.descricao,
          durationMinutes: item.duracao_minutos,
          priceCents: Math.round(item.preco_sugerido_brl * 100),
          priceType: item.preco_sugerido_brl ? 'fixed' : 'quote',
          bookingMode: 'instant',
          audience: 'all',
          resourceName: '',
          cancellationHours: null,
        },
      ],
    })
  }

  function addCustom() {
    const name = customName.trim()
    if (!name || payload.services.length >= 80) return
    setPayload({
      ...payload,
      occupations: [...new Set([...payload.occupations, 'Outros'])],
      services: [
        ...payload.services,
        {
          category: 'Outros',
          name,
          description: '',
          durationMinutes: 60,
          priceCents: 0,
          priceType: 'quote',
          bookingMode: 'request',
          audience: 'all',
          resourceName: '',
          cancellationHours: null,
        },
      ],
    })
    setCustomName('')
    custom.close()
  }

  const items = area ? servicesInCategory(area) : []
  return (
    <div className="ob2-stack">
      {area ? (
        <>
          <QuietButton onPress={() => setArea(null)}>Todas as áreas</QuietButton>
          <p className="ob2-copy">
            Marque o que {area.toLowerCase()} oferece. Dá para voltar e escolher outra área.
          </p>
          <StepScroll>
            {items.map((item) => {
              const selected = selectedNames.has(item.nome)
              return (
                <ChoiceCard
                  key={item.nome}
                  selected={selected}
                  icon={selected ? <Check size={18} /> : <Plus size={18} />}
                  title={item.nome}
                  detail={`${item.duracao_minutos} min · sugestão ${formatMoney(Math.round(item.preco_sugerido_brl * 100))}`}
                  onPress={() => toggle(item)}
                />
              )
            })}
          </StepScroll>
        </>
      ) : (
        <div className="ob2-grid">
          {categories.map((category) => {
            const Icon = categoryIcon(category)
            const count = payload.services.filter((service) => service.category === category).length
            return (
              <ChoiceCard
                key={category}
                icon={<Icon size={18} />}
                title={category}
                detail={count ? `${count} na agenda` : 'Ver serviços'}
                selected={count > 0}
                onPress={() => setArea(category)}
              />
            )
          })}
        </div>
      )}
      <p className="ob2-copy">
        {payload.services.length === 0
          ? 'Escolha pelo menos um serviço para a agenda nascer com horário.'
          : `${payload.services.length} serviço${payload.services.length === 1 ? '' : 's'} na agenda. Os preços ainda são sugestão.`}
      </p>
      <QuietButton onPress={custom.open} isDisabled={payload.services.length >= 80}>
        <Plus size={16} /> Serviço fora do catálogo
      </QuietButton>
      <StepEnd error={error} footer={footer} />
      <BlurDrawer
        state={custom}
        title="Serviço fora do catálogo"
        footer={
          <Button className="ob2-cta" fullWidth onPress={addCustom} isDisabled={!customName.trim()}>
            Adicionar à agenda
          </Button>
        }
      >
        <p className="ob2-copy">
          Use quando o atendimento não estiver na lista. Duração e preço você ajusta na etapa
          seguinte.
        </p>
        <GlassField
          label="Nome do serviço"
          icon={<Plus size={18} />}
          value={customName}
          placeholder="Ex.: Protocolo exclusivo"
          onChange={setCustomName}
        />
      </BlurDrawer>
    </div>
  )
}

export function ServicesStep({
  payload,
  setPayload,
  error,
  footer,
}: {
  payload: Payload
  setPayload: (value: Payload) => void
  error: string
  footer: ReactNode
}) {
  const editor = useOverlayState()
  const [index, setIndex] = useState<number | null>(null)
  const service = index != null ? payload.services[index] : undefined

  function update(patch: Partial<Service>) {
    if (index == null) return
    setPayload({
      ...payload,
      services: payload.services.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      ),
    })
  }

  function open(position: number) {
    setIndex(position)
    editor.open()
  }

  const durations = service
    ? durationChoices.includes(service.durationMinutes)
      ? durationChoices
      : [...durationChoices, service.durationMinutes].sort((left, right) => left - right)
    : durationChoices

  return (
    <div className="ob2-stack">
      {payload.services.length === 0 ? (
        <p className="ob2-copy">Volte ao catálogo e escolha pelo menos um serviço.</p>
      ) : (
        payload.services.map((item, position) => (
          <Card className="ob2-panel" key={`${item.name}-${position}`}>
            <Card.Content className="ob2-summary">
              <strong>{item.name}</strong>
              <p>
                {item.category} · {item.durationMinutes} min
              </p>
              <b>{priceLabel(item)}</b>
              <Button className="ob2-quiet" variant="ghost" onPress={() => open(position)}>
                Ajustar este serviço
              </Button>
            </Card.Content>
          </Card>
        ))
      )}
      <StepEnd error={error} footer={footer} />
      <BlurDrawer state={editor} title={service?.name || 'Ajustar serviço'}>
        {service && index != null ? (
          <>
            <GlassField
              label="Nome do serviço"
              value={service.name}
              onChange={(value) => update({ name: value })}
            />
            <GlassField
              label="Categoria"
              value={service.category}
              onChange={(value) => update({ category: value })}
            />
            <Separator />
            <GlassSelect
              label="Como cobrar"
              value={service.priceType}
              options={priceOptions}
              onChange={(value) => update({ priceType: value as Service['priceType'] })}
            />
            <GlassField
              label="Preço"
              inputMode="decimal"
              isDisabled={service.priceType === 'quote'}
              value={
                service.priceType === 'quote' ? '' : (service.priceCents / 100).toFixed(2).replace('.', ',')
              }
              placeholder="0,00"
              onChange={(value) =>
                update({
                  priceCents: Math.max(0, Math.round(Number(value.replace(',', '.')) * 100) || 0),
                })
              }
            />
            <GlassSelect
              label="Duração"
              value={String(service.durationMinutes)}
              options={durations.map((minutes) => ({ id: String(minutes), label: `${minutes} min` }))}
              onChange={(value) => update({ durationMinutes: Number(value) })}
            />
            <Separator />
            <GlassSelect
              label="Como entra na agenda"
              value={service.bookingMode}
              options={bookingOptions}
              onChange={(value) => update({ bookingMode: value as Service['bookingMode'] })}
            />
            <GlassSelect
              label="Público atendido"
              value={service.audience}
              options={audienceOptions}
              onChange={(value) => update({ audience: value as Audience })}
            />
            {service.bookingMode === 'manual_release' ? (
              <GlassField
                label="Máquina ou recurso"
                value={service.resourceName}
                placeholder="Ex.: Laser alugado"
                onChange={(value) => update({ resourceName: value })}
              />
            ) : null}
            <Button
              className="ob2-quiet"
              variant="danger-soft"
              onPress={() => {
                setPayload({
                  ...payload,
                  services: payload.services.filter((_, position) => position !== index),
                })
                setIndex(null)
                editor.close()
              }}
            >
              <Trash2 size={16} /> Remover serviço
            </Button>
          </>
        ) : null}
      </BlurDrawer>
    </div>
  )
}

export function TeamStep({
  payload,
  setPayload,
  error,
  footer,
}: {
  payload: Payload
  setPayload: (value: Payload) => void
  error: string
  footer: ReactNode
}) {
  const editor = useOverlayState()
  const [index, setIndex] = useState<number | null>(null)
  const professional = index != null ? payload.professionals[index] : undefined

  function setMode(mode: 'solo' | 'team') {
    setPayload({
      ...payload,
      teamMode: mode,
      professionals:
        mode === 'solo'
          ? [
              {
                name: payload.ownerName,
                role: 'Proprietária / profissional',
                audience: 'all',
                serviceNames: payload.services.map((service) => service.name),
              },
            ]
          : [],
    })
  }

  function update(patch: Partial<Professional>) {
    if (index == null) return
    setPayload({
      ...payload,
      professionals: payload.professionals.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      ),
    })
  }

  return (
    <div className="ob2-stack">
      <div className="ob2-grid">
        <ChoiceCard
          title="Somente eu"
          detail="Você realiza todos os serviços"
          icon={<UserRound size={18} />}
          selected={payload.teamMode === 'solo'}
          onPress={() => setMode('solo')}
        />
        <ChoiceCard
          title="Tenho equipe"
          detail="Cada pessoa com seus atendimentos"
          icon={<UserRound size={18} />}
          selected={payload.teamMode === 'team'}
          onPress={() => setMode('team')}
        />
      </div>
      {payload.teamMode === 'solo' ? (
        <Card className="ob2-panel">
          <Card.Content>
            <p className="ob2-copy">
              <strong>{payload.ownerName || 'Você'}</strong> entra como profissional principal.{' '}
              {payload.services.length === 1
                ? 'O serviço escolhido fica vinculado a você.'
                : `Os ${payload.services.length} serviços escolhidos ficam vinculados a você.`}{' '}
              Convites de recepção continuam para o painel.
            </p>
          </Card.Content>
        </Card>
      ) : (
        <>
          {payload.professionals.map((item, position) => (
            <Card className="ob2-panel" key={position}>
              <Card.Content className="ob2-summary">
                <strong>{item.name || 'Profissional sem nome'}</strong>
                <p>
                  {item.role || 'Profissional'} · {item.serviceNames.length}{' '}
                  {item.serviceNames.length === 1 ? 'serviço' : 'serviços'}
                </p>
                <Button
                  className="ob2-quiet"
                  variant="ghost"
                  onPress={() => {
                    setIndex(position)
                    editor.open()
                  }}
                >
                  Ajustar profissional
                </Button>
              </Card.Content>
            </Card>
          ))}
          <QuietButton
            onPress={() => {
              const next = payload.professionals.length
              setPayload({
                ...payload,
                professionals: [
                  ...payload.professionals,
                  {
                    name: '',
                    role: 'Profissional',
                    audience: 'all',
                    serviceNames: payload.services.map((service) => service.name),
                  },
                ],
              })
              setIndex(next)
              editor.open()
            }}
          >
            <Plus size={16} /> Adicionar profissional
          </QuietButton>
          <p className="ob2-copy">
            Contas, convites e permissões de recepção ou financeiro ficam para depois, com acesso
            individual.
          </p>
        </>
      )}
      <StepEnd error={error} footer={footer} />
      <BlurDrawer state={editor} title={professional?.name || 'Profissional'}>
        {professional && index != null ? (
          <>
            <GlassField
              label="Nome"
              icon={<UserRound size={18} />}
              value={professional.name}
              placeholder="Ex.: Camila"
              onChange={(value) => update({ name: value })}
            />
            <GlassField
              label="Função"
              value={professional.role}
              placeholder="Ex.: Esteticista"
              onChange={(value) => update({ role: value })}
            />
            <GlassSelect
              label="Público"
              value={professional.audience}
              options={audienceOptions}
              onChange={(value) => update({ audience: value as Audience })}
            />
            <Separator />
            <p className="ob2-copy">Serviços que esta pessoa realiza.</p>
            <div className="ob2-checks">
              {payload.services.map((service) => {
                const selected = professional.serviceNames.includes(service.name)
                return (
                  <Checkbox
                    key={service.name}
                    isSelected={selected}
                    onChange={(isSelected) =>
                      update({
                        serviceNames: isSelected
                          ? [...professional.serviceNames, service.name]
                          : professional.serviceNames.filter((name) => name !== service.name),
                      })
                    }
                  >
                    <Checkbox.Content>
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      <Label>{service.name}</Label>
                    </Checkbox.Content>
                  </Checkbox>
                )
              })}
            </div>
            <Button
              className="ob2-quiet"
              variant="danger-soft"
              onPress={() => {
                setPayload({
                  ...payload,
                  professionals: payload.professionals.filter((_, position) => position !== index),
                })
                setIndex(null)
                editor.close()
              }}
            >
              <Trash2 size={16} /> Remover
            </Button>
          </>
        ) : null}
      </BlurDrawer>
    </div>
  )
}

export function ScheduleStep({
  payload,
  setPayload,
  error,
  footer,
}: {
  payload: Payload
  setPayload: (value: Payload) => void
  error: string
  footer: ReactNode
}) {
  const changeClinic = (key: keyof Payload['clinic'], value: string) =>
    setPayload({ ...payload, clinic: { ...payload.clinic, [key]: value } })
  const updateDay = (weekday: number, patch: Partial<Payload['businessHours'][number]>) =>
    setPayload({
      ...payload,
      businessHours: payload.businessHours.map((day) =>
        day.weekday === weekday ? { ...day, ...patch } : day,
      ),
    })
  return (
    <div className="ob2-stack">
      <Card className="ob2-panel">
        <Card.Content className="ob2-form">
          <GlassField
            label="Endereço"
            icon={<MapPin size={18} />}
            value={payload.clinic.addressLine}
            placeholder="Rua, número e complemento"
            onChange={(value) => changeClinic('addressLine', value)}
          />
          <GlassField
            label="Cidade"
            value={payload.clinic.city}
            placeholder="Ex.: São Paulo"
            onChange={(value) => changeClinic('city', value)}
          />
          <GlassField
            label="Estado"
            value={payload.clinic.state}
            maxLength={2}
            placeholder="SP"
            onChange={(value) => changeClinic('state', value.toUpperCase())}
          />
          <GlassField
            label="CEP"
            value={payload.clinic.postalCode}
            placeholder="00000-000"
            onChange={(value) => changeClinic('postalCode', value)}
          />
          <p className="ob2-copy">O endereço pode ficar em branco e ser completado no painel.</p>
        </Card.Content>
      </Card>
      <p className="ob2-copy">
        <Clock3 size={16} /> Ligue os dias em que a clínica atende. A agenda individual da equipe
        usa este horário como base.
      </p>
      <StepScroll>
        {payload.businessHours.map((day) => (
          <div className="ob2-day" key={day.weekday}>
            <Switch isSelected={day.enabled} onChange={(enabled) => updateDay(day.weekday, { enabled })}>
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <Label>{dayNames[day.weekday]}</Label>
              </Switch.Content>
            </Switch>
            {day.enabled ? (
              <div className="ob2-hours">
                <GlassField
                  label="Abre"
                  type="time"
                  value={day.start}
                  onChange={(value) => updateDay(day.weekday, { start: value })}
                />
                <GlassField
                  label="Fecha"
                  type="time"
                  value={day.end}
                  onChange={(value) => updateDay(day.weekday, { end: value })}
                />
              </div>
            ) : (
              <p className="ob2-copy">Fechado neste dia.</p>
            )}
          </div>
        ))}
      </StepScroll>
      <StepEnd error={error} footer={footer} />
    </div>
  )
}

export function PreferencesStep({
  payload,
  setPayload,
  error,
  footer,
}: {
  payload: Payload
  setPayload: (value: Payload) => void
  error: string
  footer: ReactNode
}) {
  const change = (patch: Partial<Payload['preferences']>) =>
    setPayload({ ...payload, preferences: { ...payload.preferences, ...patch } })
  return (
    <div className="ob2-stack">
      <div className="ob2-grid">
        <ChoiceCard
          title="Receber fora do app"
          detail="Pix, maquininha ou link da própria clínica"
          icon={<CreditCard size={18} />}
          selected={!payload.preferences.acceptInApp}
          onPress={() => change({ acceptInApp: false })}
        />
        <ChoiceCard
          title="Pagamentos no app"
          detail="Guardamos a preferência. O Stripe Connect fica para o painel"
          icon={<CreditCard size={18} />}
          selected={payload.preferences.acceptInApp}
          onPress={() => change({ acceptInApp: true })}
        />
      </div>
      <Card className="ob2-panel">
        <Card.Content className="ob2-form">
          <GlassSelect
            label="Cancelamento padrão"
            value={String(payload.preferences.cancellationHours)}
            options={[4, 8, 12, 24, 48].map((hours) => ({
              id: String(hours),
              label: `${hours} horas antes`,
            }))}
            onChange={(value) => change({ cancellationHours: Number(value) })}
          />
          <GlassSelect
            label="Procedimentos especiais"
            value={String(payload.preferences.specialCancellationHours)}
            options={[12, 24, 48, 72].map((hours) => ({
              id: String(hours),
              label: `${hours} horas antes`,
            }))}
            onChange={(value) => change({ specialCancellationHours: Number(value) })}
          />
          <GlassSelect
            label="Pacotes de sessões"
            value={payload.preferences.packagePaymentMode}
            options={[
              { id: 'clinic_only', label: 'Receber somente na clínica' },
              { id: 'in_app', label: 'Receber somente no app' },
              { id: 'both', label: 'Aceitar das duas formas' },
            ]}
            onChange={(value) =>
              change({
                packagePaymentMode: value as Payload['preferences']['packagePaymentMode'],
              })
            }
          />
          <p className="ob2-copy">
            Nenhuma cobrança acontece agora. Prazos, taxas e a verificação do recebimento aparecem
            antes de qualquer ativação.
          </p>
        </Card.Content>
      </Card>
      <StepEnd error={error} footer={footer} />
    </div>
  )
}

export function ReviewStep({ payload, error, footer }: { payload: Payload; error: string; footer: ReactNode }) {
  const facts = [
    { label: 'Clínica', value: payload.name || 'Nome ainda não informado' },
    {
      label: 'Contato',
      value: `${payload.ownerName || 'Sem nome'} · ${formatBrPhone(payload.phone) || 'sem celular'}`,
    },
    {
      label: 'Catálogo',
      value: `${payload.services.length} ${payload.services.length === 1 ? 'serviço' : 'serviços'} em ${payload.occupations.length} ${payload.occupations.length === 1 ? 'categoria' : 'categorias'}`,
    },
    {
      label: 'Equipe',
      value:
        payload.teamMode === 'solo'
          ? 'Somente você'
          : `${payload.professionals.length} ${payload.professionals.length === 1 ? 'profissional' : 'profissionais'}`,
    },
    {
      label: 'Agenda',
      value: `${payload.businessHours.filter((day) => day.enabled).length} dias por semana`,
    },
    {
      label: 'Cancelamento',
      value: `${payload.preferences.cancellationHours}h no padrão e ${payload.preferences.specialCancellationHours}h nos especiais`,
    },
    {
      label: 'Pagamento',
      value: payload.preferences.acceptInApp
        ? 'Interesse em receber no app'
        : 'Recebimento fora do app',
    },
    {
      label: 'Endereço',
      value: payload.clinic.city
        ? `${payload.clinic.addressLine || 'A definir'}, ${payload.clinic.city}/${payload.clinic.state || '—'}`
        : 'Pode completar depois',
    },
  ]
  return (
    <div className="ob2-stack">
      <p className="ob2-copy">
        Confira o que vai valer no primeiro dia. Se algo estiver errado, volte pela seta — o
        rascunho continua salvo.
      </p>
      {facts.map((fact) => (
        <Card className="ob2-panel" key={fact.label}>
          <Card.Content className="ob2-fact">
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
          </Card.Content>
        </Card>
      ))}
      <StepEnd error={error} footer={footer} />
    </div>
  )
}
