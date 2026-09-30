import { useState, type CSSProperties } from 'react'
import { Ic } from '../icons'
import { getTheme, toggleTheme } from '../theme'

/** Icon button that flips dark ↔ light. The palettes live in styles.css. */
export function ThemeToggle({ style }: { style?: CSSProperties }) {
  const [theme, setTheme] = useState(getTheme)
  const next = theme === 'light' ? 'dark' : 'light'
  return (
    <button
      type="button"
      className="btn btn-ico btn-bare"
      style={style}
      aria-label={`Switch to ${next} mode`}
      title={next === 'light' ? 'Light mode' : 'Dark mode'}
      onClick={() => setTheme(toggleTheme())}
    >
      {theme === 'light' ? <Ic.Moon /> : <Ic.Sun />}
    </button>
  )
}
