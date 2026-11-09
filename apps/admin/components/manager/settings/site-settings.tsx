'use client'

import { Button, Spinner } from '@heroui/react'
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Link2,
  MapPin,
  MessageCircle,
  Paintbrush,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { TextInputField } from '@/components/ui/fields'
import { publicSiteUrl } from '@/lib/public-site'
import { useClinicApi, useClinicResource, ClinicApiError } from './clinic-api'
import {
  HelpTip,
  Hint,
  LoadError,
  SaveBar,
  SettingsCard,
  SettingsSkeleton,
  StatusPill,
  ToggleRow,
  type SaveState,
} from './settings-kit'

type Publication = {
  slug: string
  status: string
  enabled: boolean
  address: boolean
  contacts: boolean
}
type SlugInfo = {
  slug: string
  previous: string[]
  check?: { slug: string; available: boolean; problem: 'taken' | 'reserved' | 'invalid' | null }
  suggestion: string | null
}

const problemText = {
  taken: 'Este endereço já está em uso por outro espaço.',
  reserved: 'Este endereço é reservado pela Luminix. Escolha outro.',
  invalid: 'Use de 3 a 40 letras sem acento, números ou hífen (-).',
} as const

function toSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 40)
}

export function SiteSettings({
  clinicId,
  clinicName,
  editorHref,
}: {
  clinicId: string
  clinicName: string
  editorHref: string
}) {
  const api = useClinicApi(clinicId)
  const resource = useClinicResource<{ publication: Publication }>(api, 'publication')
  const [draft, setDraft] = useState<Publication | null>(null)
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [copied, setCopied] = useState(false)
  const [thumb, setThumb] = useState(false)

  if (resource.error && !resource.data)
    return <LoadError message={resource.error} onRetry={resource.reload} />
  if (!resource.data) return <SettingsSkeleton cards={3} />
  const saved = resource.data.publication
  const form = draft ?? saved

  const active = form.status === 'active'
  const url = publicSiteUrl(saved.slug)
  const shownUrl = url.replace(/^https?:\/\//, '')
  const dirty =
    form.enabled !== saved.enabled ||
    form.address !== saved.address ||
    form.contacts !== saved.contacts

  async function save() {
    setState({ status: 'saving' })
    try {
      await api.put('publication', {
        enabled: form.enabled,
        address: form.address,
        contacts: form.contacts,
      })
      resource.setData({ publication: form })
      setDraft(null)
      setState({
        status: 'saved',
        message: form.enabled
          ? 'Pronto! Seu site está no ar e já pode ser compartilhado.'
          : 'Pronto! Seu site saiu do ar.',
      })
    } catch {
      setState({ status: 'error', message: 'Não foi possível salvar. Tente de novo.' })
    }
  }

  if (!active)
    return (
      <SettingsCard
        icon={<Globe size={20} />}
        title="Seu site público"
        description="Conclua o cadastro do espaço para publicar o seu site."
      >
        <p className="settings-muted">
          O site usa o nome, o logo, o tema e os serviços que você escolheu no cadastro.
        </p>
      </SettingsCard>
    )

  return (
    <div className="settings-stack">
      <SettingsCard
        className="site-hero-card"
        icon={<Globe size={20} />}
        title="Seu site público"
        description="É a página do seu espaço na internet. Clientes veem serviços, preços, horários e como falar com você."
        badge={
          <StatusPill tone={saved.enabled ? 'on' : 'off'}>
            {saved.enabled ? <Eye size={13} aria-hidden /> : <EyeOff size={13} aria-hidden />}
            {saved.enabled ? 'No ar' : 'Fora do ar'}
          </StatusPill>
        }
      >
        <div className="site-link-row">
          <span className="site-link">
            <Link2 size={16} aria-hidden />
            <span>{shownUrl}</span>
          </span>
          <Hint label="Copiar o endereço para mandar no WhatsApp ou Instagram">
            <Button
              variant="secondary"
              size="sm"
              onPress={() =>
                void navigator.clipboard?.writeText(url).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                })
              }
            >
              {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
              {copied ? 'Copiado!' : 'Copiar link'}
            </Button>
          </Hint>
          {saved.enabled ? (
            <Hint label="Abre o site em outra aba, do jeito que as clientes veem">
              <a className="site-open" href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={15} aria-hidden /> Ver como cliente
              </a>
            </Hint>
          ) : null}
        </div>

        <div
          className="site-edit"
          onMouseEnter={() => setThumb(true)}
          onFocus={() => setThumb(true)}
        >
          <Link href={editorHref} className="site-edit-cta">
            <span className="site-edit-icon" aria-hidden>
              <Paintbrush size={22} />
            </span>
            <span>
              <strong>Editar site público</strong>
              <small>Troque cores, capa, fotos e veja o resultado na hora</small>
            </span>
          </Link>
          <div className="site-thumb" aria-hidden>
            {thumb && saved.enabled ? (
              <iframe src={url} title="" tabIndex={-1} loading="lazy" />
            ) : (
              <div className="site-thumb-placeholder">
                <span>{clinicName.trim().slice(0, 1).toLocaleUpperCase('pt-BR')}</span>
                <strong>{clinicName}</strong>
                <i />
                <i />
                <i />
              </div>
            )}
            <span className="site-thumb-label">
              <Sparkles size={13} /> Prévia do seu site
            </span>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        icon={<Eye size={20} />}
        title="O que aparece no site"
        description="Ligue ou desligue. Dados da sua conta e das suas clientes nunca aparecem."
        help={{
          title: 'O que é publicado?',
          text: 'Com o site no ar, qualquer pessoa com o link vê o nome, o logo, as cores, os serviços com preços e os horários. Endereço e contatos só aparecem se você ligar as opções abaixo.',
        }}
      >
        <div className="settings-toggles">
          <ToggleRow
            icon={<Globe size={18} />}
            title="Site no ar"
            description="Desligado, o link mostra que a página não está disponível."
            isSelected={form.enabled}
            onChange={(enabled) => setDraft({ ...form, enabled })}
          />
          <ToggleRow
            icon={<MapPin size={18} />}
            title="Mostrar endereço e mapa"
            description="Clientes veem onde fica o espaço e abrem o Google Maps."
            isSelected={form.address}
            onChange={(address) => setDraft({ ...form, address })}
          />
          <ToggleRow
            icon={<MessageCircle size={18} />}
            title="Mostrar WhatsApp e redes sociais"
            description="Aparece o botão “Agendar avaliação” que abre o seu WhatsApp."
            isSelected={form.contacts}
            onChange={(contacts) => setDraft({ ...form, contacts })}
          />
        </div>
        <SaveBar
          dirty={dirty}
          state={state}
          onSave={() => void save()}
          onDiscard={() => {
            setDraft(null)
            setState({ status: 'idle' })
          }}
        />
      </SettingsCard>

      <SlugEditor
        clinicId={clinicId}
        clinicName={clinicName}
        onChanged={(slug) => {
          resource.setData({ publication: { ...saved, slug } })
          setDraft((current) => current && { ...current, slug })
        }}
      />
    </div>
  )
}

function SlugEditor({
  clinicId,
  clinicName,
  onChanged,
}: {
  clinicId: string
  clinicName: string
  onChanged: (slug: string) => void
}) {
  const api = useClinicApi(clinicId)
  const resource = useClinicResource<SlugInfo>(api, 'slug')
  const [edited, setEdited] = useState<string | null>(null)
  const [check, setCheck] = useState<SlugInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const current = resource.data?.slug ?? ''

  const value = edited ?? current
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  if (resource.error && !resource.data)
    return <LoadError message={resource.error} onRetry={resource.reload} />
  if (!resource.data) return <SettingsSkeleton cards={1} />

  const dirty = value !== current
  const result = check?.check?.slug === value ? check.check : null
  const tooShort = value.length > 0 && value.length < 3

  function type(next: string) {
    const slug = toSlug(next)
    setEdited(slug)
    setState({ status: 'idle' })
    if (timer.current) clearTimeout(timer.current)
    if (slug === current || slug.length < 3) {
      setCheck(null)
      return
    }
    setChecking(true)
    timer.current = setTimeout(() => {
      void api
        .get<SlugInfo>('slug', { check: slug.replace(/-+$/, '') })
        .then(setCheck)
        .catch(() => setCheck(null))
        .finally(() => setChecking(false))
    }, 450)
  }

  async function save() {
    const slug = value.replace(/-+$/, '')
    setState({ status: 'saving' })
    try {
      await api.put('slug', { slug })
      setEdited(null)
      resource.setData({ ...resource.data!, slug, previous: [current, ...resource.data!.previous] })
      onChanged(slug)
      setCheck(null)
      setState({
        status: 'saved',
        message: 'Endereço trocado! O link antigo continua levando ao seu site.',
      })
    } catch (error) {
      const message =
        error instanceof ClinicApiError && error.status === 409
          ? /limit/.test(error.message)
            ? 'Você já trocou o endereço 5 vezes neste mês. Tente de novo mais tarde.'
            : 'Este endereço acabou de ser escolhido por outro espaço. Tente outro.'
          : 'Não foi possível trocar o endereço. Tente de novo.'
      setState({ status: 'error', message })
    }
  }

  const base = publicSiteUrl('').replace(/^https?:\/\//, '')
  return (
    <SettingsCard
      icon={<Link2 size={20} />}
      title="Endereço do site"
      description="Escolha um endereço fácil de lembrar e de digitar."
      help={{
        title: 'Posso trocar o endereço depois?',
        text: 'Pode. Quem tiver o link antigo continua chegando ao seu site, porque guardamos o endereço anterior para você. Cada endereço só pode ser usado por um espaço, como acontece no Instagram.',
      }}
    >
      <TextInputField
        ariaLabel="Endereço do site"
        className="slug-input"
        value={value}
        maxLength={40}
        onChange={type}
        error={result && !result.available ? ' ' : undefined}
        prefix={<span className="slug-prefix">{base}</span>}
        suffix={
          <span className="slug-status" aria-hidden>
            {checking ? (
              <Spinner size="sm" />
            ) : result?.available ? (
              <Check size={18} />
            ) : result ? (
              <X size={18} />
            ) : null}
          </span>
        }
      />
      <p className="slug-feedback" role="status" aria-live="polite">
        {tooShort
          ? problemText.invalid
          : checking
            ? 'Verificando se está livre…'
            : result?.available
              ? 'Ótimo, este endereço está livre!'
              : result?.problem
                ? problemText[result.problem]
                : !dirty
                  ? 'Este é o endereço atual do seu site.'
                  : ''}
      </p>
      {result && !result.available && check?.suggestion ? (
        <Button size="sm" variant="secondary" onPress={() => type(check.suggestion!)}>
          <Sparkles size={14} aria-hidden /> Usar “{check.suggestion}”
        </Button>
      ) : null}
      {!dirty && toSlug(clinicName) !== current && toSlug(clinicName).length >= 3 ? (
        <Button size="sm" variant="ghost" onPress={() => type(toSlug(clinicName))}>
          <Sparkles size={14} aria-hidden /> Sugerir pelo nome do espaço
        </Button>
      ) : null}
      {resource.data.previous.length > 0 ? (
        <p className="settings-footnote">
          <TriangleAlert size={14} aria-hidden /> Endereços antigos que continuam funcionando:{' '}
          {resource.data.previous.slice(0, 3).join(', ')}
          <HelpTip title="Endereços antigos">
            Eles redirecionam para o endereço atual enquanto o site estiver no ar. Nenhum outro
            espaço pode usá-los.
          </HelpTip>
        </p>
      ) : null}
      <SaveBar
        dirty={dirty && Boolean(result?.available)}
        state={state}
        onSave={() => void save()}
        onDiscard={() => {
          setEdited(null)
          setCheck(null)
          setState({ status: 'idle' })
        }}
        label="Trocar endereço"
      />
    </SettingsCard>
  )
}
