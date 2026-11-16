import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { recordState, type Answers, type Level } from '@luminix/contracts/anamnesis'
import { useStore } from '../src/store'
import { AnamnesisWizard, type WizardMode } from '../src/ui/anamnesis-wizard'
import { Preparing } from '../src/ui/preparing'

/**
 * Every record situation in one screen (same rules as the site):
 * no record yet → basic record; shared space needing more → only missing steps; space with its
 * own record → that record; past its yearly validity → prefilled, to confirm.
 * `?espaco=<slug>` picks the space; `&entrar=1` ends with the welcome animation.
 */
export default function AnamnesisScreen() {
  const { espaco, entrar } = useLocalSearchParams<{ espaco?: string; entrar?: string }>()
  const { account } = useStore()
  const space = espaco
    ? (account?.spaces.find((item) => item.summary.slug === espaco) ?? null)
    : null
  const own = Boolean(space && !space.shareAnamnesis)
  const initial = own ? space!.ownAnamnesis : (account?.anamnesis ?? null)
  const level = (
    own ? space!.requiredLevel : Math.max(account?.anamnesis?.level ?? 1, space?.requiredLevel ?? 1)
  ) as Level
  const state = recordState(initial, level)
  const mode: WizardMode = !initial
    ? 'new'
    : state === 'incomplete'
      ? 'upgrade'
      : state === 'expired'
        ? 'renew'
        : 'edit'
  return (
    <Form
      key={espaco ?? 'conta'}
      mode={mode}
      level={level}
      own={own}
      slug={space?.summary.slug ?? null}
      entering={entrar === '1'}
      alreadyOk={state === 'ok'}
    />
  )
}

function Form(props: {
  mode: WizardMode
  level: Level
  own: boolean
  slug: string | null
  entering: boolean
  alreadyOk: boolean
}) {
  // Saving refreshes the account and would change the situation; keep the one it opened with.
  const [{ mode, level, own, slug, entering, alreadyOk }] = useState(props)
  const router = useRouter()
  const { account, saveAnamnesis, enterSpace } = useStore()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(entering && alreadyOk)
  const space = slug ? (account?.spaces.find((item) => item.summary.slug === slug) ?? null) : null
  const initial = own ? (space?.ownAnamnesis ?? null) : (account?.anamnesis ?? null)

  async function save(record: { level: Level; answers: Answers; photo: string }) {
    setSaving(true)
    const failure = await saveAnamnesis(own ? slug : null, record)
    setSaving(false)
    if (failure) return setError(failure)
    if (entering && space) return setDone(true)
    if (!slug && mode === 'new') return router.replace('/')
    if (router.canGoBack()) return router.back()
    router.replace('/')
  }

  if (done && space)
    return (
      <Preparing
        space={space.summary}
        onDone={() => {
          enterSpace(space.summary.slug)
          router.dismissAll()
          router.replace('/(tabs)')
        }}
      />
    )

  return (
    <AnamnesisWizard
      mode={mode}
      level={level}
      initial={initial}
      space={space?.summary ?? null}
      saving={saving}
      error={error}
      onSave={(record) => void save(record)}
      onClose={mode === 'edit' && router.canGoBack() ? () => router.back() : undefined}
    />
  )
}
