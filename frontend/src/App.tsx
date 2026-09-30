import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ErrorBoundary } from './components/boundary'
import { session } from './api'
import SignIn from './screens/SignIn'
import Servers from './screens/Servers'
import ServerDetail from './screens/ServerDetail'
import Rescale from './screens/Rescale'
import NewServer from './screens/NewServer'
import Created from './screens/Created'

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!session.get()) return <Navigate to="/signin" replace />
  return <>{children}</>
}

export default function App() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Ctrl/Cmd+A selects the top-most open dialog/sheet (or the page), never
  // the list sitting behind it. Inputs keep their own select-all.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.key === 'a' || e.key === 'A') || !(e.ctrlKey || e.metaKey) || e.altKey) return
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement | null)?.isContentEditable) return
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]')
      const scope = dialogs.length ? dialogs[dialogs.length - 1] : document.getElementById('root')
      if (!scope) return
      e.preventDefault()
      window.getSelection()?.selectAllChildren(scope)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Any 401 with code "session" (expired token) drops the user back to sign-in.
  useEffect(() => {
    const onExpired = () => {
      session.clear()
      navigate('/signin', { replace: true })
    }
    window.addEventListener('hector:session-expired', onExpired)
    return () => window.removeEventListener('hector:session-expired', onExpired)
  }, [navigate])

  return (
    <ErrorBoundary resetKey={pathname}>
    <Routes>
      <Route path="/signin" element={session.get() ? <Navigate to="/" replace /> : <SignIn />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Servers />
          </RequireAuth>
        }
      />
      <Route
        path="/servers/:id"
        element={
          <RequireAuth>
            <ServerDetail />
          </RequireAuth>
        }
      />
      <Route
        path="/servers/:id/:tab"
        element={
          <RequireAuth>
            <ServerDetail />
          </RequireAuth>
        }
      />
      <Route
        path="/servers/:id/rescale"
        element={
          <RequireAuth>
            <Rescale />
          </RequireAuth>
        }
      />
      <Route
        path="/servers/:id/created"
        element={
          <RequireAuth>
            <Created />
          </RequireAuth>
        }
      />
      <Route
        path="/new"
        element={
          <RequireAuth>
            <NewServer />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ErrorBoundary>
  )
}
