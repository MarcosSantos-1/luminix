import { Button, Card, Checkbox, ScrollShadow, Separator, Switch, Label } from '@heroui/react'
import {
  AtSign,
  Banknote,
  Building2,
  Calendar,
  Check,
  Clock3,
  CreditCard,
  Globe,
  Hash,
  IdCard,
  ImagePlus,
  Mars,
  MoreHorizontal,
  Plus,
  Scissors,
  Search,
  Trash2,
  Upload,
  UserRound,
  Users,
  Venus,
} from 'lucide-react'
import Image from 'next/image'
import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { formatBrPhone } from '@/lib/phone'
import {
  categories,
  categoryArtSrc,
  dayNames,
  durationChoices,
  formatMoney,
  servicesInCategory,
  type Audience,
  type Payload,
  type Professional,
  type Service,
} from './model'
import { defaultBreak, TimePicker } from './time-picker'
import {
  BlurDrawer,
  ChoiceCard,
  GlassField,
  GlassSelect,
  QuietButton,
  StepEnd,
  useOverlayState,
} from './ui'

const priceOptions = [
  { id: 'fixed', label: 'Preço fixo' },
  { id: 'from', label: 'A partir de' },
  { id: 'quote', label: 'Sob consulta' },
]

const audienceChoices = [
  { id: 'all', label: 'Todos', icon: Users, tone: 'all' },
  { id: 'women', label: 'Somente mulheres', icon: Venus, tone: 'women' },
  { id: 'men', label: 'Somente homens', icon: Mars, tone: 'men' },
] as const

function AudienceChoices({
  value,
  onChange,
}: {
  value: Audience
  onChange: (value: Audience) => void
}) {
  return (
    <div className="ob2-audience">
      {audienceChoices.map((option) => {
        const Icon = option.icon
        return (
          <Checkbox
            key={option.id}
            className={`ob2-audience-option is-${option.tone}`}
            isSelected={value === option.id}
            onChange={() => onChange(option.id)}
          >
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <span className="ob2-audience-icon" aria-hidden>
                <Icon size={18} />
              </span>
              <Label>{option.label}</Label>
            </Checkbox.Content>
          </Checkbox>
        )
      })}
    </div>
  )
}

function maskTaxId(kind: 'cpf' | 'cnpj', value: string) {
  const digits = value.replace(/\D/g, '').slice(0, kind === 'cpf' ? 11 : 14)
  if (kind === 'cpf') {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

function selectedByCategory(services: Payload['services']) {
  const grouped = new Map<string, string[]>()
  for (const service of services) {
    const names = grouped.get(service.category) ?? []
    names.push(service.name)
    grouped.set(service.category, names)
  }
  const known = categories.filter((category) => grouped.has(category))
  const extra = [...grouped.keys()].filter(
    (category) => !(categories as readonly string[]).includes(category),
  )
  return [...known, ...extra].map((category) => ({
    category,
    names: grouped.get(category) ?? [],
  }))
}

function priceLabel(service: Service) {
  if (service.priceType === 'quote') return 'Sob consulta'
  const prefix = service.priceType === 'from' ? 'A partir de ' : ''
  return `${prefix}${formatMoney(service.priceCents)}`
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
  const kind = payload.clinic.taxIdKind === 'cpf' ? 'cpf' : 'cnpj'
  return (
    <>
      <Card className="ob2-panel">
        <Card.Content className="ob2-form ob2-clinic-form">
          <div className="ob2-clinic-layout">
            <div className="ob2-clinic-fields">
              <GlassField
                label="Nome da clínica ou estúdio"
                icon={<Building2 size={18} />}
                value={payload.name}
                placeholder="Nome do espaço"
                onChange={(value) => setPayload({ ...payload, name: value })}
              />
              <GlassField
                label="Ano de abertura"
                icon={<Calendar size={18} />}
                inputMode="numeric"
                maxLength={4}
                value={payload.clinic.foundedYear}
                placeholder="AAAA"
                onChange={(value) => change('foundedYear', value.replace(/\D/g, ''))}
              />
              <div className="ob2-tax-kind">
                <Button
                  className={kind === 'cnpj' ? 'is-selected' : ''}
                  variant="ghost"
                  onPress={() =>
                    setPayload({
                      ...payload,
                      clinic: {
                        ...payload.clinic,
                        taxIdKind: 'cnpj',
                        taxId: maskTaxId('cnpj', payload.clinic.taxId),
                      },
                    })
                  }
                >
                  CNPJ
                </Button>
                <Button
                  className={kind === 'cpf' ? 'is-selected' : ''}
                  variant="ghost"
                  onPress={() =>
                    setPayload({
                      ...payload,
                      clinic: {
                        ...payload.clinic,
                        taxIdKind: 'cpf',
                        taxId: maskTaxId('cpf', payload.clinic.taxId),
                      },
                    })
                  }
                >
                  CPF
                </Button>
              </div>
              <GlassField
                label={kind === 'cnpj' ? 'CNPJ' : 'CPF'}
                icon={<IdCard size={18} />}
                inputMode="numeric"
                value={payload.clinic.taxId}
                placeholder={kind === 'cnpj' ? '00.000.000/0000-00' : '000.000.000-00'}
                onChange={(value) => change('taxId', maskTaxId(kind, value))}
              />
            </div>
            <ClinicLogoDropzone />
          </div>
          <div className="ob2-clinic-more">
            <QuietButton onPress={details.open}>
              <MoreHorizontal size={16} /> Mais detalhes da clínica
            </QuietButton>
          </div>
          <div className="ob2-clinic-continue">
            <StepEnd error={error} footer={footer} />
          </div>
        </Card.Content>
      </Card>
      <BlurDrawer state={details} title="Mais detalhes">
        <p className="ob2-copy">
          Nada disto é obrigatório para abrir a clínica. Você completa quando quiser, no painel.
        </p>
        <GlassField
          label="Instagram"
          icon={<AtSign size={18} />}
          value={payload.clinic.instagram}
          placeholder="@clinica"
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
          placeholder="facebook.com/clinica"
          onChange={(value) => change('facebook', value)}
        />
      </BlurDrawer>
    </>
  )
}

function ClinicLogoDropzone() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [dragging, setDragging] = useState(false)

  function acceptFile(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    setFileName(file.name)
    const url = URL.createObjectURL(file)
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return url
    })
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    acceptFile(event.dataTransfer.files?.[0])
  }

  return (
    <div
      className={`ob2-logo-drop${dragging ? ' is-dragging' : ''}${preview ? ' has-preview' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault()
        setDragging(false)
      }}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          inputRef.current?.click()
        }
      }}
      aria-label="Adicionar logo da clínica"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        hidden
        onChange={(event) => acceptFile(event.target.files?.[0])}
      />
      {preview ? (
        <>
          <img src={preview} alt="" className="ob2-logo-preview" />
          <div className="ob2-logo-drop-meta">
            <strong>{fileName || 'Logo selecionada'}</strong>
            <span>Clique ou arraste para trocar · envio depois no painel</span>
          </div>
        </>
      ) : (
        <>
          <span className="ob2-logo-drop-icon" aria-hidden>
            <ImagePlus size={28} />
          </span>
          <strong>Logo da clínica</strong>
          <span>
            Arraste uma imagem ou <em>escolha o arquivo</em>
          </span>
          <small>PNG, JPG ou WebP</small>
        </>
      )}
      {!preview ? (
        <span className="ob2-logo-drop-hint" aria-hidden>
          <Upload size={14} /> Solte aqui
        </span>
      ) : null}
    </div>
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
    if (!name || !area || payload.services.length >= 80) return
    if (selectedNames.has(name)) {
      setCustomName('')
      custom.close()
      return
    }
    setPayload({
      ...payload,
      occupations: [...new Set([...payload.occupations, area])],
      services: [
        ...payload.services,
        {
          category: area,
          name,
          description: '',
          durationMinutes: 60,
          priceCents: 0,
          priceType: 'quote',
          bookingMode: 'instant',
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
  const picked = selectedByCategory(payload.services)
  return (
    <div className="ob2-stack">
      <div className={picked.length ? 'ob2-catalog has-picked' : 'ob2-catalog'}>
        <div className="ob2-catalog-main">
          {area ? (
            <>
              <p className="ob2-catalog-note">
                Marque o que {area.toLowerCase()} oferece. Para seguir, volte a todas as áreas.
              </p>
              <div className="ob2-services">
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
                <QuietButton
                  onPress={custom.open}
                  isDisabled={payload.services.length >= 80}
                >
                  <span className="ob2-add-service-icon" aria-hidden>
                    <Plus size={16} />
                  </span>
                  Adicionar serviço
                </QuietButton>
              </div>
            </>
          ) : (
            <div className="ob2-categories">
              {categories.map((category) => {
                const art = categoryArtSrc(category)
                const count = payload.services.filter((service) => service.category === category)
                  .length
                return (
                  <ChoiceCard
                    key={category}
                    className="ob2-category-card"
                    icon={
                      art ? (
                        <Image
                          className="ob2-category-icon"
                          src={art}
                          alt=""
                          width={512}
                          height={512}
                        />
                      ) : (
                        <Scissors size={18} />
                      )
                    }
                    title={category}
                    detail={count ? `${count} na agenda` : 'Ver serviços'}
                    selected={count > 0}
                    onPress={() => setArea(category)}
                  />
                )
              })}
            </div>
          )}
        </div>
        {picked.length > 0 && (
          <aside className="ob2-picked" aria-label="Serviços selecionados">
            <strong>Na agenda</strong>
            <ScrollShadow className="ob2-picked-scroll" orientation="vertical" hideScrollBar>
              <div className="ob2-picked-groups">
                {picked.map((group) => (
                  <div className="ob2-picked-group" key={group.category}>
                    <div className="ob2-picked-head">
                      <span>{group.category}</span>
                      <b>{group.names.length}</b>
                    </div>
                    <ul>
                      {group.names.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </ScrollShadow>
          </aside>
        )}
      </div>
      <p className="ob2-catalog-note">
        {payload.services.length === 0
          ? 'Escolha pelo menos um serviço para a agenda nascer com horário.'
          : `${payload.services.length} serviço${payload.services.length === 1 ? '' : 's'} na agenda. Os preços ainda são sugestão.`}
      </p>
      {area ? (
        <>
          {error ? (
            <p className="ob2-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button className="ob2-cta" fullWidth onPress={() => setArea(null)}>
            Todas as áreas
          </Button>
        </>
      ) : (
        <StepEnd error={error} footer={footer} />
      )}
      <BlurDrawer
        state={custom}
        placement="bottom"
        title={area ? `Adicionar serviço · ${area}` : 'Adicionar serviço'}
        footer={
          <Button
            className="ob2-cta"
            fullWidth
            onPress={addCustom}
            isDisabled={!customName.trim() || !area}
          >
            Adicionar à agenda
          </Button>
        }
      >
        <p className="ob2-copy">
          Este atendimento entra em <strong>{area}</strong>. Duração e preço você ajusta na etapa
          seguinte.
        </p>
        <GlassField
          label="Nome do serviço"
          icon={<Plus size={18} />}
          value={customName}
          placeholder="Nome do atendimento"
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
  const [query, setQuery] = useState('')
  const service = index != null ? payload.services[index] : undefined
  const visibleServices = payload.services
    .map((item, position) => ({ item, position }))
    .filter(({ item }) => item.name.toLowerCase().includes(query.trim().toLowerCase()))

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
    setPayload({
      ...payload,
      services: payload.services.map((item, current) =>
        current === position
          ? {
              ...item,
              bookingMode: 'instant',
              durationMinutes: item.durationMinutes < 30 ? 30 : item.durationMinutes,
            }
          : item,
      ),
    })
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
      <GlassField
        label="Buscar serviço"
        icon={<Search size={18} />}
        value={query}
        placeholder="Nome do atendimento"
        onChange={setQuery}
      />
      {payload.services.length === 0 ? (
        <p className="ob2-copy">Volte ao catálogo e escolha pelo menos um serviço.</p>
      ) : visibleServices.length === 0 ? (
        <p className="ob2-copy">Nenhum serviço com esse nome.</p>
      ) : (
        <div className="ob2-detail-grid">
          {visibleServices.map(({ item, position }) => (
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
          ))}
        </div>
      )}
      <StepEnd error={error} footer={footer} />
      <BlurDrawer state={editor} title={service?.name || 'Ajustar serviço'}>
        {service && index != null ? (
          <>
            <GlassField
              label="Nome do serviço"
              icon={<Scissors size={18} />}
              value={service.name}
              onChange={(value) => update({ name: value })}
            />
            <Separator />
            <GlassSelect
              label="Como cobrar"
              menu="ice"
              value={service.priceType}
              options={priceOptions}
              onChange={(value) => update({ priceType: value as Service['priceType'] })}
            />
            <GlassField
              label="Preço"
              icon={<Banknote size={18} />}
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
              label={
                <>
                  <Clock3 size={16} /> Duração
                </>
              }
              menu="ice"
              value={String(service.durationMinutes)}
              options={durations.map((minutes) => ({ id: String(minutes), label: `${minutes} min` }))}
              onChange={(value) => update({ durationMinutes: Number(value) })}
            />
            <Separator />
            <p className="ob2-copy">Público atendido</p>
            <AudienceChoices value={service.audience} onChange={(audience) => update({ audience })} />
            <Button
              className="ob2-remove-service"
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
                name: payload.ownerName.trim() || 'Você',
                role: 'Proprietária / profissional',
                audience: 'all',
                serviceNames: payload.services.map((service) => service.name).filter((name) => name.trim()),
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
                  {item.role || 'Sem função'} · {item.serviceNames.length}{' '}
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
                    role: '',
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
      <BlurDrawer state={editor} title={professional?.name || 'Nova profissional'}>
        {professional && index != null ? (
          <>
            <GlassField
              label="Nome"
              icon={<UserRound size={18} />}
              value={professional.name}
              placeholder="Nome da profissional"
              onChange={(value) => update({ name: value })}
            />
            <GlassField
              label="Função"
              value={professional.role}
              placeholder="Cargo ou especialidade"
              onChange={(value) => update({ role: value })}
            />
            <p className="ob2-copy">Público</p>
            <AudienceChoices
              value={professional.audience}
              onChange={(audience) => update({ audience })}
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

function formatCep(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
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
  const [open, setOpen] = useState(payload.clinic.addressLine.trim() === '')
  const summary = [payload.clinic.addressLine, payload.clinic.addressNumber].filter(Boolean).join(', ')
  return (
    <div className="ob2-stack">
      <Card className="ob2-panel">
        <Card.Content className="ob2-form">
          {open ? (
            <>
              <div className="ob2-address-hero">
                <Image
                  className="ob2-address-art"
                  src="/brand/onboarding/studio-1.png"
                  alt=""
                  width={1254}
                  height={1254}
                />
              </div>
              <GlassField
                label="CEP"
                inputMode="numeric"
                value={payload.clinic.postalCode}
                placeholder="00000-000"
                onChange={(value) => changeClinic('postalCode', formatCep(value))}
                suffix={
                  <Button className="ob2-cep" variant="primary" onPress={() => undefined}>
                    <span className="ob2-cep-long">Procurar endereço</span>
                    <span className="ob2-cep-short">Procurar</span>
                  </Button>
                }
              />
              <div className="ob2-address-line">
                <GlassField
                  className="ob2-address-emphasis"
                  label="Endereço"
                  value={payload.clinic.addressLine}
                  placeholder="Rua, avenida ou travessa"
                  onChange={(value) => changeClinic('addressLine', value)}
                />
                <GlassField
                  label="Número"
                  value={payload.clinic.addressNumber}
                  placeholder="Nº"
                  onChange={(value) => changeClinic('addressNumber', value)}
                />
              </div>
              <div className="ob2-city-state">
                <GlassField
                  label="Cidade"
                  value={payload.clinic.city}
                  placeholder="Cidade"
                  onChange={(value) => changeClinic('city', value)}
                />
                <GlassField
                  label="Estado"
                  value={payload.clinic.state}
                  maxLength={2}
                  placeholder="SP"
                  onChange={(value) => changeClinic('state', value.toUpperCase())}
                />
              </div>
              <GlassField
                label="Observação do endereço (opcional)"
                value={payload.clinic.addressNote}
                placeholder="Sala, bloco ou ponto de referência"
                onChange={(value) => changeClinic('addressNote', value)}
              />
              {payload.clinic.addressLine.trim() ? (
                <Button className="ob2-quiet" variant="ghost" onPress={() => setOpen(false)}>
                  Recolher endereço
                </Button>
              ) : null}
            </>
          ) : (
            <Button className="ob2-address-summary" variant="ghost" onPress={() => setOpen(true)}>
              <Image
                className="ob2-address-art ob2-address-art-small"
                src="/brand/onboarding/studio-1.png"
                alt=""
                width={1254}
                height={1254}
              />
              <span>{summary || 'Endereço'}</span>
              <small>Editar</small>
            </Button>
          )}
        </Card.Content>
      </Card>
      <StepEnd error={error} footer={footer} />
    </div>
  )
}

export function HoursStep({
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
  const updateDay = (weekday: number, patch: Partial<Payload['businessHours'][number]>) =>
    setPayload({
      ...payload,
      businessHours: payload.businessHours.map((day) =>
        day.weekday === weekday ? { ...day, ...patch } : day,
      ),
    })
  return (
    <div className="ob2-stack">
      <Card className="ob2-panel ob2-hours-card">
        <Card.Content className="ob2-hours-list">
          {payload.businessHours.map((day) => {
            const breaks = day.breaks ?? []
            return (
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
                <div className="ob2-day-schedule">
                  <div className="ob2-hours">
                    <TimePicker
                      label="Abre"
                      value={day.start}
                      onChange={(value) => updateDay(day.weekday, { start: value })}
                    />
                    <TimePicker
                      label="Fecha"
                      value={day.end}
                      onChange={(value) => updateDay(day.weekday, { end: value })}
                    />
                  </div>
                  {breaks.map((item, index) => (
                    <div className="ob2-break" key={`${day.weekday}-${index}`}>
                      <TimePicker
                        label="Intervalo começa"
                        value={item.start}
                        onChange={(value) =>
                          updateDay(day.weekday, {
                            breaks: breaks.map((entry, position) =>
                              position === index ? { ...entry, start: value } : entry,
                            ),
                          })
                        }
                      />
                      <TimePicker
                        label="Intervalo termina"
                        value={item.end}
                        onChange={(value) =>
                          updateDay(day.weekday, {
                            breaks: breaks.map((entry, position) =>
                              position === index ? { ...entry, end: value } : entry,
                            ),
                          })
                        }
                      />
                      <Button
                        className="ob2-icon ob2-break-remove"
                        isIconOnly
                        variant="ghost"
                        aria-label={`Remover intervalo de ${dayNames[day.weekday]}`}
                        onPress={() =>
                          updateDay(day.weekday, {
                            breaks: breaks.filter((_, position) => position !== index),
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  ))}
                  {breaks.length < 3 ? (
                    <Button
                      className="ob2-quiet"
                      variant="ghost"
                      onPress={() =>
                        updateDay(day.weekday, {
                          breaks: [...breaks, defaultBreak(day.start, day.end)],
                        })
                      }
                    >
                      <Plus size={16} /> Adicionar intervalo
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="ob2-copy">Fechado neste dia.</p>
              )}
            </div>
            )
          })}
        </Card.Content>
      </Card>
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
      label: 'Serviços',
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
        ? `${[payload.clinic.addressLine, payload.clinic.addressNumber].filter(Boolean).join(', ') || 'A definir'}, ${payload.clinic.city}/${payload.clinic.state || '—'}`
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
