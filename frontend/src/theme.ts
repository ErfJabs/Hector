/** Theme: dark (the approved design) or light. Persisted per browser. */
export type Theme = 'dark' | 'light'

const KEY = 'hector.theme'

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'light') root.dataset.theme = 'light'
  else delete root.dataset.theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'light' ? '#F7F6F3' : '#0A0A0A')
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'light' ? 'dark' : 'light'
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* private mode: the theme just won't persist */
  }
  applyTheme(next)
  return next
}
