'use client'

import { Button, Chip, Spinner } from '@heroui/react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarHeart,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  Image as ImageIcon,
  ImagePlus,
  Images,
  LayoutTemplate,
  MapPin,
  MessageCircle,
  Monitor,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Save,
  Scissors,
  Share2,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useClinicApi } from '@/components/manager/settings/clinic-api'
import { HelpTip, Hint, ToggleRow } from '@/components/manager/settings/settings-kit'
import { publicSiteOrigin, publicSiteUrl } from '@/lib/public-site'
import { spaceThemes } from '@/lib/space-theme'
import './site-editor.css'

export const heroOptions = {
  cabelo: 'Cabeleireiro feminino',
  barbearia: 'Barbearia',
  'estetica-avancada': 'Estética avançada',
  'estetica-facial': 'Estética facial',
  'estetica-corporal': 'Estética corporal',
  depilacao: 'Depilação',
  massoterapia: 'Massoterapia',
  quiropraxia: 'Quiropraxia',
  sobrancelhas: 'Sobrancelhas',
  cilios: 'Cílios',
  unhas: 'Nail design',
  tatuagem: 'Tatuagem',
  piercing: 'Piercing',
} as const
type HeroKey = keyof typeof heroOptions
const heroImages: Record<HeroKey, string> = {
  cabelo: '/clinic/demo-portrait.webp',
  barbearia: '/clinic/heroes/barbearia.webp',
  'estetica-avancada': '/clinic/heroes/estetica-avancada.webp',
  'estetica-facial': '/clinic/heroes/estetica-facial.webp',
  'estetica-corporal': '/clinic/heroes/estetica-corporal.webp',
  depilacao: '/clinic/heroes/depilacao.webp',
  massoterapia: '/clinic/heroes/massoterapia.webp',
  quiropraxia: '/clinic/heroes/massoterapia.webp',
  sobrancelhas: '/clinic/heroes/sobrancelhas-cilios.webp',
  cilios: '/clinic/heroes/sobrancelhas-cilios.webp',
  unhas: '/clinic/heroes/unhas.webp',
  tatuagem: '/clinic/heroes/tatuagem.webp',
  piercing: '/clinic/heroes/piercing.webp',
}

type Hidden = 'hours' | 'foundedYear' | 'app' | 'socials'
type Showcase = {
  style: 'classic' | 'hair-salon' | 'standard'
  heroCategory: HeroKey | ''
  theme: string
  title: string
  subtitle: string
  featured: { serviceId: string }[]
  gallery: string[]
  servicePhotos: { serviceId: string; assetId: string }[]
  hidden: Hidden[]
}
type Publication = { enabled: boolean; address: boolean; contacts: boolean }
type ShowcaseResponse = {
  showcase: Partial<Showcase> & { featured?: { serviceId: string; assetId?: string }[] }
  initialHero: HeroKey | null
  services: { id: string; name: string; category: string | null }[]
  photos: { id: string; url: string }[]
}
type PreviewClinic = Record<string, unknown> & {
  name: string
  theme: string
  services: { id: string; name: string; category: string; priceCents: number }[]
}
type PreviewResponse = { clinic: PreviewClinic; publication: Publication }

const tabs = [
  { id: 'cores', label: 'Cores', icon: Palette },
  { id: 'capa', label: 'Capa', icon: LayoutTemplate },
  { id: 'info', label: 'Informações', icon: MapPin },
  { id: 'servicos', label: 'Serviços', icon: Scissors },
  { id: 'galeria', label: 'Galeria', icon: Images },
] as const
type Tab = (typeof tabs)[number]['id']
const sectionTab: Record<string, Tab> = {
  cover: 'capa',
  services: 'servicos',
  info: 'info',
  gallery: 'galeria',
}
const tabSection: Record<Tab, string> = {
  cores: 'cover',
  capa: 'cover',
  info: 'info',
  servicos: 'services',
  galeria: 'gallery',
}

function normalize(data: ShowcaseResponse): Showcase {
  const active = new Set(data.services.map(({ id }) => id))
  const photos = new Map<string, string>()
  for (const { serviceId, assetId } of [
    ...(data.showcase.featured ?? []),
    ...(data.showcase.servicePhotos ?? []),
  ])
    if (assetId && active.has(serviceId)) photos.set(serviceId, assetId)
  return {
    style: data.showcase.style ?? 'classic',
    heroCategory:
      data.showcase.heroCategory ?? (data.showcase.style === 'hair-salon' ? 'cabelo' : ''),
    theme: data.showcase.theme ?? '',
    title: data.showcase.title ?? '',
    subtitle: data.showcase.subtitle ?? '',
    featured: (data.showcase.featured ?? [])
      .filter(({ serviceId }) => active.has(serviceId))
      .map(({ serviceId }) => ({ serviceId })),
    gallery: data.showcase.gallery ?? [],
    servicePhotos: [...photos].map(([serviceId, assetId]) => ({ serviceId, assetId })),
    hidden: (data.showcase.hidden ?? []) as Hidden[],
  }
}

export function SiteEditor({
  clinic,
  backHref,
}: {
  clinic: { id: string; name: string; theme?: string }
  backHref: string
}) {
  const api = useClinicApi(clinic.id)
  const frame = useRef<HTMLIFrameElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  const serviceInput = useRef<HTMLInputElement>(null)
  const photoTarget = useRef<string | null>(null)
  const [data, setData] = useState<ShowcaseResponse | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [loadError, setLoadError] = useState('')
  const [value, setValue] = useState<Showcase | null>(null)
  const [saved, setSaved] = useState<Showcase | null>(null)
  const [publication, setPublication] = useState<Publication | null>(null)
  const [savedPublication, setSavedPublication] = useState<Publication | null>(null)
  const [photos, setPhotos] = useState<Map<string, string>>(new Map())
  const [tab, setTab] = useState<Tab>('cores')
  const [open, setOpen] = useState(true)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [frameReady, setFrameReady] = useState(false)
  const [busy, setBusy] = useState<'' | 'saving' | 'uploading'>('')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!api.ready) return
    let active = true
    void Promise.all([
      api.get<ShowcaseResponse>('showcase'),
      api.get<PreviewResponse>('showcase/preview'),
    ])
      .then(([showcase, projection]) => {
        if (!active) return
        const normalized = normalize(showcase)
        setData(showcase)
        setPreview(projection)
        setValue(normalized)
        setSaved(normalized)
        setPublication(projection.publication)
        setSavedPublication(projection.publication)
        setPhotos(new Map(showcase.photos.map(({ id, url }) => [id, url])))
        setLoadError('')
      })
      .catch(() => active && setLoadError('Não conseguimos abrir o editor agora.'))
    return () => {
      active = false
    }
  }, [api, retry])

  const dirty =
    JSON.stringify(value) !== JSON.stringify(saved) ||
    JSON.stringify(publication) !== JSON.stringify(savedPublication)

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Same rules as the SQL projection, applied to unsaved choices.
  const previewClinic = useMemo(() => {
    if (!preview || !value || !publication || !data) return null
    const base = preview.clinic
    const servicePhotos = value.servicePhotos.flatMap(({ serviceId, assetId }) => {
      const photoUrl = photos.get(assetId)
      return photoUrl ? [{ serviceId, photoUrl }] : []
    })
    const photoFor = new Map(servicePhotos.map((item) => [item.serviceId, item.photoUrl]))
    return {
      ...base,
      name: value.title.trim() || clinic.name,
      theme: value.theme || clinic.theme || 'rosa',
      style: value.style,
      subtitle: value.subtitle.trim() || null,
      heroCategory: value.heroCategory || data.initialHero || null,
      hidden: value.hidden,
      featured: value.featured.map(({ serviceId }) => ({
        serviceId,
        photoUrl: photoFor.get(serviceId) ?? null,
      })),
      servicePhotos,
      gallery: value.gallery.flatMap((id) => photos.get(id) ?? []),
      location: publication.address ? base.location : null,
      whatsapp: publication.contacts ? base.whatsapp : null,
      instagram: publication.contacts ? base.instagram : null,
      facebook: publication.contacts ? base.facebook : null,
      website: publication.contacts ? base.website : null,
    }
  }, [preview, value, publication, data, photos, clinic.name, clinic.theme])

  const origin = publicSiteOrigin()
  const send = useCallback(
    (message: unknown) => frame.current?.contentWindow?.postMessage(message, origin),
    [origin],
  )
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow) return
      const message = event.data as { type?: string; section?: string }
      if (message?.type === 'luminix:preview-ready') setFrameReady(true)
      if (message?.type === 'luminix:focus' && message.section && sectionTab[message.section]) {
        setTab(sectionTab[message.section])
        setOpen(true)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [origin])
  useEffect(() => {
    if (frameReady && previewClinic) send({ type: 'luminix:preview', clinic: previewClinic })
  }, [frameReady, previewClinic, send])

  if (loadError)
    return (
      <div className="se-status" role="alert">
        <p>{loadError}</p>
        <Button onPress={() => setRetry((count) => count + 1)}>
          <RotateCcw size={16} aria-hidden /> Tentar novamente
        </Button>
        <Link href={backHref}>Voltar ao painel</Link>
      </div>
    )

  const patch = (next: Partial<Showcase>) => {
    setValue((current) => current && { ...current, ...next })
    setNotice(null)
  }
  const goTo = (next: Tab) => {
    setTab(next)
    setOpen(true)
    send({ type: 'luminix:scroll', section: tabSection[next] })
  }

  async function uploadFiles(files: File[], serviceId?: string) {
    if (!value) return
    if (!serviceId && value.gallery.length + files.length > 24) {
      setNotice({ kind: 'error', text: 'A galeria aceita até 24 fotos.' })
      return
    }
    setBusy('uploading')
    setNotice(null)
    try {
      for (const file of files) {
        const asset = await api.upload('public_photo', file)
        setPhotos((current) => new Map(current).set(asset.id, asset.url))
        setValue(
          (current) =>
            current &&
            (serviceId
              ? {
                  ...current,
                  servicePhotos: [
                    ...current.servicePhotos.filter((item) => item.serviceId !== serviceId),
                    { serviceId, assetId: asset.id },
                  ],
                }
              : { ...current, gallery: [...current.gallery, asset.id] }),
        )
      }
      setNotice({ kind: 'ok', text: 'Foto enviada! Clique em Salvar para colocar no site.' })
    } catch (cause) {
      setNotice({
        kind: 'error',
        text: cause instanceof Error ? cause.message : 'Não foi possível enviar a foto.',
      })
    } finally {
      setBusy('')
    }
  }

  async function save() {
    if (!value || !publication) return
    setBusy('saving')
    setNotice(null)
    try {
      await api.put('showcase', {
        ...value,
        title: value.title.trim(),
        subtitle: value.subtitle.trim(),
      })
      if (JSON.stringify(publication) !== JSON.stringify(savedPublication))
        await api.put('publication', publication)
      setSaved(value)
      setSavedPublication(publication)
      setNotice({
        kind: 'ok',
        text: publication.enabled
          ? 'Pronto! Seu site foi atualizado.'
          : 'Salvo! Seu site ainda está fora do ar.',
      })
    } catch {
      setNotice({
        kind: 'error',
        text: 'Não foi possível salvar. Confira a internet e tente de novo.',
      })
    } finally {
      setBusy('')
    }
  }

  const loading = !value || !data || !publication
  const serviceName = (id: string) => data?.services.find((service) => service.id === id)?.name
  const toggleHidden = (key: Hidden, visible: boolean) =>
    value &&
    patch({
      hidden: visible ? value.hidden.filter((item) => item !== key) : [...value.hidden, key],
    })

  return (
    <div className="se-shell" data-device={device} data-panel={open ? 'open' : 'closed'}>
      <header className="se-topbar">
        <Link className="se-back" href={backHref}>
          <ArrowLeft size={18} aria-hidden /> <span>Voltar ao painel</span>
        </Link>
        <div className="se-title">
          <strong>Editar site público</strong>
          {publication ? (
            <Chip
              size="sm"
              variant="soft"
              color={savedPublication?.enabled ? 'success' : 'default'}
            >
              {savedPublication?.enabled ? 'No ar' : 'Fora do ar'}
            </Chip>
          ) : null}
        </div>
        <div className="se-actions">
          <div className="se-device" role="group" aria-label="Ver como">
            <Hint label="Ver como no computador">
              <Button
                isIconOnly
                variant={device === 'desktop' ? 'secondary' : 'ghost'}
                aria-pressed={device === 'desktop'}
                aria-label="Ver como no computador"
                onPress={() => setDevice('desktop')}
              >
                <Monitor size={17} />
              </Button>
            </Hint>
            <Hint label="Ver como no celular">
              <Button
                isIconOnly
                variant={device === 'mobile' ? 'secondary' : 'ghost'}
                aria-pressed={device === 'mobile'}
                aria-label="Ver como no celular"
                onPress={() => setDevice('mobile')}
              >
                <Smartphone size={17} />
              </Button>
            </Hint>
          </div>
          {preview && savedPublication?.enabled ? (
            <Hint label="Abre o site publicado em outra aba">
              <a
                className="se-link"
                href={publicSiteUrl(String(preview.clinic.slug ?? ''))}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={16} aria-hidden /> <span>Ver site</span>
              </a>
            </Hint>
          ) : null}
          <Button
            className="se-save"
            onPress={() => void save()}
            isDisabled={!dirty || busy !== ''}
          >
            {busy === 'saving' ? <Spinner size="sm" aria-hidden /> : <Save size={16} aria-hidden />}
            {busy === 'saving' ? 'Salvando…' : dirty ? 'Salvar' : 'Salvo'}
          </Button>
        </div>
      </header>

      <div className="se-stage">
        <div className="se-frame-wrap">
          <iframe
            ref={frame}
            className="se-frame"
            src={`${origin}/c/previa`}
            title="Prévia do seu site"
          />
          {!frameReady || loading ? (
            <div className="se-frame-loading" role="status">
              <Spinner aria-hidden /> Carregando a prévia do seu site…
            </div>
          ) : null}
          <p className="se-frame-hint">
            <Sparkles size={14} aria-hidden /> Clique em qualquer parte do site para editar
          </p>
        </div>

        <aside className="se-panel" aria-label="Painel de edição">
          <div className="se-panel-head">
            <strong>O que você quer mudar?</strong>
            <Hint label={open ? 'Esconder o painel' : 'Mostrar o painel'}>
              <Button
                isIconOnly
                variant="ghost"
                aria-label={open ? 'Esconder o painel' : 'Mostrar o painel'}
                onPress={() => setOpen(!open)}
              >
                {open ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
              </Button>
            </Hint>
          </div>
          <nav className="se-tabs" aria-label="Partes do site">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className="se-tab"
                aria-current={tab === id ? 'true' : undefined}
                onClick={() => goTo(id)}
              >
                <Icon size={18} aria-hidden />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="se-panel-body">
            {loading ? (
              <div className="se-panel-loading" role="status">
                <Spinner aria-hidden /> Carregando suas informações…
              </div>
            ) : tab === 'cores' ? (
              <section className="se-section" aria-labelledby="se-colors">
                <h2 id="se-colors">
                  Cores do site
                  <HelpTip title="As cores mudam o painel também?">
                    Não. Estas cores valem só para o site público. “Mesmas do painel” acompanha o
                    tema que você usa na gestão.
                  </HelpTip>
                </h2>
                <div className="se-themes">
                  <button
                    type="button"
                    className="se-theme"
                    aria-pressed={value.theme === ''}
                    onClick={() => patch({ theme: '' })}
                  >
                    <span className="se-swatch is-auto" aria-hidden />
                    Mesmas do painel
                  </button>
                  {spaceThemes.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      className="se-theme"
                      aria-pressed={value.theme === theme.id}
                      onClick={() => patch({ theme: theme.id })}
                    >
                      <span
                        className="se-swatch"
                        style={{
                          background: `linear-gradient(135deg, ${theme.dark}, ${theme.light})`,
                        }}
                        aria-hidden
                      />
                      {theme.label}
                      {value.theme === theme.id ? <Check size={15} aria-hidden /> : null}
                    </button>
                  ))}
                </div>
                <h2>
                  Estilo da página
                  <HelpTip title="Qual estilo escolher?">
                    “Automático” escolhe o estilo pela ilustração da capa. “Editorial” usa letras
                    maiores, como revista. “Clássico” é mais simples e direto.
                  </HelpTip>
                </h2>
                <div className="se-segment" role="radiogroup" aria-label="Estilo da página">
                  {(
                    [
                      ['classic', 'Automático'],
                      ['standard', 'Clássico'],
                      ['hair-salon', 'Editorial'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={value.style === id}
                      onClick={() => patch({ style: id })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>
            ) : tab === 'capa' ? (
              <section className="se-section" aria-labelledby="se-cover">
                <h2 id="se-cover">
                  <Type size={17} aria-hidden /> Textos da capa
                </h2>
                <label className="se-field">
                  <span>Nome que aparece no site</span>
                  <input
                    value={value.title}
                    maxLength={100}
                    placeholder={clinic.name}
                    onChange={(event) => patch({ title: event.target.value })}
                  />
                  <small>Deixe vazio para usar o nome do espaço.</small>
                </label>
                <label className="se-field">
                  <span>Frase de apresentação (subtítulo)</span>
                  <input
                    value={value.subtitle}
                    maxLength={120}
                    placeholder="Ex.: Cuidado e beleza feitos para você"
                    onChange={(event) => patch({ subtitle: event.target.value })}
                  />
                  <small>{value.subtitle.length}/120 letras</small>
                </label>
                <h2>
                  <ImageIcon size={17} aria-hidden /> Ilustração da capa
                  <HelpTip title="O que é a ilustração?">
                    É o desenho grande ao lado do nome. Escolha o que mais combina com o seu
                    trabalho. A “Sugestão” foi escolhida pelos serviços que você cadastrou.
                  </HelpTip>
                </h2>
                <div className="se-heroes">
                  <button
                    type="button"
                    className="se-hero"
                    aria-pressed={value.heroCategory === ''}
                    onClick={() => patch({ heroCategory: '' })}
                  >
                    {data.initialHero ? (
                      <Image
                        src={`${origin}${heroImages[data.initialHero]}`}
                        alt=""
                        width={96}
                        height={96}
                        unoptimized
                      />
                    ) : (
                      <span className="se-hero-letter">{clinic.name.slice(0, 1)}</span>
                    )}
                    <span>
                      <Star size={12} aria-hidden /> Sugestão
                    </span>
                  </button>
                  {(Object.keys(heroOptions) as HeroKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className="se-hero"
                      aria-pressed={value.heroCategory === key}
                      onClick={() => patch({ heroCategory: key })}
                    >
                      <Image
                        src={`${origin}${heroImages[key]}`}
                        alt=""
                        width={96}
                        height={96}
                        unoptimized
                      />
                      <span>{heroOptions[key]}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : tab === 'info' ? (
              <section className="se-section" aria-labelledby="se-info">
                <h2 id="se-info">
                  O que mostrar no site
                  <HelpTip title="Posso esconder e mostrar depois?">
                    Pode, quantas vezes quiser. Desligar só tira a informação do site; nada é
                    apagado do seu cadastro.
                  </HelpTip>
                </h2>
                <div className="se-toggles">
                  <ToggleRow
                    icon={<Sparkles size={17} />}
                    title="Site no ar"
                    description="Desligado, ninguém consegue abrir o seu site."
                    isSelected={publication.enabled}
                    onChange={(enabled) => setPublication({ ...publication, enabled })}
                  />
                  <ToggleRow
                    icon={<MapPin size={17} />}
                    title="Endereço e mapa"
                    isSelected={publication.address}
                    onChange={(address) => setPublication({ ...publication, address })}
                  />
                  <ToggleRow
                    icon={<MessageCircle size={17} />}
                    title="WhatsApp e redes sociais"
                    description="Inclui o botão “Agendar avaliação”."
                    isSelected={publication.contacts}
                    onChange={(contacts) => setPublication({ ...publication, contacts })}
                  />
                  <ToggleRow
                    icon={<Share2 size={17} />}
                    title="Ícones das redes na capa"
                    isSelected={!value.hidden.includes('socials')}
                    disabled={!publication.contacts}
                    onChange={(visible) => toggleHidden('socials', visible)}
                  />
                  <ToggleRow
                    icon={<Clock3 size={17} />}
                    title="Horários de funcionamento"
                    isSelected={!value.hidden.includes('hours')}
                    onChange={(visible) => toggleHidden('hours', visible)}
                  />
                  <ToggleRow
                    icon={<CalendarHeart size={17} />}
                    title="Ano de fundação (“Desde…”)"
                    isSelected={!value.hidden.includes('foundedYear')}
                    onChange={(visible) => toggleHidden('foundedYear', visible)}
                  />
                  <ToggleRow
                    icon={<Smartphone size={17} />}
                    title="Convite para baixar o app"
                    description="Mostra o código do espaço para as clientes."
                    isSelected={!value.hidden.includes('app')}
                    onChange={(visible) => toggleHidden('app', visible)}
                  />
                </div>
                <p className="se-note">
                  Para mudar o endereço, telefone ou redes, vá em Configurações → Dados do espaço ou
                  Contato.
                </p>
              </section>
            ) : tab === 'servicos' ? (
              <section className="se-section" aria-labelledby="se-services">
                <h2 id="se-services">
                  Destaques da página ({value.featured.length}/4)
                  <HelpTip title="O que são os destaques?">
                    São os serviços que aparecem primeiro, logo abaixo da capa. Você escolhe até 4 e
                    a ordem. Se escolher menos, completamos com outros do catálogo.
                  </HelpTip>
                </h2>
                <ol className="se-featured">
                  {value.featured.map((item, index) => (
                    <li key={item.serviceId}>
                      <span className="se-rank">{index + 1}</span>
                      <span className="se-featured-name">{serviceName(item.serviceId)}</span>
                      <Hint label="Subir">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          aria-label="Subir"
                          isDisabled={index === 0}
                          onPress={() => {
                            const next = [...value.featured]
                            ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
                            patch({ featured: next })
                          }}
                        >
                          <ArrowUp size={15} />
                        </Button>
                      </Hint>
                      <Hint label="Descer">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          aria-label="Descer"
                          isDisabled={index === value.featured.length - 1}
                          onPress={() => {
                            const next = [...value.featured]
                            ;[next[index + 1], next[index]] = [next[index], next[index + 1]]
                            patch({ featured: next })
                          }}
                        >
                          <ArrowDown size={15} />
                        </Button>
                      </Hint>
                      <Hint label="Tirar dos destaques">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          aria-label="Tirar dos destaques"
                          onPress={() =>
                            patch({
                              featured: value.featured.filter(
                                (entry) => entry.serviceId !== item.serviceId,
                              ),
                            })
                          }
                        >
                          <X size={15} />
                        </Button>
                      </Hint>
                    </li>
                  ))}
                </ol>
                {value.featured.length < 4 ? (
                  <label className="se-field">
                    <span>
                      <Plus size={14} aria-hidden /> Adicionar destaque
                    </span>
                    <span className="se-select">
                      <select
                        value=""
                        onChange={(event) =>
                          event.target.value &&
                          patch({
                            featured: [...value.featured, { serviceId: event.target.value }],
                          })
                        }
                      >
                        <option value="">Escolha um serviço</option>
                        {data.services
                          .filter(({ id }) => !value.featured.some((item) => item.serviceId === id))
                          .map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name}
                            </option>
                          ))}
                      </select>
                      <ChevronDown size={16} aria-hidden />
                    </span>
                  </label>
                ) : null}
                <h2>
                  Fotos dos serviços
                  <HelpTip title="Preciso colocar foto em todos?">
                    Não. Sem foto, o serviço usa uma ilustração bonita da categoria. Use fotos do
                    seu trabalho, com autorização das clientes que aparecem.
                  </HelpTip>
                </h2>
                <ul className="se-service-photos">
                  {data.services.map((service) => {
                    const assetId = value.servicePhotos.find(
                      (item) => item.serviceId === service.id,
                    )?.assetId
                    const url = assetId ? photos.get(assetId) : undefined
                    return (
                      <li key={service.id}>
                        <span className="se-thumb">
                          {url ? (
                            <Image src={url} alt="" width={52} height={52} unoptimized />
                          ) : (
                            <ImageIcon size={18} aria-hidden />
                          )}
                        </span>
                        <span className="se-service-name">
                          {service.name}
                          {service.category ? <small>{service.category}</small> : null}
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          isDisabled={busy !== ''}
                          onPress={() => {
                            photoTarget.current = service.id
                            serviceInput.current?.click()
                          }}
                        >
                          <ImagePlus size={14} aria-hidden /> {url ? 'Trocar' : 'Foto'}
                        </Button>
                        {url ? (
                          <Hint label="Tirar a foto (volta a ilustração)">
                            <Button
                              isIconOnly
                              size="sm"
                              variant="ghost"
                              aria-label={`Tirar foto de ${service.name}`}
                              onPress={() =>
                                patch({
                                  servicePhotos: value.servicePhotos.filter(
                                    (item) => item.serviceId !== service.id,
                                  ),
                                })
                              }
                            >
                              <Trash2 size={14} />
                            </Button>
                          </Hint>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : (
              <section className="se-section" aria-labelledby="se-gallery">
                <h2 id="se-gallery">
                  Galeria de fotos ({value.gallery.length}/24)
                  <HelpTip title="Que fotos colocar?">
                    Fotos do espaço, da equipe e de trabalhos prontos. A página mostra as 4
                    primeiras e um botão para ver todas. Envie só fotos que você pode publicar.
                  </HelpTip>
                </h2>
                <div className="se-gallery">
                  {value.gallery.map((id, index) => (
                    <figure key={id}>
                      {photos.get(id) ? (
                        <Image
                          src={photos.get(id)!}
                          alt={`Foto ${index + 1}`}
                          width={120}
                          height={120}
                          unoptimized
                        />
                      ) : null}
                      <Hint label="Tirar da galeria">
                        <Button
                          isIconOnly
                          size="sm"
                          className="se-gallery-remove"
                          aria-label={`Tirar foto ${index + 1} da galeria`}
                          onPress={() =>
                            patch({ gallery: value.gallery.filter((entry) => entry !== id) })
                          }
                        >
                          <Trash2 size={14} />
                        </Button>
                      </Hint>
                    </figure>
                  ))}
                  {value.gallery.length < 24 ? (
                    <button
                      type="button"
                      className="se-gallery-add"
                      disabled={busy !== ''}
                      onClick={() => galleryInput.current?.click()}
                    >
                      {busy === 'uploading' ? <Spinner size="sm" /> : <ImagePlus size={24} />}
                      Adicionar fotos
                    </button>
                  ) : null}
                </div>
                <p className="se-note">
                  Tirar uma foto da galeria remove do site; quem já salvou o link da imagem ainda
                  pode vê-la.
                </p>
              </section>
            )}
          </div>
          {notice ? (
            <p className={`se-notice is-${notice.kind}`} role="status">
              {notice.kind === 'ok' ? <Check size={16} aria-hidden /> : <X size={16} aria-hidden />}
              {notice.text}
            </p>
          ) : null}
          <footer className="se-panel-foot">
            <Button
              variant="ghost"
              isDisabled={!dirty || busy !== ''}
              onPress={() => {
                setValue(saved)
                setPublication(savedPublication)
                setNotice(null)
              }}
            >
              <RotateCcw size={15} aria-hidden /> Desfazer
            </Button>
            <Button onPress={() => void save()} isDisabled={!dirty || busy !== ''}>
              <Save size={15} aria-hidden /> {busy === 'saving' ? 'Salvando…' : 'Salvar no site'}
            </Button>
          </footer>
        </aside>
        {!open ? (
          <Button className="se-reopen" onPress={() => setOpen(true)}>
            <PanelRightOpen size={18} aria-hidden /> Editar
          </Button>
        ) : null}
      </div>
      <input
        ref={galleryInput}
        hidden
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length) void uploadFiles(files)
        }}
      />
      <input
        ref={serviceInput}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file && photoTarget.current) void uploadFiles([file], photoTarget.current)
        }}
      />
    </div>
  )
}
