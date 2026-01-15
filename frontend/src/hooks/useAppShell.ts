import { useEffect, useState } from 'react'
import { useMediaQuery } from './useMediaQuery'

export function useAppShell() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme') as 'light' | 'dark' | null
      if (saved) return saved
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      return prefersDark ? 'dark' : 'light'
    }
    return 'dark'
  })

  const [mode, setMode] = useState<'local' | 'cloud'>(() => {
    try { return (localStorage.getItem('mode') as any) || 'local' } catch { return 'local' }
  })

  const [cloudCfg, setCloudCfg] = useState<{ baseUrl: string; agentId: string }>(() => ({
    baseUrl: (typeof localStorage !== 'undefined' ? (localStorage.getItem('cloud.baseUrl') || '/cloud') : '/cloud'),
    agentId: (typeof localStorage !== 'undefined' ? (localStorage.getItem('cloud.agentId') || '') : ''),
  }))

  const [cloudSettingsOpen, setCloudSettingsOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 767px)')
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [showLogs, setShowLogs] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('ui.showLogs')
      if (saved != null) return saved === '1'
    } catch { }
    if (typeof window !== 'undefined') {
      return window.matchMedia('(min-width: 1024px)').matches
    }
    return true
  })
  const [logsFullscreen, setLogsFullscreen] = useState(false)

  useEffect(() => {
    try { localStorage.setItem('ui.showLogs', showLogs ? '1' : '0') } catch { }
  }, [showLogs])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
  }, [theme])

  const toggleTheme = (e: any) => {
    const root = document.documentElement
    const prefersReduced = matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
    const supportsVT = 'startViewTransition' in document && !prefersReduced

    const rect = (e.target as HTMLElement)?.getBoundingClientRect?.()
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2
    const maxX = Math.max(x, innerWidth - x)
    const maxY = Math.max(y, innerHeight - y)
    const r = Math.hypot(maxX, maxY) + 24

    root.style.setProperty('--vt-x', `${x}px`)
    root.style.setProperty('--vt-y', `${y}px`)
    root.style.setProperty('--vt-r', `${r}px`)
    root.setAttribute('theme-transition', 'radial')

    const next = root.classList.contains('dark') ? 'light' : 'dark'

    if (supportsVT) {
      // @ts-expect-error: startViewTransition is experimental
      const vt = (document as any).startViewTransition(() => {
        root.classList.toggle('dark')
        try { localStorage.setItem('theme', next) } catch { }
      })
      vt.finished
        .then(() => new Promise<void>(resolve => { requestAnimationFrame(() => requestAnimationFrame(() => resolve())) }))
        .finally(() => {
          root.removeAttribute('theme-transition')
          root.style.removeProperty('--vt-x')
          root.style.removeProperty('--vt-y')
          root.style.removeProperty('--vt-r')
          setTheme(next)
        })
      return
    }

    root.classList.add('theme-transition')
    root.classList.toggle('dark')
    try { localStorage.setItem('theme', next) } catch { }
    setTheme(next)
    setTimeout(() => root.classList.remove('theme-transition'), 320)
  }

  const toggleMode = () => {
    const next = mode === 'local' ? 'cloud' : 'local'
    setMode(next)
    try { localStorage.setItem('mode', next) } catch { }
  }

  return {
    theme,
    setTheme,
    mode,
    setMode,
    cloudCfg,
    setCloudCfg,
    cloudSettingsOpen,
    setCloudSettingsOpen,
    isMobile,
    mobileFiltersOpen,
    setMobileFiltersOpen,
    showLogs,
    setShowLogs,
    logsFullscreen,
    setLogsFullscreen,
    toggleTheme,
    toggleMode,
  }
}
