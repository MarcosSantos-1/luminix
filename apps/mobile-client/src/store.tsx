// Device-only state, like the web client area: there is no client identity in the API yet.
// The password is kept only as a salted hash and nothing leaves the phone.
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Crypto from 'expo-crypto'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { SpaceSummary } from './api'

type Account = {
  email: string
  name: string
  passHash: string
  salt: string
  spaces: SpaceSummary[]
  activeSlug: string | null
  permissionsSeen: boolean
}

type State = { seenIntro: boolean; session: string | null; accounts: Record<string, Account> }

const KEY = 'luminix.cliente.v1'
const EMPTY: State = { seenIntro: false, session: null, accounts: {} }

type Store = {
  ready: boolean
  seenIntro: boolean
  account: Account | null
  space: SpaceSummary | null
  finishIntro: () => void
  signUp: (input: { name: string; email: string; password: string }) => Promise<string | null>
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => void
  markPermissionsSeen: () => void
  enterSpace: (space: SpaceSummary) => void
  removeSpace: (slug: string) => void
}

const Context = createContext<Store | null>(null)

const hash = (salt: string, password: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`)

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null)

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => setState(raw ? { ...EMPTY, ...(JSON.parse(raw) as State) } : EMPTY))
      .catch(() => setState(EMPTY))
  }, [])

  const commit = useCallback((change: (current: State) => State) => {
    setState((current) => {
      const next = change(current ?? EMPTY)
      // Losing a write only costs a repeated step; never block the interface on it.
      void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {})
      return next
    })
  }, [])

  const store = useMemo<Store>(() => {
    const current = state ?? EMPTY
    const account = current.session ? (current.accounts[current.session] ?? null) : null
    const patch = (change: (account: Account) => Account) =>
      commit((value) => {
        const target = value.session ? value.accounts[value.session] : null
        return target
          ? { ...value, accounts: { ...value.accounts, [target.email]: change(target) } }
          : value
      })
    return {
      ready: state !== null,
      seenIntro: current.seenIntro,
      account,
      space: account?.spaces.find((item) => item.slug === account.activeSlug) ?? null,
      finishIntro: () => commit((value) => ({ ...value, seenIntro: true })),
      async signUp({ name, email: rawEmail, password }) {
        const email = rawEmail.trim().toLowerCase()
        if (name.trim().length < 2) return 'Informe seu nome.'
        if (!isEmail(email)) return 'Informe um e-mail válido.'
        if (password.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.'
        if (current.accounts[email]) return 'Já existe uma conta com este e-mail neste aparelho.'
        const salt = Crypto.randomUUID()
        const passHash = await hash(salt, password)
        commit((value) => ({
          ...value,
          session: email,
          accounts: {
            ...value.accounts,
            [email]: {
              email,
              name: name.trim(),
              passHash,
              salt,
              spaces: [],
              activeSlug: null,
              permissionsSeen: false,
            },
          },
        }))
        return null
      },
      async signIn(rawEmail, password) {
        const email = rawEmail.trim().toLowerCase()
        const found = current.accounts[email]
        // Same message for unknown e-mail and wrong password.
        if (!found || (await hash(found.salt, password)) !== found.passHash)
          return 'E-mail ou senha incorretos.'
        commit((value) => ({ ...value, session: email }))
        return null
      },
      signOut: () => commit((value) => ({ ...value, session: null })),
      markPermissionsSeen: () => patch((value) => ({ ...value, permissionsSeen: true })),
      enterSpace: (space) =>
        patch((value) => ({
          ...value,
          activeSlug: space.slug,
          spaces: [...value.spaces.filter((item) => item.slug !== space.slug), space],
        })),
      removeSpace: (slug) =>
        patch((value) => {
          const spaces = value.spaces.filter((item) => item.slug !== slug)
          return {
            ...value,
            spaces,
            activeSlug: value.activeSlug === slug ? (spaces[0]?.slug ?? null) : value.activeSlug,
          }
        }),
    }
  }, [state, commit])

  return <Context.Provider value={store}>{children}</Context.Provider>
}

export function useStore() {
  const store = useContext(Context)
  if (!store) throw new Error('useStore outside StoreProvider')
  return store
}
