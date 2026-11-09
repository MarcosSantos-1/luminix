'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useStaff } from '@/components/staff-provider'
import { sendPasswordResetEmail } from 'firebase/auth'
import { getFirebaseAuth } from '@/lib/firebase'
import { uploadClinicMedia } from '@/lib/media-upload'

export class ClinicApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { error?: string } | null,
  ) {
    super(body?.error ?? 'Request failed')
  }
}

export type ClinicApi = {
  ready: boolean
  get<T>(path: string, query?: Record<string, string>): Promise<T>
  put<T>(path: string, body: unknown): Promise<T>
  post<T>(path: string, body: unknown): Promise<T>
  upload(
    kind: 'clinic_logo' | 'public_photo' | 'professional_photo' | 'library_photo',
    file: File,
    subjectRef?: string,
  ): Promise<{ id: string; url: string }>
  /**
   * Firebase sends its "set your password" e-mail (template configured in the Firebase console).
   * Used for new staff invitations, resending and password resets.
   */
  sendAccessEmail(email: string): Promise<void>
  postalCode(
    cep: string,
  ): Promise<{ street: string; district: string; city: string; state: string } | null>
}

const Context = createContext<ClinicApi | null>(null)

/** Lets development fixtures replace the network; production always uses the staff session. */
export function ClinicApiProvider({ value, children }: { value: ClinicApi; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useClinicApi(clinicId: string): ClinicApi {
  const override = useContext(Context)
  const { user } = useStaff()
  return useMemo<ClinicApi>(() => {
    if (override) return override
    async function call<T>(
      method: 'GET' | 'PUT' | 'POST',
      path: string,
      body?: unknown,
      query?: Record<string, string>,
    ) {
      if (!user) throw new ClinicApiError(401, null)
      const url = new URL(`/api/clinics/${clinicId}/${path}`, window.location.origin)
      for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value)
      const response = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${await user.getIdToken()}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new ClinicApiError(response.status, data)
      return data as T
    }
    return {
      ready: Boolean(user),
      get: (path, query) => call('GET', path, undefined, query),
      put: (path, body) => call('PUT', path, body),
      post: (path, body) => call('POST', path, body),
      async sendAccessEmail(email) {
        await sendPasswordResetEmail(getFirebaseAuth(), email, {
          url: `${window.location.origin}/login`,
        })
      },
      async upload(kind, file, subjectRef) {
        if (!user) throw new ClinicApiError(401, null)
        const { asset } = await uploadClinicMedia({
          clinicId,
          token: await user.getIdToken(),
          kind,
          subjectRef,
          file,
        })
        return { id: asset.id, url: asset.largeUrl }
      },
      async postalCode(cep) {
        if (!user || !/^[0-9]{8}$/.test(cep)) return null
        const response = await fetch(`/api/address/postal-code/${cep}`, {
          headers: { authorization: `Bearer ${await user.getIdToken()}` },
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) return null
        const data: {
          address?: { street: string; district: string; city: string; state: string }
        } = await response.json()
        return data.address ?? null
      },
    }
  }, [override, user, clinicId])
}

/** Loads one resource; keeps showing the last good value while refreshing. */
export function useClinicResource<T>(api: ClinicApi, path: string) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({
    loading: true,
  })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!api.ready) return
    let active = true
    void api
      .get<T>(path)
      .then((data) => active && setState({ data, loading: false }))
      .catch(
        () =>
          active &&
          setState((current) => ({
            ...current,
            loading: false,
            error: 'Não conseguimos carregar estas informações agora.',
          })),
      )
    return () => {
      active = false
    }
  }, [api, path, retry])
  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: undefined }))
    setRetry((value) => value + 1)
  }, [])
  const setData = useCallback((data: T) => setState({ data, loading: false }), [])
  return { ...state, reload, setData }
}
