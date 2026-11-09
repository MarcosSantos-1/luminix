'use client'

import { Button, Spinner } from '@heroui/react'
import {
  Building2,
  ChartColumnIncreasing,
  Columns2,
  Folder,
  FolderPlus,
  HardDrive,
  ImagePlus,
  Images,
  LockKeyhole,
  Megaphone,
  Pencil,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import {
  ClinicApiError,
  useClinicApi,
  useClinicResource,
  type ClinicApi,
} from '@/components/manager/settings/clinic-api'
import {
  Empty,
  HelpTip,
  LoadError,
  SettingsCard,
  SettingsSkeleton,
  StatusPill,
} from '@/components/manager/settings/settings-kit'
import './media.css'

type FolderInfo = { id: string; name: string; systemKey: string | null; count: number }
type Library = {
  folders: FolderInfo[]
  usage: { libraryBytes: number; otherBytes: number; items: number; trashed: number }
  storageReady: boolean
  canManage: boolean
}
type Item = {
  id: string
  folderId: string
  title: string
  createdAt: string
  bytes: number
  thumbUrl: string | null
  fullUrl: string | null
}

const TRASH = 'trash'
const folderIcons: Record<string, typeof Folder> = {
  clients: UserRound,
  before_after: Columns2,
  marketing: Megaphone,
  space: Building2,
  team: UsersRound,
}
const folderHints: Record<string, string> = {
  clients: 'Fotos das clientes. Em breve: um álbum para cada cliente.',
  before_after: 'Registros de antes e depois para acompanhar resultados.',
  marketing: 'Fotos para posts, campanhas e o site.',
  space: 'Fachada, recepção, salas e ambiente.',
  team: 'Fotos da equipe trabalhando e de eventos.',
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1).replace('.', ',')} MB`
  return `${(bytes / 1024 ** 3).toFixed(2).replace('.', ',')} GB`
}

export function MediaLibrary({ clinicId }: { clinicId: string }) {
  const api = useClinicApi(clinicId)
  const library = useClinicResource<Library>(api, 'library')
  const [selected, setSelected] = useState<string | null>(null)

  if (library.error && !library.data)
    return <LoadError message={library.error} onRetry={library.reload} />
  if (!library.data) return <SettingsSkeleton cards={2} />
  const data = library.data
  const current = selected ?? data.folders[0]?.id ?? TRASH
  const total = data.usage.libraryBytes + data.usage.otherBytes

  return (
    <div className="media-page">
      <SettingsCard
        className="media-hero"
        icon={<Images size={20} />}
        title="Seu acervo de fotos"
        description="Guarde aqui as fotos do espaço, do seu trabalho e das clientes. Nada de lotar o celular: fica tudo organizado e seguro."
        badge={
          <StatusPill tone="on">
            <LockKeyhole size={12} aria-hidden /> Privado
          </StatusPill>
        }
        help={{
          title: 'Quem consegue ver estas fotos?',
          text: 'Só a sua equipe, de acordo com o nível de acesso de cada pessoa. As fotos não aparecem no site nem para clientes, a não ser que você escolha usar alguma lá.',
        }}
      >
        <div className="media-usage">
          <span className="media-usage-icon" aria-hidden>
            <HardDrive size={18} />
          </span>
          <div>
            <strong>{formatBytes(total)} em uso</strong>
            <small>
              {formatBytes(data.usage.libraryBytes)} no acervo ({data.usage.items}{' '}
              {data.usage.items === 1 ? 'foto' : 'fotos'}) · {formatBytes(data.usage.otherBytes)} em
              logo, equipe e site
            </small>
          </div>
          <span className="media-usage-note">Limites por plano em breve</span>
        </div>
        {!data.storageReady ? (
          <p className="media-banner" role="status">
            <Sparkles size={16} aria-hidden /> Estamos terminando de preparar o armazenamento
            privado. Você já pode organizar as pastas; o envio de fotos será liberado em breve.
          </p>
        ) : null}
      </SettingsCard>

      <div className="media-layout">
        <FolderList
          api={api}
          folders={data.folders}
          trashed={data.usage.trashed}
          current={current}
          canManage={data.canManage}
          onSelect={setSelected}
          onChanged={library.reload}
        />
        <FolderView
          key={current}
          api={api}
          folder={data.folders.find((folder) => folder.id === current) ?? null}
          folders={data.folders}
          canManage={data.canManage}
          storageReady={data.storageReady}
          onChanged={library.reload}
        />
      </div>

      <SettingsCard
        icon={<Sparkles size={20} />}
        title="O que vem por aí"
        description="O acervo é a base para várias novidades do Luminix."
      >
        <ul className="media-roadmap">
          <li>
            <UserRound size={18} aria-hidden /> Álbum de cada cliente, direto na ficha dela
          </li>
          <li>
            <Columns2 size={18} aria-hidden /> Antes e depois lado a lado, com data
          </li>
          <li>
            <Megaphone size={18} aria-hidden /> Usar as fotos no site e nas campanhas com um clique
          </li>
          <li>
            <ChartColumnIncreasing size={18} aria-hidden /> Acompanhar a evolução dos tratamentos
          </li>
          <li>
            <Sparkles size={18} aria-hidden /> Ajuda da inteligência artificial para organizar
          </li>
        </ul>
      </SettingsCard>
    </div>
  )
}

function FolderList({
  api,
  folders,
  trashed,
  current,
  canManage,
  onSelect,
  onChanged,
}: {
  api: ClinicApi
  folders: FolderInfo[]
  trashed: number
  current: string
  canManage: boolean
  onSelect: (id: string) => void
  onChanged: () => void
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    setError('')
    try {
      const result = await api.post<{ id: string }>('library/folders', { name: name.trim() })
      setName('')
      setCreating(false)
      onChanged()
      onSelect(result.id)
    } catch (cause) {
      setError(
        cause instanceof ClinicApiError && cause.status === 409
          ? 'Já existe uma pasta com esse nome.'
          : 'Não foi possível criar a pasta.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <nav className="media-folders manager-panel" aria-label="Pastas">
      <ul>
        {folders.map((folder) => {
          const Icon = folderIcons[folder.systemKey ?? ''] ?? Folder
          return (
            <li key={folder.id}>
              <button
                type="button"
                aria-current={current === folder.id ? 'true' : undefined}
                onClick={() => onSelect(folder.id)}
              >
                <Icon size={18} aria-hidden />
                <span>{folder.name}</span>
                <small>{folder.count}</small>
              </button>
            </li>
          )
        })}
        <li className="media-folder-trash">
          <button
            type="button"
            aria-current={current === TRASH ? 'true' : undefined}
            onClick={() => onSelect(TRASH)}
          >
            <Trash2 size={18} aria-hidden />
            <span>Lixeira</span>
            <small>{trashed}</small>
          </button>
        </li>
      </ul>
      {canManage ? (
        creating ? (
          <div className="media-new-folder">
            <input
              autoFocus
              aria-label="Nome da nova pasta"
              placeholder="Ex.: Noivas 2026"
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void create()
                if (event.key === 'Escape') setCreating(false)
              }}
            />
            <div>
              <Button size="sm" onPress={() => void create()} isDisabled={busy || !name.trim()}>
                Criar
              </Button>
              <Button size="sm" variant="ghost" onPress={() => setCreating(false)}>
                Cancelar
              </Button>
            </div>
            {error ? (
              <small className="settings-field-error" role="alert">
                {error}
              </small>
            ) : null}
          </div>
        ) : (
          <Button variant="secondary" size="sm" onPress={() => setCreating(true)}>
            <FolderPlus size={15} aria-hidden /> Nova pasta
          </Button>
        )
      ) : null}
    </nav>
  )
}

function FolderView({
  api,
  folder,
  folders,
  canManage,
  storageReady,
  onChanged,
}: {
  api: ClinicApi
  folder: FolderInfo | null
  folders: FolderInfo[]
  canManage: boolean
  storageReady: boolean
  onChanged: () => void
}) {
  const trash = folder === null
  const items = useClinicResource<{ items: Item[] }>(
    api,
    folder ? `library/items?folder=${folder.id}` : 'library/items?trash=1',
  )
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [open, setOpen] = useState<Item | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const canUpload = canManage && storageReady && !trash
  const { reload } = items

  // Signed links expire after 15 minutes; refresh them while the page stays open.
  useEffect(() => {
    const timer = setInterval(reload, 12 * 60_000)
    return () => clearInterval(timer)
  }, [reload])

  async function upload(files: File[]) {
    if (!folder || !files.length) return
    const images = files.filter((file) => /^image\/(png|jpeg|webp)$/.test(file.type)).slice(0, 30)
    if (!images.length) {
      setNotice({ kind: 'error', text: 'Use fotos em PNG, JPG ou WebP.' })
      return
    }
    setNotice(null)
    setUploading({ done: 0, total: images.length })
    let failed = 0
    for (const [index, file] of images.entries()) {
      try {
        const asset = await api.upload('library_photo', file, folder.id)
        await api.post('library/items', {
          folderId: folder.id,
          assetId: asset.id,
          title: file.name.replace(/\.[^.]+$/, '').slice(0, 120),
        })
      } catch {
        failed += 1
      }
      setUploading({ done: index + 1, total: images.length })
    }
    setUploading(null)
    setNotice(
      failed
        ? {
            kind: 'error',
            text: `${images.length - failed} enviadas, ${failed} com problema. Tente essas de novo.`,
          }
        : {
            kind: 'ok',
            text: `${images.length} ${images.length === 1 ? 'foto guardada' : 'fotos guardadas'}!`,
          },
    )
    reload()
    onChanged()
  }

  async function change(item: Item, body: Record<string, string>, message: string) {
    try {
      await api.put(`library/items/${item.id}`, body)
      setNotice({ kind: 'ok', text: message })
      setOpen(null)
      reload()
      onChanged()
    } catch {
      setNotice({ kind: 'error', text: 'Não foi possível alterar. Tente de novo.' })
    }
  }

  function drop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (canUpload) void upload(Array.from(event.dataTransfer.files))
  }

  const list = items.data?.items ?? []
  return (
    <section
      className={`media-folder manager-panel${dragging ? ' is-dragging' : ''}`}
      aria-label={folder?.name ?? 'Lixeira'}
      onDragOver={(event) => {
        if (!canUpload) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
    >
      <header className="media-folder-head">
        <div>
          {renaming !== null && folder ? (
            <RenameFolder
              api={api}
              folder={folder}
              onDone={(changed) => {
                setRenaming(null)
                if (changed) onChanged()
              }}
            />
          ) : (
            <h3>
              {folder?.name ?? 'Lixeira'}
              {folder && !folder.systemKey && canManage ? (
                <Button
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  aria-label="Renomear pasta"
                  onPress={() => setRenaming(folder.name)}
                >
                  <Pencil size={14} />
                </Button>
              ) : null}
            </h3>
          )}
          <p>
            {folder
              ? (folderHints[folder.systemKey ?? ''] ?? 'Pasta criada por você.')
              : 'Fotos tiradas das pastas. Você pode devolver qualquer uma.'}
          </p>
        </div>
        {canUpload ? (
          <Button onPress={() => input.current?.click()} isDisabled={uploading !== null}>
            <Upload size={16} aria-hidden /> Enviar fotos
          </Button>
        ) : !trash && canManage ? (
          <span className="media-locked">
            <LockKeyhole size={14} aria-hidden /> Envio liberado em breve
          </span>
        ) : null}
        <input
          ref={input}
          hidden
          multiple
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            void upload(files)
          }}
        />
      </header>

      {uploading ? (
        <div className="media-progress" role="status">
          <Spinner size="sm" aria-hidden /> Guardando {uploading.done} de {uploading.total}…
          <span style={{ width: `${(uploading.done / uploading.total) * 100}%` }} />
        </div>
      ) : null}
      {notice ? (
        <p className={`access-notice is-${notice.kind}`} role="status">
          {notice.text}
        </p>
      ) : null}

      {items.error && !items.data ? (
        <LoadError message={items.error} onRetry={items.reload} />
      ) : !items.data ? (
        <div className="media-grid" aria-label="Carregando fotos">
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index} className="media-thumb is-loading" />
          ))}
        </div>
      ) : list.length ? (
        <ul className="media-grid">
          {list.map((item) => (
            <li key={item.id}>
              <button type="button" className="media-thumb" onClick={() => setOpen(item)}>
                {item.thumbUrl ? (
                  // Signed, expiring URLs: plain <img> avoids caching them in the image optimizer.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbUrl} alt={item.title || 'Foto do acervo'} loading="lazy" />
                ) : (
                  <Images size={22} aria-hidden />
                )}
                {item.title ? <span>{item.title}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="media-empty">
          {trash ? (
            <Empty>A lixeira está vazia.</Empty>
          ) : (
            <>
              <span aria-hidden>
                <ImagePlus size={30} />
              </span>
              <strong>Nenhuma foto aqui ainda</strong>
              <p>
                {canUpload
                  ? 'Arraste fotos para cá ou toque em “Enviar fotos”. Pode mandar várias de uma vez.'
                  : 'Quando o envio estiver liberado, as fotos desta pasta aparecem aqui.'}
              </p>
            </>
          )}
        </div>
      )}

      {open ? (
        <Viewer
          item={open}
          folders={folders}
          trash={trash}
          canManage={canManage}
          onClose={() => setOpen(null)}
          onChange={(body, message) => void change(open, body, message)}
        />
      ) : null}
    </section>
  )
}

function RenameFolder({
  api,
  folder,
  onDone,
}: {
  api: ClinicApi
  folder: FolderInfo
  onDone: (changed: boolean) => void
}) {
  const [name, setName] = useState(folder.name)
  const [error, setError] = useState('')
  async function save() {
    if (!name.trim() || name.trim() === folder.name) return onDone(false)
    try {
      await api.put(`library/folders/${folder.id}`, { name: name.trim() })
      onDone(true)
    } catch {
      setError('Não foi possível renomear. Talvez já exista uma pasta com esse nome.')
    }
  }
  return (
    <div className="media-new-folder is-inline">
      <input
        autoFocus
        aria-label="Novo nome da pasta"
        value={name}
        maxLength={60}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void save()
          if (event.key === 'Escape') onDone(false)
        }}
      />
      <Button size="sm" onPress={() => void save()}>
        Salvar
      </Button>
      <Button size="sm" variant="ghost" onPress={() => onDone(false)}>
        Cancelar
      </Button>
      {error ? <small className="settings-field-error">{error}</small> : null}
    </div>
  )
}

function Viewer({
  item,
  folders,
  trash,
  canManage,
  onClose,
  onChange,
}: {
  item: Item
  folders: FolderInfo[]
  trash: boolean
  canManage: boolean
  onClose: () => void
  onChange: (body: Record<string, string>, message: string) => void
}) {
  const [title, setTitle] = useState(item.title)
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])
  return (
    <div className="media-viewer" role="dialog" aria-modal="true" aria-label="Foto ampliada">
      <button
        type="button"
        className="media-viewer-backdrop"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div className="media-viewer-card">
        <Button
          className="media-viewer-close"
          isIconOnly
          variant="ghost"
          aria-label="Fechar"
          onPress={onClose}
        >
          <X size={18} />
        </Button>
        {item.fullUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.fullUrl} alt={item.title || 'Foto do acervo'} />
        ) : (
          <div className="media-viewer-missing">
            <Images size={28} aria-hidden />
          </div>
        )}
        <div className="media-viewer-side">
          <small>
            Guardada em {new Date(item.createdAt).toLocaleDateString('pt-BR')} ·{' '}
            {formatBytes(item.bytes)}
          </small>
          {canManage && !trash ? (
            <>
              <label className="settings-field">
                <span className="settings-field-label">Nome da foto</span>
                <span className="settings-input">
                  <input
                    value={title}
                    maxLength={120}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </span>
              </label>
              {title !== item.title ? (
                <Button size="sm" onPress={() => onChange({ title }, 'Nome atualizado.')}>
                  Salvar nome
                </Button>
              ) : null}
              <label className="settings-field">
                <span className="settings-field-label">
                  Mover para
                  <HelpTip title="Mover muda o quê?">
                    Só a pasta onde a foto aparece. A foto continua a mesma, sem ocupar mais espaço.
                  </HelpTip>
                </span>
                <span className="settings-input">
                  <select
                    value={item.folderId}
                    onChange={(event) =>
                      onChange({ folderId: event.target.value }, 'Foto movida de pasta.')
                    }
                  >
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <Button
                variant="ghost"
                onPress={() => onChange({ status: 'trashed' }, 'Foto enviada para a lixeira.')}
              >
                <Trash2 size={15} aria-hidden /> Mandar para a lixeira
              </Button>
            </>
          ) : trash && canManage ? (
            <Button onPress={() => onChange({ status: 'active' }, 'Foto devolvida à pasta.')}>
              <RotateCcw size={15} aria-hidden /> Devolver à pasta
            </Button>
          ) : (
            <strong>{item.title || 'Foto do acervo'}</strong>
          )}
          {item.fullUrl ? (
            <a
              className="media-download"
              href={item.fullUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir em tamanho grande
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}
