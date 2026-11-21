'use client'

import { useEffect, useState } from 'react'
import { SearchInput } from '@/components/ui/fields'
import { formatBrPhone } from '@/lib/phone'
import type { ClinicApi } from '../settings/clinic-api'

export type ClientChoice = {
  id: string
  display_name: string
  contact_phone: string | null
  marketing_opt_in: boolean
}

export function ClientPicker({
  api,
  onPick,
}: {
  api: ClinicApi
  onPick: (client: ClientChoice) => void
}) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{
    query: string
    clients: ClientChoice[]
    error?: boolean
  } | null>(null)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      void api
        .get<{ clients: ClientChoice[] }>('clients', { q: query, status: 'active' })
        .then((body) => active && setResult({ query, clients: body.clients }))
        .catch(() => active && setResult({ query, clients: [], error: true }))
    }, 220)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [api, query])

  const current = result?.query === query ? result : null
  return (
    <div className="bk-step">
      <SearchInput
        ariaLabel="Buscar cliente"
        placeholder="Buscar cliente"
        value={query}
        onChange={setQuery}
      />
      {!current ? (
        <p className="apt-hint" role="status">
          Buscando clientes…
        </p>
      ) : current.error ? (
        <p className="apt-error" role="alert">
          Não foi possível buscar clientes.
        </p>
      ) : current.clients.length ? (
        <ul className="bk-list" aria-label="Clientes">
          {current.clients.map((client) => (
            <li key={client.id}>
              <button type="button" onClick={() => onPick(client)}>
                <span className="bk-client-copy">
                  <strong>{client.display_name}</strong>
                  {client.contact_phone ? (
                    <small>{formatBrPhone(client.contact_phone)}</small>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="apt-hint">Nenhuma cliente encontrada.</p>
      )}
    </div>
  )
}
