import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { API, ApiError, session } from '../api'
import { Ic } from '../icons'
import { Logo } from '../components/topbar'
import { ThemeToggle } from '../components/theme-toggle'

/** M · Sign in — the whole panel is one admin account configured on the server. */
export default function SignIn() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { token } = await API.login(username, password)
      session.set(token)
      navigate('/', { replace: true })
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 401 ? 'Wrong username or password' : err instanceof Error ? err.message : 'Sign in failed'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    // Flow layout, not absolute offsets: on short phones (SE: 667px) and with
    // the keyboard open, the old top:150/bottom:197 blocks overlapped.
    <div
      className="page"
      style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', padding: 'clamp(40px, 16vh, 150px) 16px 40px', gap: 40 }}
    >
      <div style={{ position: 'absolute', top: 14, right: 14 }}>
        <ThemeToggle />
      </div>
      <div>
        <Logo size={40} />
        <h1 className="d" style={{ margin: '26px 0 0', fontSize: 50 }}>
          Hector
        </h1>
        <p className="m t3" style={{ fontSize: 11, letterSpacing: '.12em', margin: '16px 0 0' }}>
          SERVER PANEL · SINGLE ADMIN
        </p>
      </div>

      <form onSubmit={submit} style={{ marginTop: 'auto', marginBottom: 'clamp(0px, 12vh, 157px)' }}>
        <label className="lbl" htmlFor="u">
          Username
        </label>
        <div className="field">
          <input
            id="u"
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <label className="lbl" htmlFor="p" style={{ marginTop: 16 }}>
          Password
        </label>
        <div className="field" style={error ? { borderColor: 'var(--accent)' } : undefined}>
          <input
            id="p"
            type={reveal ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-ico btn-bare"
            aria-label={reveal ? 'Hide password' : 'Show password'}
            style={{ marginRight: -12 }}
            onClick={() => setReveal((v) => !v)}
          >
            <Ic.Eye />
          </button>
        </div>

        {error && (
          <div role="alert" className="m" style={{ fontSize: 11, color: 'var(--accent-soft)', marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="sq sq-err" style={{ width: 7, height: 7 }} />
            {error}
          </div>
        )}

        <button
          type="submit"
          className={busy || !username.trim() || !password ? 'btn btn-red btn-dis' : 'btn btn-red'}
          style={{ width: '100%', height: 54, fontSize: 13, marginTop: 22 }}
          disabled={busy || !username.trim() || !password}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <a
          href="https://t.me/erfjabs"
          target="_blank"
          rel="noreferrer"
          className="src"
          style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Ic.Telegram />
          @erfjabs
        </a>
      </form>
    </div>
  )
}
