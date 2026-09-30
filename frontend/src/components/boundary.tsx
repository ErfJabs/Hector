import { Component, type ReactNode } from 'react'

/**
 * Last line of defence: a render error in one screen must not leave a black
 * page. Shows what broke and a way back; resets when the route changes.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="page" style={{ padding: '40px 16px' }}>
        <div style={{ border: '1px solid var(--accent-line)', padding: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="sq sq-err" />
            <span className="m" style={{ fontSize: 11, letterSpacing: '.14em', color: 'var(--accent-soft)' }}>
              UI ERROR
            </span>
          </div>
          <p style={{ fontSize: 18, fontWeight: 600, margin: '12px 0 0', lineHeight: 1.3 }}>This screen failed to render.</p>
          <p className="m t3" style={{ fontSize: 11.5, lineHeight: 1.5, margin: '8px 0 0', wordBreak: 'break-word' }}>
            {this.state.error.message}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={() => window.history.back()}>
              Back
            </button>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
