'use client'

import { Button } from '@heroui/react'
import { Check } from 'lucide-react'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { spaceTheme, spaceThemes, type SpaceTheme } from '@/lib/space-theme'
import '@/app/space-theme.css'

const ThemeContext = createContext<{
  theme: SpaceTheme
  setTheme: (theme: SpaceTheme) => void
} | null>(null)

export function SpaceThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme?: string
  children: ReactNode
}) {
  const [theme, setTheme] = useState<SpaceTheme>(spaceTheme(initialTheme))
  useEffect(() => {
    document.documentElement.dataset.spaceTheme = theme
    return () => {
      delete document.documentElement.dataset.spaceTheme
    }
  }, [theme])
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useSpaceTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('SpaceThemeProvider required')
  return context
}

export function ThemePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: SpaceTheme
  onChange: (theme: SpaceTheme) => void
  disabled?: boolean
}) {
  return (
    <div className="space-theme-picker" role="group" aria-label="Tema do espaço">
      {spaceThemes.map((theme) => (
        <Button
          key={theme.id}
          variant="ghost"
          className="space-theme-option"
          aria-pressed={value === theme.id}
          isDisabled={disabled}
          onPress={() => onChange(theme.id)}
        >
          <span
            className="space-theme-swatch"
            style={{ background: `linear-gradient(135deg, ${theme.dark} 50%, ${theme.light} 50%)` }}
          >
            {value === theme.id && <Check size={20} aria-hidden="true" />}
          </span>
          <span>{theme.label}</span>
        </Button>
      ))}
    </div>
  )
}
