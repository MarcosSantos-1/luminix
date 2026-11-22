'use client'

import { Button } from '@heroui/react'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Lightbulb,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  DateInputField,
  TextAreaField,
  TextInputField,
  TimeInputField,
} from '@/components/ui/fields'
import { QuickModal } from '../quick-modal'
import { useClinicResource, type ClinicApi } from '../settings/clinic-api'
import { SettingsCard } from '../settings/settings-kit'

export type Post = {
  id: string
  title: string
  caption: string
  scheduledOn: string | null
  scheduledTime: string | null
  channels: string[]
  format: string
  status: string
  mediaItemId: string | null
  mediaUrl?: string | null
}

const channels = [
  { id: 'instagram', label: 'Instagram', emoji: '📸' },
  { id: 'facebook', label: 'Facebook', emoji: '👍' },
  { id: 'whatsapp', label: 'WhatsApp', emoji: '💬' },
  { id: 'tiktok', label: 'TikTok', emoji: '🎵' },
  { id: 'google', label: 'Google', emoji: '📍' },
]
const formats = [
  { id: 'post', label: 'Post', emoji: '🖼️' },
  { id: 'carousel', label: 'Carrossel', emoji: '🗂️' },
  { id: 'reels', label: 'Reels / vídeo', emoji: '🎬' },
  { id: 'stories', label: 'Stories', emoji: '⏱️' },
  { id: 'status', label: 'Status do WhatsApp', emoji: '🟢' },
]
const statuses = [
  { id: 'idea', label: 'Ideia', emoji: '💡' },
  { id: 'planned', label: 'Agendado', emoji: '🗓️' },
  { id: 'published', label: 'Publicado', emoji: '✅' },
]
const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    new Date(`${month}-01T12:00:00`),
  )
const shiftMonth = (month: string, delta: number) => {
  const [year, value] = month.split('-').map(Number)
  const date = new Date(year, value - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
const formatOf = (id: string) => formats.find((item) => item.id === id) ?? formats[0]

/** Second Sunday of May, 4th Friday of November… */
function nthWeekday(year: number, month: number, weekday: number, nth: number) {
  const first = new Date(year, month, 1)
  const offset = (weekday - first.getDay() + 7) % 7
  return new Date(year, month, 1 + offset + (nth - 1) * 7)
}

type Idea = { date?: string; title: string; emoji: string; caption: string }

/** Dates that sell for beauty spaces, in the next 75 days. */
function upcomingDates(today: string, clinic: string, service: string): Idea[] {
  const now = new Date(`${today}T12:00:00`)
  const list: Idea[] = []
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    const fixed: [number, number, string, string, string][] = [
      [
        0,
        1,
        'Ano novo, cuidado novo',
        '🎆',
        `Ano novo pede autocuidado! ✨ Comece ${year} se cuidando no ${clinic}. Agende pelo link da bio 💖`,
      ],
      [
        2,
        8,
        'Dia da Mulher',
        '💐',
        `Feliz Dia da Mulher! 💐 Hoje e sempre, você merece um momento só seu. Venha para o ${clinic} 💖`,
      ],
      [
        5,
        12,
        'Dia dos Namorados',
        '💘',
        `Dia dos Namorados chegando 💘 Que tal ficar ainda mais linda (ou dar de presente um ${service})? Agende já!`,
      ],
      [
        8,
        15,
        'Dia do Cliente',
        '🤝',
        `Hoje é Dia do Cliente e a gente só tem a agradecer 🥰 Obrigada por confiar no ${clinic}!`,
      ],
      [
        9,
        1,
        'Outubro Rosa',
        '🎀',
        `Outubro Rosa 🎀 Cuidar de você também é prevenção. Faça seus exames e conte com o ${clinic} para se sentir bem.`,
      ],
      [
        10,
        1,
        'Novembro Azul',
        '💙',
        `Novembro Azul 💙 Homens também se cuidam! Traga quem você ama para o ${clinic}.`,
      ],
      [
        11,
        24,
        'Véspera de Natal',
        '🎄',
        `Natal chegando 🎄 Garanta seu horário e brilhe nas festas! Últimas vagas no ${clinic}.`,
      ],
      [
        11,
        31,
        'Réveillon',
        '🥂',
        `Para virar o ano linda 🥂 Últimos horários de ${year} no ${clinic}. Corre!`,
      ],
    ]
    for (const [month, day, title, emoji, caption] of fixed)
      list.push({ date: iso(new Date(year, month, day)), title, emoji, caption })
    list.push({
      date: iso(nthWeekday(year, 4, 0, 2)),
      title: 'Dia das Mães',
      emoji: '🌷',
      caption: `Dia das Mães 🌷 Presenteie com cuidado: vale-presente de ${service} no ${clinic}. Fale com a gente!`,
    })
    list.push({
      date: iso(nthWeekday(year, 10, 5, 4)),
      title: 'Black Friday',
      emoji: '🖤',
      caption: `BLACK FRIDAY no ${clinic} 🖤 Condições especiais só esta semana. Garanta seu horário pelo link!`,
    })
  }
  const limit = iso(new Date(now.getTime() + 75 * 86_400_000))
  return list
    .filter((item) => item.date! >= today && item.date! <= limit)
    .sort((a, b) => a.date!.localeCompare(b.date!))
}

const quickIdeas = (clinic: string, service: string): Idea[] => [
  {
    title: 'Antes e depois',
    emoji: '✨',
    caption: `O antes e depois que a gente ama ✨ Resultado de ${service} aqui no ${clinic}. Quer o seu? Agende pelo link da bio!`,
  },
  {
    title: 'Bastidores do dia',
    emoji: '🎬',
    caption: `Um pouquinho do nosso dia no ${clinic} 🎬 Cada detalhe pensado para você se sentir em casa 💖`,
  },
  {
    title: 'Dica de cuidado',
    emoji: '💡',
    caption: `Dica rápida 💡 Depois de ${service}, hidrate bem a pele e evite sol forte por 48h. Salve para lembrar!`,
  },
  {
    title: 'Depoimento de cliente',
    emoji: '💬',
    caption: `Nada melhor do que ouvir isso de vocês 🥹💬 Obrigada pela confiança! #${clinic.replace(/\s+/g, '')}`,
  },
  {
    title: 'Conheça a equipe',
    emoji: '👩‍🔬',
    caption: `Prazer, somos o time do ${clinic} 👋 Quem cuida de você com carinho todos os dias.`,
  },
  {
    title: 'Horários da semana',
    emoji: '🗓️',
    caption: `Agenda da semana aberta! 🗓️ Ainda temos horários para ${service}. Chama no WhatsApp ou agende pelo link.`,
  },
  {
    title: 'Pergunta frequente',
    emoji: '❓',
    caption: `Vocês sempre perguntam: ${service} dói? 🤔 Respondemos tudo nos comentários. Manda sua dúvida!`,
  },
]

/**
 * Marketing: a month calendar of posts (where, when, what format, the caption) and a helper with
 * ready ideas and dates that sell. An idea becomes a post in one tap. Prepared for AI-made art
 * and captions later.
 */
export function MarketingStudio({
  api,
  clinicName,
  services,
}: {
  api: ClinicApi
  clinicName: string
  services: string[]
}) {
  const [month, setMonth] = useState(() => iso(new Date()).slice(0, 7))
  const range = useMemo(() => {
    const [year, value] = month.split('-').map(Number)
    return { from: `${month}-01`, to: iso(new Date(year, value, 0)) }
  }, [month])
  const posts = useClinicResource<{ posts: Post[]; canManage: boolean }>(
    api,
    `marketing/posts?from=${range.from}&to=${range.to}`,
  )
  const [editing, setEditing] = useState<Post | null>(null)
  const today = iso(new Date())
  const service = services[0] ?? 'um cuidado especial'
  const canManage = posts.data?.canManage !== false
  const list = posts.data?.posts ?? []
  const dated = list.filter((post) => post.scheduledOn)
  const ideas = list.filter((post) => !post.scheduledOn)
  const days = useMemo(() => {
    const [year, value] = month.split('-').map(Number)
    const first = new Date(year, value - 1, 1)
    const start = new Date(first)
    start.setDate(1 - ((first.getDay() + 6) % 7))
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return date
    })
  }, [month])
  const blank = (patch: Partial<Post> = {}): Post => ({
    id: crypto.randomUUID(),
    title: '',
    caption: '',
    scheduledOn: today,
    scheduledTime: '18:00',
    channels: ['instagram'],
    format: 'post',
    status: 'planned',
    mediaItemId: null,
    ...patch,
  })
  const planned = dated.filter((post) => post.status !== 'published').length
  const published = dated.filter((post) => post.status === 'published').length

  return (
    <>
      <SettingsCard
        icon={<CalendarDays size={20} />}
        title="Calendário de postagens"
        description="Planeje o que postar, onde e quando. Constância é o que faz o perfil crescer."
        badge={
          canManage ? (
            <Button size="sm" onPress={() => setEditing(blank())}>
              <Plus size={15} aria-hidden /> Nova postagem
            </Button>
          ) : null
        }
      >
        <div className="mk-cal-head">
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label="Mês anterior"
            onPress={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft size={18} />
          </Button>
          <strong>{monthLabel(month)}</strong>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label="Próximo mês"
            onPress={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight size={18} />
          </Button>
          <span className="mk-cal-stats">
            <span>🗓️ {planned} planejadas</span>
            <span>✅ {published} publicadas</span>
          </span>
        </div>
        <div className="mk-cal" role="grid" aria-label={`Postagens de ${monthLabel(month)}`}>
          {weekdays.map((label) => (
            <span key={label} className="mk-cal-weekday" aria-hidden>
              {label}
            </span>
          ))}
          {days.map((day) => {
            const date = iso(day)
            const here = dated.filter((post) => post.scheduledOn === date)
            const outside = date.slice(0, 7) !== month
            return (
              <div
                key={date}
                role="gridcell"
                className="mk-day"
                data-outside={outside || undefined}
                data-today={date === today || undefined}
                data-past={date < today || undefined}
              >
                <span className="mk-day-head">
                  <span>{day.getDate()}</span>
                  {canManage && !outside && date >= today ? (
                    <button
                      type="button"
                      className="mk-day-add"
                      aria-label={`Nova postagem em ${day.toLocaleDateString('pt-BR')}`}
                      onClick={() => setEditing(blank({ scheduledOn: date }))}
                    >
                      <Plus size={13} />
                    </button>
                  ) : null}
                </span>
                {here.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    className={`mk-chip is-${post.status}`}
                    title={post.title}
                    onClick={() => setEditing(post)}
                  >
                    <span aria-hidden>{formatOf(post.format).emoji}</span>
                    <span>{post.title}</span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
        {ideas.length ? (
          <div className="mk-ideas-bank">
            <span>💡 Ideias guardadas (sem data)</span>
            <div className="biz-chips">
              {ideas.map((post) => (
                <button key={post.id} type="button" onClick={() => setEditing(post)}>
                  {formatOf(post.format).emoji} {post.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </SettingsCard>

      <SettingsCard
        icon={<Lightbulb size={20} />}
        title="Ideias para postar"
        description="Sem inspiração? Escolha uma ideia: a legenda já vem pronta, é só ajustar e agendar."
      >
        <div className="mk-help">
          <section>
            <h4>📅 Datas que vendem</h4>
            <ul className="mk-idea-list">
              {upcomingDates(today, clinicName, service).map((idea) => (
                <li key={`${idea.date}-${idea.title}`}>
                  <span className="mk-idea-emoji" aria-hidden>
                    {idea.emoji}
                  </span>
                  <span className="mk-idea-copy">
                    <strong>{idea.title}</strong>
                    <small>
                      {new Date(`${idea.date}T12:00:00`).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'long',
                      })}{' '}
                      · poste uns dias antes
                    </small>
                  </span>
                  {canManage ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={() =>
                        setEditing(
                          blank({
                            title: idea.title,
                            caption: idea.caption,
                            scheduledOn: (() => {
                              const before = new Date(`${idea.date}T12:00:00`)
                              before.setDate(before.getDate() - 3)
                              const value = iso(before)
                              return value < today ? today : value
                            })(),
                          }),
                        )
                      }
                    >
                      Usar
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h4>⚡ Ideias rápidas</h4>
            <div className="mk-quick">
              {quickIdeas(clinicName, service).map((idea) => (
                <button
                  key={idea.title}
                  type="button"
                  disabled={!canManage}
                  onClick={() =>
                    setEditing(
                      blank({
                        title: idea.title,
                        caption: idea.caption,
                        status: 'idea',
                        scheduledOn: null,
                      }),
                    )
                  }
                >
                  <span aria-hidden>{idea.emoji}</span>
                  <strong>{idea.title}</strong>
                </button>
              ))}
            </div>
            <div className="mk-ai">
              <Sparkles size={18} aria-hidden />
              <span>
                <strong>Em breve: artes e legendas com IA</strong>
                <small>
                  Montagens com as fotos do seu acervo e planos de postagem prontos para o mês.
                </small>
              </span>
            </div>
          </section>
        </div>
      </SettingsCard>

      {editing ? (
        <PostEditor
          key={editing.id}
          api={api}
          initial={editing}
          isNew={!list.some((post) => post.id === editing.id)}
          canManage={canManage}
          onClose={(changed) => {
            setEditing(null)
            if (changed) posts.reload()
          }}
        />
      ) : null}
    </>
  )
}

function PostEditor({
  api,
  initial,
  isNew,
  canManage,
  onClose,
}: {
  api: ClinicApi
  initial: Post
  isNew: boolean
  canManage: boolean
  onClose: (changed?: boolean) => void
}) {
  const [post, setPost] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const set = (patch: Partial<Post>) => setPost((current) => ({ ...current, ...patch }))

  async function save() {
    if (!post.title.trim()) return setError('Dê um nome para a postagem.')
    setSaving(true)
    setError('')
    try {
      await api.put(`marketing/posts/${post.id}`, {
        title: post.title.trim(),
        caption: post.caption,
        scheduledOn: post.scheduledOn || null,
        scheduledTime: post.scheduledOn && post.scheduledTime ? post.scheduledTime : null,
        channels: post.channels,
        format: post.format,
        status: post.scheduledOn ? post.status : 'idea',
        mediaItemId: post.mediaItemId,
      })
      onClose(true)
    } catch {
      setError('Não foi possível salvar. Tente de novo.')
      setSaving(false)
    }
  }

  async function remove() {
    setSaving(true)
    try {
      await api.post(`marketing/posts/${post.id}/remove`, {})
      onClose(true)
    } catch {
      setError('Não foi possível remover.')
      setSaving(false)
    }
  }

  return (
    <QuickModal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      className="mk-editor"
      title={isNew ? '📝 Nova postagem' : `📝 ${initial.title}`}
      footer={
        canManage ? (
          <>
            {!isNew ? (
              <Button
                variant="ghost"
                className="qm-foot-start"
                isDisabled={saving}
                onPress={() => void remove()}
              >
                <Trash2 size={15} aria-hidden /> Remover
              </Button>
            ) : null}
            <Button variant="secondary" onPress={() => onClose()}>
              Cancelar
            </Button>
            <Button isDisabled={saving} onPress={() => void save()}>
              <Check size={16} aria-hidden /> {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onPress={() => onClose()}>
            Fechar
          </Button>
        )
      }
    >
      <div className="mk-form">
        <TextInputField
          label="Sobre o que é"
          maxLength={120}
          placeholder="Ex.: Antes e depois da limpeza de pele"
          value={post.title}
          onChange={(title) => set({ title })}
        />
        <span className="mk-label">Onde vai postar</span>
        <div className="mk-pills" role="group" aria-label="Onde">
          {channels.map((item) => {
            const on = post.channels.includes(item.id)
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  set({
                    channels: on
                      ? post.channels.filter((id) => id !== item.id)
                      : [...post.channels, item.id],
                  })
                }
              >
                <span aria-hidden>{item.emoji}</span> {item.label}
              </button>
            )
          })}
        </div>
        <span className="mk-label">Formato</span>
        <div className="mk-pills" role="radiogroup" aria-label="Formato">
          {formats.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={post.format === item.id}
              onClick={() => set({ format: item.id })}
            >
              <span aria-hidden>{item.emoji}</span> {item.label}
            </button>
          ))}
        </div>
        <div className="mk-when">
          <DateInputField
            label="Data"
            min={iso(new Date())}
            value={post.scheduledOn ?? ''}
            onChange={(scheduledOn) =>
              set({
                scheduledOn: scheduledOn || null,
                status: scheduledOn && post.status === 'idea' ? 'planned' : post.status,
              })
            }
          />
          {post.scheduledOn ? (
            <TimeInputField
              label="Horário"
              value={post.scheduledTime ?? '18:00'}
              onChange={(scheduledTime) => set({ scheduledTime })}
            />
          ) : null}
          {post.scheduledOn ? (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => set({ scheduledOn: null, status: 'idea' })}
            >
              Guardar sem data
            </Button>
          ) : null}
        </div>
        {post.scheduledOn ? (
          <div className="mk-pills" role="radiogroup" aria-label="Situação">
            {statuses
              .filter((item) => item.id !== 'idea')
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={post.status === item.id}
                  onClick={() => set({ status: item.id })}
                >
                  <span aria-hidden>{item.emoji}</span> {item.label}
                </button>
              ))}
          </div>
        ) : null}
        <TextAreaField
          label="Legenda"
          rows={6}
          maxLength={2200}
          placeholder="Escreva a legenda. Emojis e hashtags ajudam a chamar atenção ✨"
          value={post.caption}
          onChange={(caption) => set({ caption })}
        />
        <div className="mk-caption-tools">
          <Button
            size="sm"
            variant="secondary"
            isDisabled={!post.caption.trim()}
            onPress={() =>
              void navigator.clipboard?.writeText(post.caption).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              })
            }
          >
            {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}{' '}
            {copied ? 'Copiada!' : 'Copiar legenda'}
          </Button>
          {post.caption.trim() ? (
            <a
              className="biz-whatsapp"
              href={`https://wa.me/?text=${encodeURIComponent(post.caption)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Send size={14} aria-hidden /> Enviar no WhatsApp
            </a>
          ) : null}
          <small>{post.caption.length}/2200</small>
        </div>
        {error ? (
          <p className="apt-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </QuickModal>
  )
}
