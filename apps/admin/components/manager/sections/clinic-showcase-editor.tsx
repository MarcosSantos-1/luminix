'use client'

import { Button } from '@heroui/react'
import Image from 'next/image'
import { useState } from 'react'
import { useStaff } from '@/components/staff-provider'
import { uploadClinicMedia } from '@/lib/media-upload'

type Showcase = {
  style: 'classic' | 'hair-salon'
  subtitle: string
  featured: { serviceId: string; assetId?: string }[]
  gallery: string[]
}

type ShowcaseData = {
  showcase: Partial<Showcase>
  services: { id: string; name: string; category: string | null }[]
  photos: { id: string; url: string }[]
}

export function ClinicShowcaseEditor({ clinicId }: { clinicId: string }) {
  const { user } = useStaff()
  const [data, setData] = useState<ShowcaseData | null>(null)
  const [value, setValue] = useState<Showcase>({
    style: 'classic',
    subtitle: '',
    featured: [],
    gallery: [],
  })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const endpoint = `/api/clinics/${clinicId}/showcase`

  async function run(action: (token: string) => Promise<void>) {
    if (!user || busy) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      await action(await user.getIdToken())
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível concluir. Tente novamente.',
      )
    } finally {
      setBusy(false)
    }
  }

  function load() {
    return run(async (token) => {
      const response = await fetch(endpoint, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) throw new Error('Não foi possível carregar a vitrine.')
      const result: ShowcaseData = await response.json()
      const activeIds = new Set(result.services.map(({ id }) => id))
      setData(result)
      setValue({
        style: result.showcase.style ?? 'classic',
        subtitle: result.showcase.subtitle ?? '',
        featured: (result.showcase.featured ?? []).filter(({ serviceId }) =>
          activeIds.has(serviceId),
        ),
        gallery: result.showcase.gallery ?? [],
      })
    })
  }

  function upload(files: File[], serviceId?: string) {
    return run(async (token) => {
      if (!serviceId && value.gallery.length + files.length > 24)
        throw new Error('A galeria comporta até 24 fotos.')
      for (const file of files) {
        const { asset } = await uploadClinicMedia({ clinicId, token, kind: 'public_photo', file })
        setData(
          (current) =>
            current && {
              ...current,
              photos: [...current.photos, { id: asset.id, url: asset.largeUrl }],
            },
        )
        setValue((current) =>
          serviceId
            ? {
                ...current,
                featured: current.featured.map((item) =>
                  item.serviceId === serviceId ? { ...item, assetId: asset.id } : item,
                ),
              }
            : { ...current, gallery: [...current.gallery, asset.id] },
        )
      }
      setMessage('Fotos enviadas. Salve a vitrine para aplicar as alterações.')
    })
  }

  function save() {
    return run(async (token) => {
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...value, subtitle: value.subtitle.trim() }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok)
        throw new Error('Não foi possível salvar. Confira os serviços e as fotos selecionados.')
      setMessage('Vitrine salva.')
    })
  }

  function photo(id: string | undefined, alt: string) {
    const url = data?.photos.find((item) => item.id === id)?.url
    return url ? (
      <Image
        src={url}
        alt={alt}
        width={96}
        height={96}
        unoptimized
        style={{ objectFit: 'cover', borderRadius: 8 }}
      />
    ) : null
  }

  return (
    <section
      aria-label="Personalização da vitrine"
      style={{ display: 'grid', gap: 12, marginTop: 24 }}
    >
      <h3>Personalizar vitrine</h3>
      {!data ? (
        <Button isDisabled={busy} onPress={() => void load()}>
          {busy ? 'Carregando…' : 'Editar vitrine'}
        </Button>
      ) : (
        <fieldset disabled={busy} style={{ display: 'grid', gap: 16 }}>
          <label className="manager-field">
            Estilo da página
            <select
              value={value.style}
              onChange={(event) =>
                setValue({ ...value, style: event.target.value as Showcase['style'] })
              }
            >
              <option value="classic">Padrão do espaço</option>
              <option value="hair-salon">Salão de cabeleireiro feminino</option>
            </select>
          </label>
          <label className="manager-field">
            Subtítulo (opcional)
            <input
              value={value.subtitle}
              maxLength={120}
              placeholder="Ex.: Cor, corte e cuidado para o seu estilo"
              onChange={(event) => setValue({ ...value, subtitle: event.target.value })}
            />
          </label>
          <h4>Serviços em destaque ({value.featured.length}/4)</h4>
          <p>
            Escolha a ordem dos destaques e adicione uma foto para cada serviço. Os espaços
            restantes são preenchidos pelo catálogo.
          </p>
          {value.featured.map((item, index) => {
            const service = data.services.find(({ id }) => id === item.serviceId)
            return (
              <div key={item.serviceId}>
                <strong>
                  {index + 1}. {service?.name}
                </strong>
                {photo(item.assetId, `Foto de ${service?.name ?? 'serviço'}`)}
                <label className="manager-field">
                  Foto de {service?.name}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? [])
                      event.target.value = ''
                      if (files.length) void upload(files, item.serviceId)
                    }}
                  />
                </label>
                {item.assetId && (
                  <button
                    type="button"
                    onClick={() =>
                      setValue({
                        ...value,
                        featured: value.featured.map((entry) =>
                          entry.serviceId === item.serviceId
                            ? { serviceId: entry.serviceId }
                            : entry,
                        ),
                      })
                    }
                  >
                    Remover foto
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setValue({
                      ...value,
                      featured: value.featured.filter(
                        (entry) => entry.serviceId !== item.serviceId,
                      ),
                    })
                  }
                >
                  Retirar destaque
                </button>
              </div>
            )
          })}
          {value.featured.length < 4 && (
            <label className="manager-field">
              Adicionar serviço em destaque
              <select
                value=""
                onChange={(event) => {
                  if (event.target.value)
                    setValue({
                      ...value,
                      featured: [...value.featured, { serviceId: event.target.value }],
                    })
                }}
              >
                <option value="">Selecione um serviço</option>
                {data.services
                  .filter(({ id }) => !value.featured.some(({ serviceId }) => serviceId === id))
                  .map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                      {service.category ? ` · ${service.category}` : ''}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <h4>Galeria opcional ({value.gallery.length}/24)</h4>
          <p>
            Envie apenas fotos autorizadas para exibição pública. A remoção retira a foto da página,
            mas links já compartilhados podem continuar acessíveis.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {value.gallery.map((id, index) => (
              <div key={id}>
                {photo(id, `Foto ${index + 1} da galeria`)}
                <button
                  type="button"
                  aria-label={`Remover foto ${index + 1} da galeria`}
                  onClick={() =>
                    setValue({ ...value, gallery: value.gallery.filter((entry) => entry !== id) })
                  }
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
          {value.gallery.length < 24 && (
            <label className="manager-field">
              Adicionar fotos à galeria
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? [])
                  event.target.value = ''
                  if (files.length) void upload(files)
                }}
              />
            </label>
          )}
          <Button isDisabled={busy} onPress={() => void save()}>
            {busy ? 'Processando…' : 'Salvar vitrine'}
          </Button>
        </fieldset>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
