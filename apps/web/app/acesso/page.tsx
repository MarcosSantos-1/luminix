'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { Brand } from '../../components/brand'

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export default function AcessoPage() {
  const router = useRouter()
  const [cpf, setCpf] = useState('')
  const [password, setPassword] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    router.push('/c/demonstracao')
  }

  return (
    <main className="acesso">
      <div className="acesso-card">
        <Link href="/" className="acesso-home" aria-label="Voltar ao Luminix">
          <Brand />
        </Link>
        <h1>Entrar</h1>
        <p>Acesso rápido para clientes das clínicas. Esta tela ainda é um rascunho.</p>
        <form onSubmit={submit}>
          <label>
            CPF
            <input
              name="cpf"
              inputMode="numeric"
              autoComplete="username"
              required
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(event) => setCpf(formatCpf(event.target.value))}
            />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
              placeholder="Sua senha"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button type="submit">Entrar</button>
        </form>
        <Link href="/" className="acesso-back">
          Voltar à página inicial
        </Link>
      </div>
    </main>
  )
}
