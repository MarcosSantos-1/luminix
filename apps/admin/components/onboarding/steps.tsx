import {
  Button,
  Card,
  Checkbox,
  Label,
  Link as TextLink,
  ScrollShadow,
  Separator,
  Switch,
  toast,
} from '@heroui/react'
import {
  AtSign,
  Banknote,
  Briefcase,
  Building2,
  Calendar,
  Check,
  Clock3,
  CreditCard,
  Globe,
  Hash,
  IdCard,
  ImagePlus,
  Info,
  ListChecks,
  Mail,
  MapPin,
  Mars,
  MoreHorizontal,
  Plus,
  Phone,
  Scissors,
  Search,
  Shield,
  Trash2,
  Upload,
  UserPlus,
  UserRound,
  Users,
  Venus,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { syncProfessionalSchedules } from './schedule-sync'
import { formatBrPhone, toE164Phone } from '@/lib/phone'
import { useStaff } from '@/components/staff-provider'
import { useClinic } from '@/components/clinic-workspace'
import { uploadClinicMedia } from '@/lib/media-upload'
import {
  applyClinicAudience,
  catalogItemIsSensitive,
  categories,
  serviceIsIntimate,
  categoryArtSrc,
  dayNames,
  durationChoices,
  effectiveServiceAudience,
  formatMoney,
  intimateAudiencesFor,
  isAudience,
  professionalAvatarSrc,
  serviceFromCatalog,
  servicesInCategory,
  type Audience,
  type DaySchedule,
  type Payload,
  type Professional,
  type Service,
} from './model'
import { defaultBreak, TimePicker } from './time-picker'
import {
  BlurDialog,
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
  { id: 'women', label: 'Feminino', icon: Venus, tone: 'women' },
  { id: 'men', label: 'Masculino', icon: Mars, tone: 'men' },
] as const

function audienceLabel(value: Audience) {
  return audienceChoices.find((option) => option.id === value)?.label ?? 'Todos'
}

function IntimateAudienceCards({
  services,
  audienceFor,
  onChange,
  question,
}: {
  services: Service[]
  audienceFor: (service: Service) => Audience
  onChange: (service: Service, audience: Audience) => void
  question: string
}) {
  if (services.length === 0) return null
  return (
    <div className="ob2-intimate-list">
      {services.map((service) => (
        <Card className="ob2-panel ob2-intimate-card" key={service.id}>
          <Card.Content className="ob2-intimate-body">
            <div className="ob2-intimate-head">
              <span className="ob2-intimate-icon" aria-hidden>
                <Shield size={18} />
              </span>
              <div>
                <strong>{service.name}</strong>
                <p>{question}</p>
              </div>
            </div>
            <AudienceChoices
              layout="compact"
              value={audienceFor(service)}
              onChange={(audience) => onChange(service, audience)}
            />
          </Card.Content>
        </Card>
      ))}
    </div>
  )
}

function clinicServesSingleGender(audience: Audience | undefined) {
  return audience === 'women' || audience === 'men'
}

function AudienceChoices({
  value,
  onChange,
  layout = 'stack',
}: {
  value?: Audience
  onChange: (value: Audience) => void
  layout?: 'stack' | 'inline' | 'compact'
}) {
  const layoutClass =
    layout === 'compact'
      ? 'ob2-audience is-inline is-compact'
      : layout === 'inline'
        ? 'ob2-audience is-inline'
        : 'ob2-audience'
  return (
    <div className={layoutClass}>
      {audienceChoices.map((option) => {
        const Icon = option.icon
        return (
          <Checkbox
            key={option.id}
            className={`ob2-audience-option is-${option.tone}`}
            isSelected={value != null && value === option.id}
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

function groupIndexedServices<T extends { item: Service; position: number }>(entries: T[]) {
  const grouped = new Map<string, T[]>()
  for (const entry of entries) {
    const list = grouped.get(entry.item.category) ?? []
    list.push(entry)
    grouped.set(entry.item.category, list)
  }
  const order: string[] = [...categories.filter((name) => grouped.has(name))]
  for (const name of grouped.keys()) {
    if (!order.includes(name)) order.push(name)
  }
  return order.map((category) => ({ category, entries: grouped.get(category)! }))
}

function groupServicesByCategory(services: Service[]) {
  const grouped = new Map<string, Service[]>()
  for (const service of services) {
    const list = grouped.get(service.category) ?? []
    list.push(service)
    grouped.set(service.category, list)
  }
  const order: string[] = [...categories.filter((name) => grouped.has(name))]
  for (const name of grouped.keys()) {
    if (!order.includes(name)) order.push(name)
  }
  return order.map((category) => ({ category, services: grouped.get(category)! }))
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
  const changePhone = (value: string) => {
    const normalized = toE164Phone(value)
    setPayload({ ...payload, phone: normalized || formatBrPhone(value) })
  }
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
                label={kind === 'cnpj' ? 'CNPJ' : 'CPF do responsável'}
                icon={<IdCard size={18} />}
                inputMode="numeric"
                value={payload.clinic.taxId}
                placeholder={kind === 'cnpj' ? '00.000.000/0000-00' : '000.000.000-00'}
                onChange={(value) => change('taxId', maskTaxId(kind, value))}
              />
            </div>
            <ClinicLogoDropzone payload={payload} setPayload={setPayload} />
          </div>
          <div className="ob2-clinic-audience">
            <p className="ob2-dialog-section">Público padrão</p>
            <AudienceChoices
              layout="inline"
              value={payload.clinic.defaultAudience || 'all'}
              onChange={(audience) => setPayload(applyClinicAudience(payload, audience))}
            />
          </div>
          <div className="ob2-contact-fields">
            <div className="ob2-contact-heading">
              <p className="ob2-dialog-section">Contato da pessoa responsável</p>
              <small>
                Trouxemos estes dados da conta. Eles podem ser corrigidos aqui sem alterar a senha.
              </small>
            </div>
            <div className="ob2-contact-grid">
              <GlassField
                label="Nome"
                icon={<UserRound size={18} />}
                value={payload.ownerName}
                placeholder="Pessoa responsável"
                autoComplete="name"
                onChange={(value) => setPayload({ ...payload, ownerName: value })}
              />
              <GlassField
                label="E-mail de contato"
                icon={<Mail size={18} />}
                type="email"
                inputMode="email"
                value={payload.email}
                placeholder="contato@clinica.com"
                autoComplete="email"
                onChange={(value) => setPayload({ ...payload, email: value })}
              />
              <GlassField
                label="Celular"
                icon={<Phone size={18} />}
                type="tel"
                inputMode="tel"
                value={formatBrPhone(payload.phone) || payload.phone}
                placeholder="(11) 99999-9999"
                autoComplete="tel"
                onChange={changePhone}
              />
            </div>
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

function ImageDropzone({
  label,
  emptyHint,
  fileHint,
  preview,
  fileName,
  onPreviewChange,
  onFile,
  className = 'ob2-logo-drop',
}: {
  label: string
  emptyHint: string
  fileHint: string
  preview: string | null
  fileName: string
  onPreviewChange: (preview: string | null, fileName: string) => void
  onFile: (file: File) => Promise<void>
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const [busy, setBusy] = useState(false)

  async function acceptFile(file: File | undefined) {
    if (!file || busy) return
    const url = URL.createObjectURL(file)
    onPreviewChange(url, file.name)
    setBusy(true)
    try {
      await onFile(file)
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : 'Não foi possível enviar a imagem.')
    } finally {
      setBusy(false)
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    void acceptFile(event.dataTransfer.files?.[0])
  }

  return (
    <div
      className={`${className}${dragging ? ' is-dragging' : ''}${preview ? ' has-preview' : ''}`}
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
      aria-label={label}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => void acceptFile(event.target.files?.[0])}
      />
      {preview ? (
        <>
          <Image
            src={preview}
            alt=""
            className="ob2-logo-preview"
            width={512}
            height={512}
            unoptimized
          />
          <div className="ob2-logo-drop-meta">
            <strong>{fileName || label}</strong>
            <span>{busy ? 'Otimizando e enviando…' : fileHint}</span>
          </div>
        </>
      ) : (
        <>
          <span className="ob2-logo-drop-icon" aria-hidden>
            <ImagePlus size={28} />
          </span>
          <strong>{label}</strong>
          <span>
            Arraste uma imagem ou <em>escolha o arquivo</em>
          </span>
          <small>{emptyHint}</small>
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

function ProfessionalPhotoField({
  gender,
  preview,
  onPreviewChange,
  onFile,
}: {
  gender: Professional['gender']
  preview: string | null
  onPreviewChange: (preview: string | null) => void
  onFile: (file: File) => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  async function acceptFile(file: File | undefined) {
    if (!file || busy) return
    onPreviewChange(URL.createObjectURL(file))
    setBusy(true)
    try {
      await onFile(file)
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : 'Não foi possível enviar a foto.')
    } finally {
      setBusy(false)
    }
  }

  const photoTitle = gender === 'male' ? 'Foto do profissional' : 'Foto da profissional'

  return (
    <div
      className={`ob2-pro-photo-hero${dragging ? ' is-dragging' : ''}${preview ? ' has-upload' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault()
        setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        void acceptFile(event.dataTransfer.files?.[0])
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => void acceptFile(event.target.files?.[0])}
      />
      <button
        type="button"
        className="ob2-pro-photo-ring"
        aria-label={preview ? 'Trocar foto' : 'Escolher foto'}
        onClick={() => inputRef.current?.click()}
      >
        <span className="ob2-pro-photo-preview" aria-hidden>
          {preview ? (
            <Image
              src={preview}
              alt=""
              className="ob2-pro-photo-image"
              width={512}
              height={512}
              unoptimized
            />
          ) : (
            <Image
              className="ob2-pro-photo-image"
              src={professionalAvatarSrc[gender]}
              alt=""
              width={512}
              height={512}
            />
          )}
        </span>
        <span className="ob2-pro-photo-badge" aria-hidden>
          <ImagePlus size={18} />
        </span>
      </button>
      <div className="ob2-pro-photo-copy">
        <strong>{photoTitle}</strong>
        <span>{busy ? 'Otimizando e enviando…' : 'Opcional · PNG, JPG ou WebP.'}</span>
        <div className="ob2-pro-photo-actions">
          <Button
            className="ob2-pro-photo-btn"
            variant="secondary"
            onPress={() => inputRef.current?.click()}
          >
            Escolher arquivo
          </Button>
          {preview ? (
            <Button
              className="ob2-pro-photo-clear"
              variant="ghost"
              onPress={() => onPreviewChange(null)}
            >
              Usar avatar padrão
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ClinicLogoDropzone({
  payload,
  setPayload,
}: {
  payload: Payload
  setPayload: (value: Payload) => void
}) {
  const { clinic } = useClinic()
  const staff = useStaff()
  const [preview, setPreview] = useState<string | null>(payload.clinic.logoUrl ?? null)
  const [fileName, setFileName] = useState('')
  return (
    <ImageDropzone
      label="Logo da clínica"
      emptyHint="PNG, JPG ou WebP"
      fileHint="Imagem salva · clique ou arraste para trocar"
      preview={preview}
      fileName={fileName}
      onPreviewChange={(next, name) => {
        setPreview((current) => {
          if (current && current !== next) URL.revokeObjectURL(current)
          return next
        })
        setFileName(name)
      }}
      onFile={async (file) => {
        if (!staff.user) throw new Error('Sua sessão expirou. Entre novamente.')
        const result = await uploadClinicMedia({
          clinicId: clinic.id,
          token: await staff.user.getIdToken(),
          kind: 'clinic_logo',
          file,
        })
        setPreview(result.asset.largeUrl)
        setPayload({
          ...payload,
          clinic: {
            ...payload.clinic,
            logoAssetId: result.asset.id,
            logoUrl: result.asset.largeUrl,
          },
        })
      }}
    />
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

  function toggle(item: Parameters<typeof serviceFromCatalog>[0]) {
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
      services: [...payload.services, serviceFromCatalog(item, payload.clinic.defaultAudience)],
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
          id: crypto.randomUUID(),
          category: area,
          name,
          description: '',
          durationMinutes: 60,
          priceCents: 0,
          priceType: 'quote',
          bookingMode: 'instant',
          audience: payload.clinic.defaultAudience,
          sensitive: false,
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
  const room = Math.max(0, 80 - payload.services.length)
  const unmarked = items.filter((item) => !selectedNames.has(item.nome))
  const canSelectAll = unmarked.length > 0 && room > 0

  function selectAllInArea() {
    if (!area || !canSelectAll) return
    const adding = unmarked
      .slice(0, room)
      .map((item) => serviceFromCatalog(item, payload.clinic.defaultAudience))
    setPayload({
      ...payload,
      occupations: [...new Set([...payload.occupations, area])],
      services: [...payload.services, ...adding],
    })
  }
  return (
    <div className="ob2-stack">
      <div className={picked.length ? 'ob2-catalog has-picked' : 'ob2-catalog'}>
        <div className="ob2-catalog-main">
          {area ? (
            <>
              <Card className="ob2-panel ob2-guide-card">
                <Card.Content className="ob2-guide-body">
                  <span className="ob2-guide-icon" aria-hidden>
                    <Check size={18} />
                  </span>
                  <p className="ob2-guide-copy">
                    Marque os atendimentos de {area}. Para seguir, volte a{' '}
                    <TextLink
                      className="ob2-areas-link"
                      href="#todas-as-areas"
                      onClick={(event) => {
                        event.preventDefault()
                        setArea(null)
                      }}
                    >
                      todas as áreas
                      <TextLink.Icon />
                    </TextLink>
                    .
                  </p>
                  <Button
                    className="ob2-exit ob2-guide-all"
                    variant="ghost"
                    isDisabled={!canSelectAll}
                    onPress={selectAllInArea}
                  >
                    <ListChecks size={16} />
                    Marcar todos
                  </Button>
                </Card.Content>
              </Card>
              <div className="ob2-services">
                {items.map((item) => {
                  const selected = selectedNames.has(item.nome)
                  return (
                    <ChoiceCard
                      key={item.nome}
                      selected={selected}
                      icon={selected ? <Check size={18} /> : <Plus size={18} />}
                      title={item.nome}
                      badge={catalogItemIsSensitive(item) ? 'Íntimo' : undefined}
                      detail={`${item.duracao_minutos} min · sugestão ${formatMoney(Math.round(item.preco_sugerido_brl * 100))}`}
                      onPress={() => toggle(item)}
                    />
                  )
                })}
                <Button
                  className="ob2-choice ob2-add-service"
                  variant="ghost"
                  onPress={custom.open}
                  isDisabled={payload.services.length >= 80}
                >
                  <span className="ob2-choice-icon ob2-add-service-icon" aria-hidden>
                    <Plus size={18} />
                  </span>
                  <span className="ob2-choice-copy">
                    <strong>Adicionar serviço</strong>
                    <small>Não achou na lista? Crie o seu.</small>
                  </span>
                </Button>
              </div>
            </>
          ) : (
            <div className="ob2-categories">
              {categories.map((category) => {
                const art = categoryArtSrc(category)
                const count = payload.services.filter(
                  (service) => service.category === category,
                ).length
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

  function updateAt(position: number, patch: Partial<Service>) {
    setPayload({
      ...payload,
      services: payload.services.map((item, current) =>
        current === position ? { ...item, ...patch } : item,
      ),
    })
  }

  function update(patch: Partial<Service>) {
    if (index == null) return
    updateAt(index, patch)
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
    <div className="ob2-services-step">
      <div className="ob2-services-step-body ob2-stack">
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
          <div className="ob2-stack">
            {groupIndexedServices(visibleServices).map((group) => (
              <section className="ob2-detail-section" key={group.category}>
                <h2 className="ob2-detail-category">{group.category}</h2>
                <div className="ob2-detail-grid">
                  {group.entries.map(({ item, position }) => (
                    <Card className="ob2-panel" key={`${item.name}-${position}`}>
                      <Card.Content className="ob2-summary">
                        <strong>{item.name}</strong>
                        <p>{item.durationMinutes} min</p>
                        <b>{priceLabel(item)}</b>
                        <Button
                          className="ob2-quiet"
                          variant="ghost"
                          onPress={() => open(position)}
                        >
                          Ajustar este serviço
                        </Button>
                      </Card.Content>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      <div className={editor.isOpen ? 'ob2-float-continue is-hidden' : 'ob2-float-continue'}>
        <StepEnd error={error} footer={footer} />
      </div>
      <BlurDrawer
        state={editor}
        placement="bottom"
        title={service?.name || 'Ajustar serviço'}
      >
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
                service.priceType === 'quote'
                  ? ''
                  : (service.priceCents / 100).toFixed(2).replace('.', ',')
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
              options={durations.map((minutes) => ({
                id: String(minutes),
                label: `${minutes} min`,
              }))}
              onChange={(value) => update({ durationMinutes: Number(value) })}
            />
            <Separator />
            <p className="ob2-copy">Público atendido</p>
            <AudienceChoices
              value={service.audience}
              onChange={(audience) => update({ audience })}
            />
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

type ProfessionalDraft = Omit<Professional, 'audience'> & { audience?: Audience }

function emptyProfessionalDraft(payload: Payload): ProfessionalDraft {
  const clinicAudience = payload.clinic.defaultAudience || 'all'
  return {
    id: '',
    name: '',
    role: '',
    gender: 'female',
    audience: clinicServesSingleGender(clinicAudience) ? clinicAudience : undefined,
    serviceNames: payload.services.map((service) => service.name).filter((name) => name.trim()),
    serviceIds: payload.services.map((service) => service.id),
  }
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
  const { clinic } = useClinic()
  const staff = useStaff()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [index, setIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState<ProfessionalDraft>(() => emptyProfessionalDraft(payload))
  const [formErrors, setFormErrors] = useState<{
    name?: string
    role?: string
    gender?: string
    audience?: string
  }>({})
  const singleGenderClinic = clinicServesSingleGender(payload.clinic.defaultAudience)

  function setMode(mode: 'solo' | 'team') {
    setPayload({
      ...payload,
      teamMode: mode,
      professionals:
        mode === 'solo'
          ? [
              {
                id: payload.professionals[0]?.id || crypto.randomUUID(),
                name: payload.ownerName.trim() || 'Você',
                role: 'Proprietária / profissional',
                gender: 'female',
                audience: payload.clinic.defaultAudience,
                serviceNames: payload.services
                  .map((service) => service.name)
                  .filter((name) => name.trim()),
                serviceIds: payload.services.map((service) => service.id),
                serviceAudiences: intimateAudiencesFor(payload.services),
              },
            ]
          : [],
    })
  }

  function openEditor(position: number | null) {
    if (position == null) {
      setDraft({ ...emptyProfessionalDraft(payload), id: crypto.randomUUID() })
    } else {
      setDraft({ ...payload.professionals[position] })
    }
    setIndex(position)
    setFormErrors({})
    setDialogOpen(true)
  }

  function patchDraft(patch: Partial<ProfessionalDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
    setFormErrors({})
  }

  function validateDraft() {
    const next: {
      name?: string
      role?: string
      gender?: string
      audience?: string
    } = {}
    if (!draft.name.trim()) next.name = 'Informe o nome da profissional.'
    if (!draft.role.trim()) next.role = 'Informe a função ou especialidade.'
    if (draft.gender !== 'female' && draft.gender !== 'male') next.gender = 'Escolha o sexo.'
    if (!singleGenderClinic && !isAudience(draft.audience))
      next.audience = 'Escolha o público atendido.'
    setFormErrors(next)
    const message =
      next.name && next.role
        ? 'Informe o nome e a função.'
        : next.name || next.role || next.gender || next.audience
    if (message) toast.danger(message, { timeout: 5000 })
    return !message
  }

  function saveDraft() {
    if (!validateDraft()) return
    const audience =
      draft.audience ??
      (clinicServesSingleGender(payload.clinic.defaultAudience)
        ? payload.clinic.defaultAudience
        : 'all')
    const saved: Professional = {
      ...draft,
      name: draft.name.trim(),
      role: draft.role.trim(),
      audience,
    }
    if (index == null) {
      setPayload({ ...payload, professionals: [...payload.professionals, saved] })
    } else {
      setPayload({
        ...payload,
        professionals: payload.professionals.map((item, position) =>
          position === index ? saved : item,
        ),
      })
    }
    setDialogOpen(false)
    setIndex(null)
  }

  function removeAt(position: number) {
    setPayload({
      ...payload,
      professionals: payload.professionals.filter((_, current) => current !== position),
    })
    setDialogOpen(false)
    setIndex(null)
  }

  const intimateServices = payload.services.filter((service) => serviceIsIntimate(service))
  const assignedIntimate = intimateServices.filter((service) =>
    draft.serviceIds.includes(service.id),
  )

  function setIntimateAudience(serviceId: string, audience: Audience) {
    patchDraft({ serviceAudiences: { ...draft.serviceAudiences, [serviceId]: audience } })
  }

  function draftForServiceAudience(): Professional {
    return {
      ...draft,
      audience: draft.audience ?? payload.clinic.defaultAudience ?? 'all',
    }
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
        <>
          <Card className="ob2-panel">
            <Card.Content>
              <p className="ob2-copy">
                <strong>{payload.ownerName || 'Você'}</strong> entra como profissional principal.{' '}
                {payload.services.length === 1
                  ? 'O serviço escolhido fica vinculado a você.'
                  : `Os ${payload.services.length} serviços escolhidos ficam vinculados a você.`}{' '}
                {intimateServices.length > 0
                  ? 'Confirme o público dos serviços íntimos abaixo. '
                  : ''}
                Convites de recepção continuam para o painel.
              </p>
            </Card.Content>
          </Card>
          <IntimateAudienceCards
            services={intimateServices}
            audienceFor={(service) => service.audience}
            question="Qual é o público padrão deste serviço?"
            onChange={(service, audience) =>
              setPayload({
                ...payload,
                services: payload.services.map((item) =>
                  item.id === service.id ? { ...item, audience } : item,
                ),
              })
            }
          />
        </>
      ) : (
        <>
          {payload.professionals.length > 0 ? (
            <div className="ob2-pro-grid">
              {payload.professionals.map((item, position) => (
                <Button
                  key={item.id}
                  className="ob2-pro-card"
                  variant="ghost"
                  onPress={() => openEditor(position)}
                >
                  <Image
                    className="ob2-pro-card-avatar"
                    src={item.photoUrl || professionalAvatarSrc[item.gender]}
                    alt=""
                    width={512}
                    height={512}
                  />
                  <span className="ob2-pro-card-copy">
                    <strong>{item.name}</strong>
                    <small>
                      {item.role} · {item.serviceIds.length}{' '}
                      {item.serviceIds.length === 1 ? 'serviço' : 'serviços'}
                    </small>
                  </span>
                </Button>
              ))}
            </div>
          ) : null}
          <Button className="ob2-add-pro" variant="ghost" onPress={() => openEditor(null)}>
            <span className="ob2-add-pro-icon" aria-hidden>
              <UserPlus size={22} />
            </span>
            <span className="ob2-add-pro-copy">
              <strong>Adicionar profissional</strong>
              <small>Nome, função e o que esta pessoa atende</small>
            </span>
          </Button>
          <p className="ob2-copy">
            Contas, convites e permissões de recepção ou financeiro ficam para depois, com acesso
            individual.
          </p>
        </>
      )}
      <StepEnd error={error} footer={footer} />
      <BlurDialog
        isOpen={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setIndex(null)
        }}
        title={index == null ? 'Nova profissional' : draft.name.trim() || 'Profissional'}
        description="Identificação, público atendido e serviços desta pessoa na clínica."
        footer={
          <>
            {index != null ? (
              <Button className="ob2-quiet" variant="danger-soft" onPress={() => removeAt(index)}>
                <Trash2 size={16} /> Remover
              </Button>
            ) : null}
            <Button className="ob2-cta" onPress={saveDraft}>
              Salvar profissional
            </Button>
          </>
        }
      >
        <ProfessionalPhotoField
          gender={draft.gender}
          preview={draft.photoUrl ?? draft.photoPreview ?? null}
          onPreviewChange={(preview) =>
            patchDraft(
              preview
                ? { photoPreview: preview }
                : { photoPreview: undefined, photoUrl: undefined, photoAssetId: undefined },
            )
          }
          onFile={async (file) => {
            if (!staff.user) throw new Error('Sua sessão expirou. Entre novamente.')
            const result = await uploadClinicMedia({
              clinicId: clinic.id,
              token: await staff.user.getIdToken(),
              kind: 'professional_photo',
              subjectRef: draft.id,
              file,
            })
            patchDraft({
              photoAssetId: result.asset.id,
              photoUrl: result.asset.largeUrl,
              photoPreview: undefined,
            })
          }}
        />
        <div className="ob2-dialog-fields ob2-dialog-fields--split">
          <div className="ob2-dialog-field">
            <GlassField
              label="Nome"
              icon={<UserRound size={18} />}
              value={draft.name}
              placeholder="Nome completo"
              onChange={(value) => patchDraft({ name: value })}
            />
            {formErrors.name ? (
              <p className="ob2-field-error" role="alert">
                {formErrors.name}
              </p>
            ) : null}
          </div>
          <div className="ob2-dialog-field">
            <GlassField
              label="Função"
              icon={<Briefcase size={18} />}
              value={draft.role}
              placeholder="Cargo ou especialidade"
              onChange={(value) => patchDraft({ role: value })}
            />
            {formErrors.role ? (
              <p className="ob2-field-error" role="alert">
                {formErrors.role}
              </p>
            ) : null}
          </div>
        </div>
        <p className="ob2-dialog-section">Sexo</p>
        <div className="ob2-gender-grid">
          {(
            [
              { id: 'female' as const, label: 'Feminino' },
              { id: 'male' as const, label: 'Masculino' },
            ] as const
          ).map((option) => (
            <Button
              key={option.id}
              className={['ob2-gender-choice', draft.gender === option.id ? 'is-selected' : '']
                .filter(Boolean)
                .join(' ')}
              variant="ghost"
              onPress={() => patchDraft({ gender: option.id })}
            >
              <Image
                className="ob2-gender-avatar"
                src={professionalAvatarSrc[option.id]}
                alt=""
                width={512}
                height={512}
              />
              <span>{option.label}</span>
            </Button>
          ))}
        </div>
        {formErrors.gender ? (
          <p className="ob2-field-error" role="alert">
            {formErrors.gender}
          </p>
        ) : null}
        <Separator />
        <p className="ob2-dialog-section">Público atendido</p>
        <AudienceChoices
          layout="compact"
          value={draft.audience}
          onChange={(audience) => patchDraft({ audience })}
        />
        {formErrors.audience ? (
          <p className="ob2-field-error" role="alert">
            {formErrors.audience}
          </p>
        ) : null}
        <IntimateAudienceCards
          services={assignedIntimate}
          audienceFor={(service) => effectiveServiceAudience(draftForServiceAudience(), service)}
          question="Qual público esta pessoa atende neste serviço?"
          onChange={(service, audience) => setIntimateAudience(service.id, audience)}
        />
        <Separator />
        <p className="ob2-dialog-section">Serviços</p>
        <p className="ob2-dialog-hint">Marque o que esta pessoa realiza na clínica.</p>
        {groupServicesByCategory(payload.services).map((group) => {
          const categoryNames = group.services.map((service) => service.name)
          const categoryIds = group.services.map((service) => service.id)
          const selectedInCategory = categoryIds.filter((id) => draft.serviceIds.includes(id))
          const allInCategorySelected =
            categoryNames.length > 0 && selectedInCategory.length === categoryNames.length

          return (
            <div className="ob2-service-group ob2-service-group-card" key={group.category}>
              <div className="ob2-service-group-head">
                <Checkbox
                  className="ob2-service-group-toggle"
                  isSelected={allInCategorySelected}
                  onChange={(isSelected) => {
                    const namesInCategory = new Set(categoryNames)
                    const idsInCategory = new Set(categoryIds)
                    patchDraft({
                      serviceNames: isSelected
                        ? [...new Set([...draft.serviceNames, ...categoryNames])]
                        : draft.serviceNames.filter((name) => !namesInCategory.has(name)),
                      serviceIds: isSelected
                        ? [...new Set([...draft.serviceIds, ...categoryIds])]
                        : draft.serviceIds.filter((id) => !idsInCategory.has(id)),
                    })
                  }}
                >
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <Label className="ob2-service-group-title">{group.category}</Label>
                  </Checkbox.Content>
                </Checkbox>
                <span className="ob2-service-group-meta">
                  {allInCategorySelected
                    ? 'Todos'
                    : selectedInCategory.length > 0
                      ? `${selectedInCategory.length}/${categoryNames.length}`
                      : 'Marcar todos'}
                </span>
              </div>
              <div className="ob2-checks ob2-service-group-items">
                {group.services.map((service) => {
                  const selected = draft.serviceIds.includes(service.id)
                  const audience = effectiveServiceAudience(draftForServiceAudience(), service)
                  return (
                    <div
                      className={
                        serviceIsIntimate(service)
                          ? 'ob2-service-line is-intimate'
                          : 'ob2-service-line'
                      }
                      key={service.id}
                    >
                      <Checkbox
                        isSelected={selected}
                        onChange={(isSelected) =>
                          patchDraft({
                            serviceNames: isSelected
                              ? [...draft.serviceNames, service.name]
                              : draft.serviceNames.filter((name) => name !== service.name),
                            serviceIds: isSelected
                              ? [...draft.serviceIds, service.id]
                              : draft.serviceIds.filter((id) => id !== service.id),
                          })
                        }
                      >
                        <Checkbox.Content>
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                          <Label>
                            {service.name}
                            {serviceIsIntimate(service) ? (
                              <span className="ob2-intimate-badge">
                                {selected ? audienceLabel(audience) : 'Íntimo'}
                              </span>
                            ) : null}
                          </Label>
                        </Checkbox.Content>
                      </Checkbox>
                      {serviceIsIntimate(service) && selected ? (
                        <AudienceChoices
                          layout="compact"
                          value={audience}
                          onChange={(next) => setIntimateAudience(service.id, next)}
                        />
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </BlurDialog>
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
  const staff = useStaff()
  const [cepBusy, setCepBusy] = useState(false)
  const [cepError, setCepError] = useState('')
  const changeClinic = (key: keyof Payload['clinic'], value: string) =>
    setPayload({ ...payload, clinic: { ...payload.clinic, [key]: value } })
  const [open, setOpen] = useState(payload.clinic.addressLine.trim() === '')
  const summary = [payload.clinic.addressLine, payload.clinic.addressNumber]
    .filter(Boolean)
    .join(', ')
  async function lookupPostalCode() {
    const cep = payload.clinic.postalCode.replace(/\D/g, '')
    if (cep.length !== 8 || !staff.user) {
      setCepError('Informe os 8 números do CEP.')
      return
    }
    setCepBusy(true)
    setCepError('')
    try {
      const response = await fetch(`/api/address/postal-code/${cep}`, {
        headers: { authorization: `Bearer ${await staff.user.getIdToken()}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error('Not found')
      const data: {
        address: {
          postalCode: string
          street: string
          district: string
          city: string
          state: string
        }
      } = await response.json()
      setPayload({
        ...payload,
        clinic: {
          ...payload.clinic,
          postalCode: formatCep(data.address.postalCode || cep),
          addressLine: data.address.street || payload.clinic.addressLine,
          addressDistrict: data.address.district || payload.clinic.addressDistrict,
          city: data.address.city || payload.clinic.city,
          state: data.address.state || payload.clinic.state,
        },
      })
    } catch {
      setCepError('CEP não encontrado agora. Você pode preencher o endereço manualmente.')
    } finally {
      setCepBusy(false)
    }
  }
  return (
    <div className="ob2-stack">
      <Card className="ob2-panel">
        <Card.Content className="ob2-form">
          {open ? (
            <>
              <GlassField
                label="CEP"
                icon={<Hash size={18} />}
                inputMode="numeric"
                value={payload.clinic.postalCode}
                placeholder="00000-000"
                onChange={(value) => changeClinic('postalCode', formatCep(value))}
                suffix={
                  <Button
                    className="ob2-cep"
                    variant="primary"
                    isDisabled={cepBusy}
                    onPress={() => void lookupPostalCode()}
                  >
                    <span className="ob2-cep-long">
                      {cepBusy ? 'Procurando…' : 'Procurar endereço'}
                    </span>
                    <span className="ob2-cep-short">{cepBusy ? '…' : 'Procurar'}</span>
                  </Button>
                }
              />
              {cepError ? (
                <p className="ob2-field-error" role="alert">
                  {cepError}
                </p>
              ) : null}
              <div className="ob2-address-line">
                <GlassField
                  className="ob2-address-emphasis"
                  label="Endereço"
                  icon={<MapPin size={18} />}
                  value={payload.clinic.addressLine}
                  placeholder="Rua, avenida ou travessa"
                  onChange={(value) => changeClinic('addressLine', value)}
                />
                <GlassField
                  className="ob2-address-emphasis"
                  label="Número"
                  icon={<Hash size={18} />}
                  value={payload.clinic.addressNumber}
                  placeholder="Nº"
                  onChange={(value) => changeClinic('addressNumber', value)}
                />
              </div>
              <div className="ob2-city-state">
                <GlassField
                  label="Bairro"
                  value={payload.clinic.addressDistrict}
                  placeholder="Bairro"
                  onChange={(value) => changeClinic('addressDistrict', value)}
                />
                <GlassField
                  label="Cidade"
                  icon={<Building2 size={18} />}
                  value={payload.clinic.city}
                  placeholder="Cidade"
                  onChange={(value) => changeClinic('city', value)}
                />
                <GlassField
                  className="ob2-address-state"
                  label="Estado"
                  value={payload.clinic.state}
                  maxLength={2}
                  placeholder="SP"
                  onChange={(value) => changeClinic('state', value.toUpperCase())}
                />
              </div>
              <GlassField
                label="Observação do endereço (opcional)"
                icon={<Info size={18} />}
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

function WeeklyHoursEditor({
  days,
  onChangeDay,
  closedCopy = 'Fechado neste dia.',
}: {
  days: DaySchedule[]
  onChangeDay: (weekday: number, patch: Partial<DaySchedule>) => void
  closedCopy?: string
}) {
  return (
    <div className="ob2-hours-list">
      {days.map((day) => {
        const breaks = day.breaks ?? []
        return (
          <div className="ob2-day" key={day.weekday}>
            <Switch
              isSelected={day.enabled}
              onChange={(enabled) => onChangeDay(day.weekday, { enabled })}
            >
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
                    label="Início"
                    value={day.start}
                    onChange={(value) => onChangeDay(day.weekday, { start: value })}
                  />
                  <TimePicker
                    label="Fim"
                    value={day.end}
                    onChange={(value) => onChangeDay(day.weekday, { end: value })}
                  />
                </div>
                {breaks.map((item, index) => (
                  <div className="ob2-break" key={`${day.weekday}-${index}`}>
                    <TimePicker
                      label="Intervalo começa"
                      value={item.start}
                      onChange={(value) =>
                        onChangeDay(day.weekday, {
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
                        onChangeDay(day.weekday, {
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
                        onChangeDay(day.weekday, {
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
                      onChangeDay(day.weekday, {
                        breaks: [...breaks, defaultBreak(day.start, day.end)],
                      })
                    }
                  >
                    <Plus size={16} /> Adicionar intervalo
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="ob2-copy">{closedCopy}</p>
            )}
          </div>
        )
      })}
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
  const ready = syncProfessionalSchedules(payload)
  const [activePro, setActivePro] = useState(0)
  const professionals = ready.professionalSchedules
  const solo = ready.teamMode === 'solo'

  const updateClinicDay = (weekday: number, patch: Partial<DaySchedule>) =>
    setPayload({
      ...ready,
      businessHours: ready.businessHours.map((day) =>
        day.weekday === weekday ? { ...day, ...patch } : day,
      ),
    })

  const updateProDay = (personIndex: number, weekday: number, patch: Partial<DaySchedule>) =>
    setPayload({
      ...ready,
      professionalSchedules: ready.professionalSchedules.map((person, index) =>
        index === personIndex
          ? {
              ...person,
              days: person.days.map((day) =>
                day.weekday === weekday ? { ...day, ...patch } : day,
              ),
            }
          : person,
      ),
    })

  return (
    <div className="ob2-stack">
      <section className="ob2-hours-section">
        <h2 className="ob2-section-title">Horário da clínica</h2>
        <p className="ob2-copy">
          Vale para o espaço inteiro. Intervalos aqui são pausas gerais — almoço ou fechamento
          parcial do salão.
        </p>
        <Card className="ob2-panel ob2-hours-card">
          <Card.Content>
            <WeeklyHoursEditor days={ready.businessHours} onChangeDay={updateClinicDay} />
          </Card.Content>
        </Card>
      </section>

      <section className="ob2-hours-section">
        <h2 className="ob2-section-title">
          {solo ? 'Seu horário de atendimento' : 'Horário por profissional'}
        </h2>
        <p className="ob2-copy">
          {solo
            ? 'Como você atende dentro do horário da clínica. Ajuste intervalos pessoais se precisar.'
            : 'Cada profissional atende dentro do horário da clínica. Escolha quem configurar abaixo.'}
        </p>
        {!solo && professionals.length > 1 ? (
          <div className="ob2-pro-tabs" role="tablist" aria-label="Profissionais">
            {professionals.map((person, index) => (
              <Button
                key={person.name}
                className={['ob2-pro-tab', index === activePro ? 'is-active' : '']
                  .filter(Boolean)
                  .join(' ')}
                variant="ghost"
                onPress={() => setActivePro(index)}
              >
                {person.name}
              </Button>
            ))}
          </div>
        ) : null}
        {professionals[activePro] ? (
          <Card className="ob2-panel ob2-hours-card">
            <Card.Content>
              {!solo ? <p className="ob2-hours-pro-name">{professionals[activePro].name}</p> : null}
              <WeeklyHoursEditor
                days={professionals[activePro].days}
                onChangeDay={(weekday, patch) => updateProDay(activePro, weekday, patch)}
                closedCopy="Sem atendimento neste dia."
              />
            </Card.Content>
          </Card>
        ) : null}
      </section>
      <StepEnd error={error} footer={footer} />
    </div>
  )
}

export function PaymentsStep({
  clinicId,
  payload,
  setPayload,
  error,
  footer,
}: {
  clinicId: string
  payload: Payload
  setPayload: (value: Payload) => void
  error: string
  footer: ReactNode
}) {
  const selectOutside = () =>
    setPayload({
      ...payload,
      preferences: {
        ...payload.preferences,
        acceptInApp: false,
        packagePaymentMode: 'clinic_only',
      },
    })
  const selectInApp = () =>
    setPayload({
      ...payload,
      preferences: { ...payload.preferences, acceptInApp: true },
    })

  return (
    <div className="ob2-stack">
      <div className="ob2-grid ob2-grid-payments">
        <ChoiceCard
          title="Receber fora do app"
          detail="Pix, maquininha ou link da própria clínica"
          icon={<CreditCard size={22} />}
          selected={!payload.preferences.acceptInApp}
          onPress={selectOutside}
        />
        <ChoiceCard
          title="Pagamentos no app"
          detail="Cliente paga pelo app quando você ativar o recebimento"
          icon={<Banknote size={22} />}
          selected={payload.preferences.acceptInApp}
          onPress={selectInApp}
        />
      </div>
      {payload.preferences.acceptInApp ? (
        <Card className="ob2-panel ob2-stripe-card">
          <Card.Content className="ob2-form">
            <p className="ob2-copy">
              Ainda não conectamos sua conta. Depois de abrir a clínica, finalize o Stripe Connect
              no painel — é lá que entram taxas, verificação e repasse.
            </p>
            <Link className="ob2-quiet ob2-stripe-link" href={`/c/${clinicId}`}>
              Ver esboço de pagamentos no painel
            </Link>
          </Card.Content>
        </Card>
      ) : (
        <p className="ob2-copy">
          Pacotes de sessões ficam limitados ao recebimento na clínica enquanto esta opção estiver
          ativa. Você ajusta isso na próxima etapa.
        </p>
      )}
      <StepEnd error={error} footer={footer} />
    </div>
  )
}

export function RulesStep({
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
  const inApp = payload.preferences.acceptInApp
  const packageMode = payload.preferences.packagePaymentMode
  const packageChoices = [
    {
      id: 'clinic_only' as const,
      title: 'Receber somente na clínica',
      detail: 'Pacotes pagos presencialmente ou por link próprio',
      icon: <Building2 size={22} />,
      disabled: false,
    },
    {
      id: 'in_app' as const,
      title: 'Receber somente no app',
      detail: 'Exige pagamentos no app e Stripe Connect ativo',
      icon: <CreditCard size={22} />,
      disabled: !inApp,
    },
    {
      id: 'both' as const,
      title: 'Aceitar das duas formas',
      detail: 'Cliente escolhe na hora de fechar o pacote',
      icon: <Banknote size={22} />,
      disabled: !inApp,
    },
  ]

  return (
    <div className="ob2-stack">
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
        </Card.Content>
      </Card>
      <div className="ob2-stack ob2-package-choices">
        <h2 className="ob2-section-title">Pacotes de sessões</h2>
        <div className="ob2-grid ob2-grid-packages">
          {packageChoices.map((option) => (
            <ChoiceCard
              key={option.id}
              title={option.title}
              detail={option.detail}
              icon={option.icon}
              selected={packageMode === option.id}
              isDisabled={option.disabled}
              onPress={() => change({ packagePaymentMode: option.id })}
            />
          ))}
        </div>
        {!inApp ? (
          <p className="ob2-copy">
            Para liberar recebimento de pacotes no app, volte à etapa Pagamentos e escolha
            pagamentos no app.
          </p>
        ) : null}
      </div>
      <StepEnd error={error} footer={footer} />
    </div>
  )
}

export function ReviewStep({
  payload,
  error,
  footer,
  onEdit,
}: {
  payload: Payload
  error: string
  footer: ReactNode
  onEdit: (step: number) => void
}) {
  const facts = [
    { label: 'Clínica', value: payload.name || 'Nome ainda não informado', step: 1 },
    {
      label: 'Contato',
      value: `${payload.ownerName || 'Sem nome'} · ${formatBrPhone(payload.phone) || 'sem celular'}`,
      step: 1,
    },
    {
      label: 'Serviços',
      value: `${payload.services.length} ${payload.services.length === 1 ? 'serviço' : 'serviços'} em ${payload.occupations.length} ${payload.occupations.length === 1 ? 'categoria' : 'categorias'}`,
      step: 3,
    },
    {
      label: 'Equipe',
      value:
        payload.teamMode === 'solo'
          ? 'Somente você'
          : `${payload.professionals.length} ${payload.professionals.length === 1 ? 'profissional' : 'profissionais'}`,
      step: 4,
    },
    {
      label: 'Agenda',
      value: `${payload.businessHours.filter((day) => day.enabled).length} dias por semana`,
      step: 6,
    },
    {
      label: 'Cancelamento',
      value: `${payload.preferences.cancellationHours}h no padrão e ${payload.preferences.specialCancellationHours}h nos especiais`,
      step: 8,
    },
    {
      label: 'Pagamento',
      value: payload.preferences.acceptInApp
        ? 'Interesse em receber no app'
        : 'Recebimento fora do app',
      step: 7,
    },
    {
      label: 'Pacotes',
      value:
        payload.preferences.packagePaymentMode === 'clinic_only'
          ? 'Somente na clínica'
          : payload.preferences.packagePaymentMode === 'in_app'
            ? 'Somente no app'
            : 'Clínica ou app',
      step: 8,
    },
    {
      label: 'Endereço',
      value: payload.clinic.city
        ? `${[payload.clinic.addressLine, payload.clinic.addressNumber].filter(Boolean).join(', ') || 'A definir'}, ${payload.clinic.city}/${payload.clinic.state || '—'}`
        : 'Pode completar depois',
      step: 5,
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
            <div className="ob2-fact-heading">
              <span>{fact.label}</span>
              <Button className="ob2-quiet" variant="ghost" onPress={() => onEdit(fact.step)}>
                Editar
              </Button>
            </div>
            <strong>{fact.value}</strong>
          </Card.Content>
        </Card>
      ))}
      <StepEnd error={error} footer={footer} />
    </div>
  )
}
