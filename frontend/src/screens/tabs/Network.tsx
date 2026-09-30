import { useEffect, useState } from 'react'
import { API } from '../../api'
import { copyText } from '../../hooks'
import { Ic } from '../../icons'
import { Sec } from '../../components/ui'
import { useToast } from '../../components/toast'
import type { ServerDetail } from '../../types'

/**
 * Network tab — today it shows public addresses and reverse DNS only
 * (growth path: "TODAY THIS TAB SHOWS PUBLIC ADDRESSES + rDNS ONLY").
 */
export default function Network({ detail, desktop, onChanged }: { detail: ServerDetail; desktop?: boolean; onChanged: () => void }) {
  const toast = useToast()
  const px = desktop ? 28 : 16

  const copy = (label: string, value: string) => {
    void copyText(value).then((ok) => toast.push(ok ? { kind: 'success', title: `${label} copied` } : { kind: 'error', title: 'Copy failed', detail: value }))
  }

  return (
    <>
      <section style={{ padding: `20px ${px}px 0` }}>
        <Sec n="01" title="Public" />
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 6px 12px 14px', borderBottom: '1px solid var(--line)' }}>
            <span className="eb" style={{ width: 34 }}>IPv4</span>
            <span className="m" style={{ flex: 1, fontSize: 15 }}>{detail.ipv4 || 'No IPv4'}</span>
            {detail.ipv4 && (
              <button className="btn btn-ico btn-bare" aria-label="Copy IPv4" onClick={() => copy('IPv4', detail.ipv4)}>
                <Ic.Copy />
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 6px 12px 14px' }}>
            <span className="eb" style={{ width: 34 }}>IPv6</span>
            <span className="m" style={{ flex: 1, fontSize: 15 }}>{detail.ipv6 || 'No IPv6'}</span>
            {detail.ipv6 && (
              <button className="btn btn-ico btn-bare" aria-label="Copy IPv6" onClick={() => copy('IPv6', detail.ipv6)}>
                <Ic.Copy />
              </button>
            )}
          </div>
        </div>
      </section>

      <section style={{ padding: `28px ${px}px 40px` }}>
        <Sec n="02" title="Reverse DNS" />
        <div className="card">
          {detail.rdns.map((row, i) => (
            <RdnsRow
              key={`${row.family}-${row.ip}`}
              serverId={detail.id}
              family={row.family}
              ip={row.ip}
              value={row.dnsPtr}
              last={i === detail.rdns.length - 1}
              onSaved={onChanged}
            />
          ))}
          {detail.rdns.length === 0 && (
            <p className="m t3" style={{ fontSize: 11, padding: 14, margin: 0 }}>
              No public IP — nothing to point.
            </p>
          )}
        </div>
        <p className="m t3" style={{ fontSize: 10.5, margin: '10px 0 0', lineHeight: 1.6 }}>
          PTR RECORDS. LEAVE A FIELD EMPTY TO RESET IT TO THE HETZNER DEFAULT.
        </p>
      </section>
    </>
  )
}

function RdnsRow({
  serverId,
  family,
  ip,
  value,
  last,
  onSaved,
}: {
  serverId: number
  family: string
  ip: string
  value: string
  last: boolean
  onSaved: () => void
}) {
  const toast = useToast()
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  // Hetzner rejects values that start or end with a dash or dot — trim the
  // ends on save instead of showing an error while typing.
  const cleaned = draft.trim().replace(/^[.-]+/, '').replace(/[.-]+$/, '')
  const dirty = cleaned !== value

  // follow the server's value after a save lands (poll/reload)
  useEffect(() => setDraft(value), [value])

  const save = async () => {
    if (!dirty || busy) return
    setBusy(true)
    try {
      // empty = reset to Hetzner's default PTR (the API takes null)
      const res = await API.action(serverId, 'change_dns_ptr', { ip, dns_ptr: cleaned || null })
      // the toast reports success/failure when the action settles — not before
      toast.trackAction(`Updating reverse DNS · ${ip}`, res.action)
      onSaved()
    } catch (err) {
      toast.push({ kind: 'error', title: 'Reverse DNS failed', detail: err instanceof Error ? err.message : 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '12px 14px', borderBottom: last ? undefined : '1px solid var(--line)' }}>
      <div className="eb" style={{ marginBottom: 8 }}>
        {family} · {ip}
      </div>
      <form
        className="field"
        style={{ height: 44 }}
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <input
          value={draft}
          placeholder="no rDNS"
          aria-label={`Reverse DNS for ${ip}`}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="submit"
          className="m"
          style={{ fontSize: 11, letterSpacing: '.12em', color: dirty ? 'var(--accent)' : 'var(--t4)', height: 44 }}
          disabled={!dirty || busy}
        >
          SAVE
        </button>
      </form>
    </div>
  )
}
