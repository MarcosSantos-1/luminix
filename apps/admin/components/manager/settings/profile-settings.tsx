'use client'

import { Button, Spinner } from '@heroui/react'
import {
  AtSign,
  BadgeCheck,
  Building2,
  CalendarHeart,
  Copy,
  Globe,
  ImagePlus,
  Share2,
  KeyRound,
  Mail,
  MapPin,
  MapPinned,
  MessageCircle,
  Phone,
  Trash2,
  UserRound,
} from 'lucide-react'
import Image from 'next/image'
import { useRef, useState } from 'react'
import { useStaff } from '@/components/staff-provider'
import { formatBrPhone, toE164Phone } from '@/lib/phone'
import { useClinicApi, useClinicResource, type ClinicApi } from './clinic-api'
import {
  Empty,
  HelpTip,
  Hint,
  LoadError,
  SaveBar,
  SettingsCard,
  SettingsSkeleton,
  StatusPill,
  TextInput,
  type SaveState,
} from './settings-kit'

export type ProfileForm = {
  name: string
  ownerName: string
  email: string
  phone: string
  whatsapp: string
  foundedYear: string
  instagram: string
  facebook: string
  website: string
  logoAssetId: string
  logoUrl: string | null
  taxId: string | null
  taxIdKind: 'cpf' | 'cnpj' | null
  addressLine: string
  addressNumber: string
  addressDistrict: string
  addressNote: string
  city: string
  state: string
  postalCode: string
}

export type ProfileResponse = {
  clinic: { name: string; slug: string; status: string; shareCode: string | null }
  region: { locale: string; timezone: string; currency: string }
  profile: ProfileForm | null
}

const states =
  'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')

function formatCep(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

function validate(form: ProfileForm) {
  const errors: Partial<Record<keyof ProfileForm, string>> = {}
  if (!form.name.trim()) errors.name = 'Escreva o nome do seu espaço.'
  if (!form.ownerName.trim()) errors.ownerName = 'Escreva o nome da pessoa responsável.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
    errors.email = 'Confira o e-mail. Exemplo: maria@gmail.com'
  if (!toE164Phone(form.phone))
    errors.phone = 'Confira o telefone com DDD. Exemplo: (11) 98765-4321'
  if (form.whatsapp && !toE164Phone(form.whatsapp))
    errors.whatsapp = 'Confira o WhatsApp com DDD, ou deixe em branco.'
  const year = Number(form.foundedYear)
  if (
    form.foundedYear &&
    (!/^\d{4}$/.test(form.foundedYear) || year < 1800 || year > new Date().getFullYear())
  )
    errors.foundedYear = 'Use o ano com 4 números. Exemplo: 2015'
  const cep = form.postalCode.replace(/\D/g, '')
  if (cep && cep.length !== 8) errors.postalCode = 'O CEP tem 8 números. Exemplo: 01310-100'
  return errors
}

/** "Dados do espaço" and "Contato" share one form so both tabs always agree. */
export function ProfileSettings({
  clinicId,
  tab,
}: {
  clinicId: string
  tab: 'espaco' | 'contato'
}) {
  const api = useClinicApi(clinicId)
  const resource = useClinicResource<ProfileResponse>(api, 'profile')
  if (resource.error && !resource.data)
    return <LoadError message={resource.error} onRetry={resource.reload} />
  if (!resource.data) return <SettingsSkeleton cards={tab === 'espaco' ? 3 : 2} />
  const { profile } = resource.data
  if (!profile)
    return (
      <SettingsCard
        icon={<Building2 size={20} />}
        title="Conclua o cadastro para editar"
        description="Os dados do espaço ficam disponíveis para edição assim que o cadastro inicial for concluído."
      >
        <p className="settings-muted">Seu rascunho continua salvo no cadastro.</p>
      </SettingsCard>
    )
  return <ProfileEditor api={api} data={resource.data} profile={profile} tab={tab} />
}

function ProfileEditor({
  api,
  data,
  profile,
  tab,
}: {
  api: ClinicApi
  data: ProfileResponse
  profile: ProfileForm
  tab: 'espaco' | 'contato'
}) {
  const staff = useStaff()
  const [initial] = useState<ProfileForm>(() => ({
    ...profile,
    phone: formatBrPhone(profile.phone),
    whatsapp: formatBrPhone(profile.whatsapp),
    postalCode: formatCep(profile.postalCode),
  }))
  const [form, setForm] = useState<ProfileForm>(initial)
  const [saved, setSaved] = useState<ProfileForm>(initial)
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [showErrors, setShowErrors] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'missing'>('idle')
  const [copied, setCopied] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const lastCep = useRef('')

  const errors = showErrors ? validate(form) : {}
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const set = (patch: Partial<ProfileForm>) => {
    setForm({ ...form, ...patch })
    if (state.status !== 'saving') setState({ status: 'idle' })
  }

  async function save() {
    if (!form) return
    const problems = validate(form)
    if (Object.keys(problems).length) {
      setShowErrors(true)
      const contactKeys = ['ownerName', 'email', 'phone', 'whatsapp']
      const onContact = Object.keys(problems).every((key) => contactKeys.includes(key))
      const elsewhere = tab === 'espaco' ? onContact : !onContact
      setState({
        status: 'error',
        message: elsewhere
          ? `Confira os campos na aba ${tab === 'espaco' ? 'Contato' : 'Dados do espaço'}.`
          : 'Confira os campos marcados em vermelho.',
      })
      // Bring the first problem into view: it may be on the other tab's part of the page.
      requestAnimationFrame(() => {
        const field = document.querySelector<HTMLInputElement>('.settings-field.is-invalid input')
        field?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        field?.focus({ preventScroll: true })
      })
      return
    }
    setState({ status: 'saving' })
    try {
      await api.put('profile', {
        name: form.name.trim(),
        ownerName: form.ownerName.trim(),
        email: form.email.trim(),
        phone: toE164Phone(form.phone),
        whatsapp: form.whatsapp ? toE164Phone(form.whatsapp) : '',
        foundedYear: form.foundedYear,
        instagram: form.instagram.trim(),
        facebook: form.facebook.trim(),
        website: form.website.trim(),
        logoAssetId: form.logoAssetId,
        addressLine: form.addressLine.trim(),
        addressNumber: form.addressNumber.trim(),
        addressDistrict: form.addressDistrict.trim(),
        addressNote: form.addressNote.trim(),
        city: form.city.trim(),
        state: form.state,
        postalCode: form.postalCode,
      })
      setSaved(form)
      setShowErrors(false)
      setState({ status: 'saved', message: 'Pronto! As alterações foram salvas.' })
      if (form.name !== saved?.name) staff.refresh()
    } catch {
      setState({
        status: 'error',
        message: 'Não foi possível salvar. Confira a internet e tente de novo.',
      })
    }
  }

  async function uploadLogo(selected: File) {
    setUploading(true)
    try {
      const asset = await api.upload('clinic_logo', selected)
      set({ logoAssetId: asset.id, logoUrl: asset.url })
    } catch (cause) {
      setState({
        status: 'error',
        message: cause instanceof Error ? cause.message : 'Não foi possível enviar a imagem.',
      })
    } finally {
      setUploading(false)
    }
  }

  async function changeCep(value: string) {
    const postalCode = formatCep(value)
    set({ postalCode })
    const digits = postalCode.replace(/\D/g, '')
    if (digits.length !== 8 || digits === lastCep.current) return
    lastCep.current = digits
    setLookup('loading')
    const address = await api.postalCode(digits).catch(() => null)
    setLookup(address ? 'idle' : 'missing')
    if (address)
      setForm(
        (current) =>
          current && {
            ...current,
            postalCode,
            addressLine: address.street || current.addressLine,
            addressDistrict: address.district || current.addressDistrict,
            city: address.city || current.city,
            state: address.state || current.state,
          },
      )
  }

  const saveBar = (
    <SaveBar
      dirty={dirty}
      state={state}
      onSave={() => void save()}
      onDiscard={() => {
        setForm(saved)
        setShowErrors(false)
        setState({ status: 'idle' })
      }}
    />
  )

  if (tab === 'contato')
    return (
      <div className="settings-stack">
        <SettingsCard
          icon={<UserRound size={20} />}
          title="Quem responde pelo espaço"
          description="Usamos estes dados para falar com você. Eles não aparecem no site."
          help={{
            title: 'Para que servem estes dados?',
            text: 'São os seus contatos como responsável pelo espaço. A Luminix usa para avisos importantes da conta. Clientes não veem estas informações.',
          }}
          badge={<StatusPill tone="info">Privado</StatusPill>}
        >
          <div className="settings-grid">
            <TextInput
              label="Nome da responsável"
              icon={<UserRound size={17} />}
              value={form.ownerName}
              required
              maxLength={120}
              error={errors.ownerName}
              autoComplete="name"
              onChange={(ownerName) => set({ ownerName })}
            />
            <TextInput
              label="E-mail"
              icon={<Mail size={17} />}
              type="email"
              inputMode="email"
              value={form.email}
              required
              maxLength={254}
              error={errors.email}
              autoComplete="email"
              onChange={(email) => set({ email })}
            />
            <TextInput
              label="Telefone"
              icon={<Phone size={17} />}
              type="tel"
              inputMode="tel"
              value={form.phone}
              required
              placeholder="(11) 98765-4321"
              error={errors.phone}
              autoComplete="tel"
              onChange={(phone) => set({ phone: formatBrPhone(phone) })}
            />
          </div>
        </SettingsCard>
        <SettingsCard
          icon={<MessageCircle size={20} />}
          title="Contatos para clientes"
          description="Podem aparecer no seu site público, se você escolher mostrar em Vitrine e site."
          help={{
            title: 'Onde estes contatos aparecem?',
            text: 'No site do seu espaço, nos botões de WhatsApp e redes sociais. Você decide se eles aparecem em Configurações → Vitrine e site → “Mostrar WhatsApp e redes sociais”.',
          }}
          badge={<StatusPill tone="info">Público (opcional)</StatusPill>}
        >
          <div className="settings-grid">
            <TextInput
              label="WhatsApp do espaço"
              icon={<MessageCircle size={17} />}
              type="tel"
              inputMode="tel"
              value={form.whatsapp}
              placeholder="(11) 98765-4321"
              error={errors.whatsapp}
              hint="Clientes tocam no botão e já abrem a conversa com você."
              onChange={(whatsapp) => set({ whatsapp: formatBrPhone(whatsapp) })}
            />
            <TextInput
              label="Instagram"
              icon={<AtSign size={17} />}
              value={form.instagram}
              placeholder="@seuespaco"
              maxLength={120}
              hint="Pode ser só o @ do perfil."
              onChange={(instagram) => set({ instagram })}
            />
            <TextInput
              label="Facebook"
              icon={<Share2 size={17} />}
              type="url"
              inputMode="url"
              value={form.facebook}
              placeholder="facebook.com/seuespaco"
              maxLength={300}
              onChange={(facebook) => set({ facebook })}
            />
            <TextInput
              label="Site próprio"
              icon={<Globe size={17} />}
              type="url"
              inputMode="url"
              value={form.website}
              placeholder="www.seuespaco.com.br"
              maxLength={300}
              hint="Deixe em branco se você usa só o site da Luminix."
              onChange={(website) => set({ website })}
            />
          </div>
        </SettingsCard>
        {saveBar}
      </div>
    )

  const code = data.clinic.shareCode
  return (
    <div className="settings-stack">
      <SettingsCard
        icon={<BadgeCheck size={20} />}
        title="Identidade do espaço"
        description="Nome e logo aparecem para clientes no site e no app."
        badge={
          <StatusPill tone={data.clinic.status === 'active' ? 'on' : 'off'}>
            {data.clinic.status === 'active' ? 'Ativo' : 'Em configuração'}
          </StatusPill>
        }
      >
        <div className="settings-identity">
          <div className="settings-logo">
            <button
              type="button"
              className="settings-logo-frame"
              onClick={() => file.current?.click()}
              disabled={uploading}
              aria-label={form.logoUrl ? 'Trocar logo' : 'Enviar logo'}
            >
              {uploading ? (
                <Spinner aria-label="Enviando logo" />
              ) : form.logoUrl ? (
                <Image
                  src={form.logoUrl}
                  alt={`Logo de ${form.name}`}
                  width={112}
                  height={112}
                  unoptimized
                />
              ) : (
                <span className="settings-logo-empty">
                  <ImagePlus size={28} aria-hidden />
                  Enviar logo
                </span>
              )}
            </button>
            <input
              ref={file}
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const selected = event.target.files?.[0]
                event.target.value = ''
                if (selected) void uploadLogo(selected)
              }}
            />
            <div className="settings-logo-actions">
              <Button
                size="sm"
                variant="secondary"
                onPress={() => file.current?.click()}
                isDisabled={uploading}
              >
                <ImagePlus size={15} aria-hidden /> {form.logoUrl ? 'Trocar logo' : 'Enviar logo'}
              </Button>
              {form.logoUrl ? (
                <Hint label="Tirar o logo (o site mostra a primeira letra do nome)">
                  <Button
                    size="sm"
                    variant="ghost"
                    isIconOnly
                    aria-label="Remover logo"
                    onPress={() => set({ logoAssetId: '', logoUrl: null })}
                  >
                    <Trash2 size={15} aria-hidden />
                  </Button>
                </Hint>
              ) : null}
            </div>
            <span className="settings-field-hint">
              PNG, JPG ou WebP, até 8 MB. De preferência quadrado.
            </span>
          </div>
          <div className="settings-grid">
            <TextInput
              label="Nome do espaço"
              icon={<Building2 size={17} />}
              value={form.name}
              required
              maxLength={160}
              error={errors.name}
              wide
              help={{
                title: 'Trocar o nome muda o endereço do site?',
                text: 'Não. O endereço do site continua o mesmo, para que links já compartilhados não quebrem. Se quiser, você muda o endereço em Vitrine e site.',
              }}
              onChange={(name) => set({ name })}
            />
            <TextInput
              label="Ano de fundação"
              icon={<CalendarHeart size={17} />}
              inputMode="numeric"
              value={form.foundedYear}
              maxLength={4}
              placeholder="Ex.: 2015"
              error={errors.foundedYear}
              hint={`Aparece no site como “Desde ${form.foundedYear || '2015'}”.`}
              onChange={(foundedYear) => set({ foundedYear: foundedYear.replace(/\D/g, '') })}
            />
            <div className="settings-field">
              <span className="settings-field-label">
                <label>{form.taxIdKind === 'cpf' ? 'CPF' : 'CNPJ'}</label>
                <HelpTip title="Por que não consigo editar?">
                  O documento identifica legalmente o seu espaço e é usado em pagamentos. Para
                  trocar, fale com o suporte da Luminix.
                </HelpTip>
              </span>
              <span className="settings-readonly">
                {form.taxId ?? <Empty>Não informado</Empty>}
              </span>
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        icon={<KeyRound size={20} />}
        title="Código do espaço"
        description="Clientes digitam este código no app Luminix para encontrar você."
        help={{
          title: 'Como as clientes usam o código?',
          text: 'Ao baixar o app Luminix, a cliente digita o código para entrar no seu espaço. Ele também abre o seu site: luminix.beauty/c/código.',
        }}
      >
        {code ? (
          <div className="settings-code">
            <code>{code}</code>
            <Button
              variant="secondary"
              onPress={() => {
                void navigator.clipboard?.writeText(code).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                })
              }}
            >
              <Copy size={16} aria-hidden /> {copied ? 'Copiado!' : 'Copiar código'}
            </Button>
          </div>
        ) : (
          <Empty>O código aparece quando o cadastro é concluído.</Empty>
        )}
      </SettingsCard>

      <SettingsCard
        icon={<MapPin size={20} />}
        title="Endereço"
        description="Digite o CEP e preenchemos o resto para você."
        help={{
          title: 'O endereço aparece para todo mundo?',
          text: 'Só se você quiser. Em Vitrine e site existe a opção “Mostrar endereço e mapa”. Sem ela, o site pede para a cliente consultar o espaço.',
        }}
      >
        <div className="settings-grid">
          <TextInput
            label="CEP"
            icon={<MapPinned size={17} />}
            inputMode="numeric"
            value={form.postalCode}
            placeholder="00000-000"
            error={errors.postalCode}
            hint={
              lookup === 'loading'
                ? 'Procurando o endereço…'
                : lookup === 'missing'
                  ? 'Não achamos este CEP. Preencha os campos abaixo.'
                  : undefined
            }
            suffix={lookup === 'loading' ? <Spinner size="sm" aria-hidden /> : null}
            onChange={(value) => void changeCep(value)}
          />
          <TextInput
            label="Rua / avenida"
            value={form.addressLine}
            maxLength={240}
            wide
            onChange={(addressLine) => set({ addressLine })}
          />
          <TextInput
            label="Número"
            value={form.addressNumber}
            maxLength={20}
            onChange={(addressNumber) => set({ addressNumber })}
          />
          <TextInput
            label="Bairro"
            value={form.addressDistrict}
            maxLength={120}
            onChange={(addressDistrict) => set({ addressDistrict })}
          />
          <TextInput
            label="Cidade"
            value={form.city}
            maxLength={120}
            onChange={(city) => set({ city })}
          />
          <div className="settings-field">
            <span className="settings-field-label">
              <label htmlFor="settings-state">Estado</label>
            </span>
            <span className="settings-input">
              <select
                id="settings-state"
                value={form.state}
                onChange={(event) => set({ state: event.target.value })}
              >
                <option value="">Escolha</option>
                {states.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </span>
          </div>
          <TextInput
            label="Complemento ou referência"
            value={form.addressNote}
            maxLength={240}
            placeholder="Ex.: Sala 3, em frente à padaria"
            wide
            onChange={(addressNote) => set({ addressNote })}
          />
        </div>
      </SettingsCard>
      {saveBar}
      <p className="settings-footnote">
        <AtSign size={14} aria-hidden /> Os contatos ficam na aba Contato.
      </p>
    </div>
  )
}
