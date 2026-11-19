'use client'

import { Button, Spinner } from '@heroui/react'
import {
  Building2,
  Columns2,
  Folder,
  FolderPlus,
  HardDrive,
  ImagePlus,
  Images,
  Inbox,
  LockKeyhole,
  Megaphone,
  Pencil,
  Search,
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
import { SelectField, TextInputField } from '@/components/ui/fields'
import './media.css'

type FolderInfo = {
  id: string
  name: string
  systemKey: string | null
  count: number
  /** Client albums live inside "Clientes". */
  parentId?: string | null
  clientId?: string | null
}
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
  linkedFolderIds?: string[]
}

const TRASH = 'trash'
const folderIcons: Record<string, typeof Folder> = {
  inbox: Inbox,
  clients: UserRound,
  before_after: Columns2,
  marketing: Megaphone,
  space: Building2,
  team: UsersRound,
}
const folderHints: Record<string, string> = {
  inbox:
    'Fotos soltas: o salão, o dia a dia, o que você ainda não separou. Abra uma foto para mover ou fazer ela aparecer também em outras pastas.',
  clients:
    'Cada cliente tem o próprio álbum aqui dentro. Ele é criado sozinho quando você guarda fotos ao concluir um atendimento.',
  before_after: 'Registros de antes e depois para acompanhar resultados.',
  marketing: 'Fotos para posts, campanhas e o site.',
  space: 'Fachada, recepção, salas e ambiente.',
  team: 'Fotos da equipe trabalhando e de eventos.',
}

/** Uploads photos into one folder, one by one; returns a short summary. */
async function uploadPhotos(
  api: ClinicApi,
  files: File[],
  folderId: string,
  progress: (state: { done: number; total: number }) => void,
) {
  const images = files.filter((file) => /^image\/(png|jpeg|webp)$/.test(file.type)).slice(0, 30)
  if (!images.length) return 'Use fotos em PNG, JPG ou WebP.'
  let failed = 0
  progress({ done: 0, total: images.length })
  for (const [index, file] of images.entries()) {
    try {
      const asset = await api.upload('library_photo', file, folderId)
      await api.post('library/items', {
        folderId,
        assetId: asset.id,
        title: file.name.replace(/\.[^.]+$/, '').slice(0, 120),
      })
    } catch {
      failed += 1
    }
    progress({ done: index + 1, total: images.length })
  }
  return failed
    ? `${images.length - failed} enviadas, ${failed} com problema. Tente essas de novo.`
    : `${images.length} ${images.length === 1 ? 'foto guardada' : 'fotos guardadas'}!`
}

/** "Clientes › Ana" for a client album, the name for the others. */
function folderLabel(folder: FolderInfo, folders: FolderInfo[]) {
  const parent = folder.parentId ? folders.find((entry) => entry.id === folder.parentId) : null
  return parent ? `${parent.name} › ${folder.name}` : folder.name
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
  const [quick, setQuick] = useState<{ done: number; total: number } | null>(null)
  const [quickNotice, setQuickNotice] = useState('')
  const [round, setRound] = useState(0)
  const quickInput = useRef<HTMLInputElement>(null)

  if (library.error && !library.data)
    return <LoadError message={library.error} onRetry={library.reload} />
  if (!library.data) return <SettingsSkeleton cards={2} />
  const data = library.data
  const current = selected ?? data.folders[0]?.id ?? TRASH
  const total = data.usage.libraryBytes + data.usage.otherBytes
  const inbox = data.folders.find((folder) => folder.systemKey === 'inbox')

  /** Loose photos, without choosing a folder first: they wait in "Para organizar". */
  async function sendLoose(files: File[]) {
    if (!inbox) return
    setQuickNotice('')
    const result = await uploadPhotos(api, files, inbox.id, setQuick)
    setQuick(null)
    setQuickNotice(result)
    setSelected(inbox.id)
    setRound((value) => value + 1)
    library.reload()
  }

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
          {data.canManage && data.storageReady && inbox ? (
            <Button
              className="media-quick"
              isDisabled={quick !== null}
              onPress={() => quickInput.current?.click()}
            >
              <Upload size={16} aria-hidden />{' '}
              {quick ? `Enviando ${quick.done} de ${quick.total}…` : 'Enviar fotos'}
            </Button>
          ) : (
            <span className="media-usage-note">Limites por plano em breve</span>
          )}
          <input
            ref={quickInput}
            hidden
            multiple
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? [])
              event.target.value = ''
              void sendLoose(files)
            }}
          />
        </div>
        {quickNotice ? (
          <p className="media-banner" role="status">
            <Inbox size={16} aria-hidden /> {quickNotice} Elas estão em “Para organizar”.
          </p>
        ) : null}
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
          key={`${current}-${round}`}
          api={api}
          folder={data.folders.find((folder) => folder.id === current) ?? null}
          folders={data.folders}
          canManage={data.canManage}
          storageReady={data.storageReady}
          onChanged={library.reload}
        />
      </div>
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
  const [query, setQuery] = useState('')
  const top = folders.filter((folder) => !folder.parentId)
  const childrenOf = (id: string) => folders.filter((folder) => folder.parentId === id)
  const inside = folders.find((folder) => folder.id === current)?.parentId ?? null
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
        {top.map((folder) => {
          const Icon = folderIcons[folder.systemKey ?? ''] ?? Folder
          const children = childrenOf(folder.id)
          const open = children.length > 0 && (current === folder.id || inside === folder.id)
          const needle = query.trim().toLocaleLowerCase('pt-BR')
          const shown = children.filter(
            (child) => !needle || child.name.toLocaleLowerCase('pt-BR').includes(needle),
          )
          const sum = folder.count + children.reduce((total, child) => total + child.count, 0)
          return (
            <li key={folder.id}>
              <button
                type="button"
                aria-current={current === folder.id ? 'true' : undefined}
                aria-expanded={children.length ? open : undefined}
                onClick={() => onSelect(folder.id)}
              >
                <Icon size={18} aria-hidden />
                <span>{folder.name}</span>
                <small>{children.length ? `${children.length} · ${sum}` : folder.count}</small>
              </button>
              {open ? (
                <div className="media-subfolders">
                  {children.length > 6 ? (
                    <label className="media-subsearch">
                      <Search size={14} aria-hidden />
                      <input
                        placeholder="Buscar cliente"
                        aria-label="Buscar álbum de cliente"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </label>
                  ) : null}
                  <ul>
                    {shown.map((child) => (
                      <li key={child.id}>
                        <button
                          type="button"
                          aria-current={current === child.id ? 'true' : undefined}
                          onClick={() => onSelect(child.id)}
                        >
                          <span>{child.name}</span>
                          <small>{child.count}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
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
            <TextInputField
              autoFocus
              ariaLabel="Nome da nova pasta"
              placeholder="Ex.: Noivas 2026"
              value={name}
              maxLength={60}
              onChange={setName}
              onEnter={() => void create()}
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
    setNotice(null)
    const text = await uploadPhotos(api, files, folder.id, setUploading)
    setUploading(null)
    setNotice({ kind: text.includes('problema') || text.startsWith('Use') ? 'error' : 'ok', text })
    reload()
    onChanged()
  }

  async function link(item: Item, folderIds: string[]) {
    try {
      await api.put(`library/items/${item.id}/links`, { folderIds })
      setNotice({ kind: 'ok', text: 'Pastas da foto atualizadas.' })
      setOpen({ ...item, linkedFolderIds: folderIds })
      reload()
      onChanged()
    } catch {
      setNotice({ kind: 'error', text: 'Não foi possível alterar as pastas. Tente de novo.' })
    }
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
          onLink={(folderIds) => void link(open, folderIds)}
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
      <TextInputField
        autoFocus
        ariaLabel="Novo nome da pasta"
        value={name}
        maxLength={60}
        onChange={setName}
        onEnter={() => void save()}
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
  onLink,
}: {
  item: Item
  folders: FolderInfo[]
  trash: boolean
  canManage: boolean
  onClose: () => void
  onChange: (body: Record<string, string>, message: string) => void
  onLink: (folderIds: string[]) => void
}) {
  const linked = item.linkedFolderIds ?? []
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
              <TextInputField
                label="Nome da foto"
                value={title}
                maxLength={120}
                onChange={setTitle}
              />
              {title !== item.title ? (
                <Button size="sm" onPress={() => onChange({ title }, 'Nome atualizado.')}>
                  Salvar nome
                </Button>
              ) : null}
              <SelectField
                label="Mover para"
                help={
                  <HelpTip title="Mover muda o quê?">
                    Só a pasta onde a foto aparece. A foto continua a mesma, sem ocupar mais espaço.
                  </HelpTip>
                }
                value={item.folderId}
                options={folders.map((folder) => ({
                  id: folder.id,
                  label: folderLabel(folder, folders),
                }))}
                onChange={(folderId) => onChange({ folderId }, 'Foto movida de pasta.')}
              />
              <div className="media-links">
                <span>Também aparece em</span>
                <div className="biz-chips" role="group" aria-label="Também aparece em">
                  {folders
                    .filter((folder) => folder.id !== item.folderId && !folder.parentId)
                    .map((folder) => {
                      const on = linked.includes(folder.id)
                      return (
                        <button
                          key={folder.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            onLink(
                              on ? linked.filter((id) => id !== folder.id) : [...linked, folder.id],
                            )
                          }
                        >
                          {on ? '✓ ' : '+ '}
                          {folder.name}
                        </button>
                      )
                    })}
                </div>
                <small>A mesma foto, sem ocupar mais espaço.</small>
              </div>
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
