'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { recordState, type Answers, type Level } from '@luminix/contracts/anamnesis'
import { saveAnamnesis, useClient } from '../../../lib/client-app/store'
import { Splash } from '../../../components/client-app/shell'
import { Preparing } from '../../../components/client-app/ui'
import { AnamnesisWizard, type WizardMode } from '../../../components/client-app/anamnesis-wizard'

/**
 * One page for every record situation:
 * - no account record yet (right after sign-up): basic record, level I;
 * - a space that reuses the account record and needs a higher level: only the missing steps;
 * - a space with its own record (client did not share): that record, from scratch;
 * - a record past its yearly validity: everything prefilled, to confirm.
 * `?espaco=<slug>` picks the space; `&entrar=1` shows the welcome animation at the end.
 */
export default function AnamnesisPage() {
  const router = useRouter()
  const { ready, account } = useClient()
  const [params, setParams] = useState<{ slug: string | null; entering: boolean } | null>(null)
  const goHome = useCallback(() => router.replace('/cliente'), [router])

  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL after hydration
    setParams({ slug: search.get('espaco'), entering: search.get('entrar') === '1' })
  }, [])
  useEffect(() => {
    if (ready && !account) router.replace('/cliente/entrar')
  }, [ready, account, router])

  if (!ready || !account || !params) return <Splash />
  const space = params.slug ? (account.spaces[params.slug] ?? null) : null
  const own = Boolean(space && !space.shareAnamnesis)
  const initial = own ? space!.anamnesis : account.anamnesis
  const level = (
    own ? space!.requiredLevel : Math.max(account.anamnesis?.level ?? 1, space?.requiredLevel ?? 1)
  ) as Level
  const state = recordState(initial, level)
  // Entering a space whose record is already enough: nothing to ask, straight in.
  if (params.entering && space && state === 'ok')
    return <Preparing space={space.summary} onDone={goHome} />
  const mode: WizardMode = !initial
    ? 'new'
    : state === 'incomplete'
      ? 'upgrade'
      : state === 'expired'
        ? 'renew'
        : 'edit'

  return (
    <Form
      key={params.slug ?? 'conta'}
      mode={mode}
      level={level}
      own={own}
      slug={space?.summary.slug ?? null}
      entering={params.entering}
    />
  )
}

function Form(props: {
  mode: WizardMode
  level: Level
  own: boolean
  slug: string | null
  entering: boolean
}) {
  // Saving refreshes the account and would change the situation; the form keeps the one it opened.
  const [{ mode, level, own, slug, entering }] = useState(props)
  const router = useRouter()
  const { account } = useClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const goHome = useCallback(() => router.replace('/cliente'), [router])
  const space = slug && account ? (account.spaces[slug] ?? null) : null
  const initial = own ? (space?.anamnesis ?? null) : (account?.anamnesis ?? null)

  async function save(record: { level: Level; answers: Answers; photo: string }) {
    setSaving(true)
    const failure = await saveAnamnesis(own ? slug : null, record)
    setSaving(false)
    if (failure) return setError(failure)
    if (entering && space) return setDone(true)
    // First record of a new account: next comes choosing the space.
    if (!slug && mode === 'new') return router.replace('/cliente/espacos')
    router.replace(mode === 'edit' ? '/cliente/perfil' : '/cliente')
  }

  if (done && space) return <Preparing space={space.summary} onDone={goHome} />

  return (
    <div className="ca ca-flow" data-theme={space?.summary.theme ?? 'luminix'}>
      <div className="ca-flow-card">
        <AnamnesisWizard
          mode={mode}
          level={level}
          initial={initial}
          space={space?.summary ?? null}
          saving={saving}
          error={error}
          onSave={(record) => void save(record)}
          onCancel={mode === 'edit' ? () => router.back() : undefined}
        />
      </div>
    </div>
  )
}
