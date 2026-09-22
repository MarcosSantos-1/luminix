'use client'

import { useEffect, useRef, useState } from 'react'

/** Estado exclusivamente visual; nunca representa autorização ou clínica ativa. */
export function useManagerLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchTrigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])
  function changeSearch(open: boolean) {
    setSearchOpen(open)
    if (!open) {
      setQuery('')
      searchTrigger.current?.focus()
    }
  }
  return { collapsed, setCollapsed, searchOpen, changeSearch, query, setQuery, searchTrigger }
}
