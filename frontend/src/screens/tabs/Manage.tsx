import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { API, CATALOG_CACHE, notifyChanged } from '../../api'
import { copyText, useAsync, useIsDesktop } from '../../hooks'
import { toServerName } from '../../format'
import { Ic } from '../../icons'
import { Sw } from '../../components/ui'
import { Overlay } from '../../components/sheets'
import { BTN, ConfirmDialog, DialogButtons } from '../../components/confirm'
import { ImagePicker, imageRef } from '../../components/images'
import { useToast } from '../../components/toast'
import type { Catalog, ServerDetail } from '../../types'

interface Confirm {
  eyebrow: string
  title: string
  body: ReactNode
  label: string
  danger?: boolean
  go: () => void
}

/**
 * Manage — identity, compute, access, data, protection. Everything that
 * changes a server in a way that matters asks first (ConfirmDialog);
 * delete has its own typed-name sheet.
 */
export default function Manage({
  detail,
  onChanged,
  onRescale,
  onDelete,
}: {
  detail: ServerDetail
  onChanged: () => void
  onRescale: () => void
  onDelete: () => void
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const catalog = useAsync<Catalog>(() => API.catalog(), [], { cache: CATALOG_CACHE })
  const [dialog, setDialog] = useState<null | 'rebuild' | 'iso' | 'snapshot' | 'password'>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [rootPassword, setRootPassword] = useState('')

  // one in-flight toggle at a time; switches are also frozen while Hetzner
  // has the server locked by another action
  const [pending, setPending] = useState<string | null>(null)
  const frozen = detail.locked || !!detail.busy || pending !== null

  const run = (title: string, action: string, payload?: unknown) => {
    setPending(action)
    return toast
      .runTracked(`${title} ${detail.name}`, API.action(detail.id, action, payload))
      .then((res) => {
        if (res) onChanged()
        return res
      })
      .finally(() => setPending(null))
  }

  /** enable_rescue / rebuild / reset_password return a root password when
   *  no SSH key applies — it must be shown, it exists nowhere else. */
  const showPassword = (pw: string) => {
    if (!pw) return
    setRootPassword(pw)
    setDialog('password')
  }

  const rdnsSet = detail.rdns.filter((r) => r.dnsPtr).length
  const protectedOn = detail.protectDelete && detail.protectRebuild
  const backupPct = catalog.data?.backupPercent ? Number(catalog.data.backupPercent) : 20

  const askRescue = () =>
    setConfirm(
      detail.rescue
        ? {
            eyebrow: 'Rescue mode',
            title: `Turn off rescue for ${detail.name}?`,
            body: 'The next reboot starts the installed system again.',
            label: 'Turn off',
            go: () => void run('Disabling rescue for', 'disable_rescue'),
          }
        : {
            eyebrow: 'Rescue mode',
            title: `Turn on rescue for ${detail.name}?`,
            body: 'The next reboot starts a Linux rescue system instead of your OS. Reboot the server to enter it. Without an SSH key a root password is shown once.',
            label: 'Turn on',
            go: () => void run('Enabling rescue for', 'enable_rescue', { type: 'linux64' }).then((res) => res && showPassword(res.rootPassword)),
          },
    )

  const askBackups = () =>
    setConfirm(
      detail.backups
        ? {
            eyebrow: 'Backups',
            title: `Turn off backups for ${detail.name}?`,
            body: 'All existing backups of this server are deleted by Hetzner. This cannot be undone.',
            label: 'Turn off & delete',
            danger: true,
            go: () => void run('Disabling backups for', 'disable_backup'),
          }
        : {
            eyebrow: 'Backups',
            title: `Turn on backups for ${detail.name}?`,
            body: `Daily backups, 7 kept. Adds ${backupPct}% of the server price.`,
            label: 'Turn on',
            go: () => void run('Enabling backups for', 'enable_backup'),
          },
    )

  const askProtection = () => {
    const next = !protectedOn
    if (next) {
      void run('Updating protection for', 'change_protection', { delete: true, rebuild: true })
      return
    }
    setConfirm({
      eyebrow: 'Protection',
      title: `Remove the lock on ${detail.name}?`,
      body: 'The server can then be deleted or rebuilt.',
      label: 'Remove lock',
      danger: true,
      go: () => void run('Updating protection for', 'change_protection', { delete: false, rebuild: false }),
    })
  }

  const askPassword = () =>
    setConfirm({
      eyebrow: 'Root password',
      title: `Reset the root password of ${detail.name}?`,
      body: 'The current password stops working. Needs qemu-guest-agent running on the server. The new one is shown once.',
      label: 'Reset',
      go: () => void run('Resetting root password for', 'reset_password').then((res) => res && showPassword(res.rootPassword)),
    })

  return (
    <>
      <Group n="01" title="Identity">
        <NameField detail={detail} onSaved={onChanged} />
      </Group>

      <Group n="02" title="Compute">
        <Row icon={<Ic.Rescale />} title="Rescale" sub="Change the server type" right={detail.type.name.toUpperCase()} chevron onClick={onRescale} />
        <Row icon={<Ic.Layers />} title="Rebuild" sub="Reinstall · erases the disk" chevron onClick={() => setDialog('rebuild')} disabled={frozen} />
      </Group>

      <Group n="03" title="Access">
        <Row
          icon={<Ic.Rescue />}
          title="Rescue mode"
          sub="Linux rescue on next boot"
          trailing={<Sw on={detail.rescue} label="Rescue mode" disabled={frozen} onToggle={askRescue} />}
        />
        <Row icon={<Ic.Key />} title="Reset root password" sub="Needs qemu-guest-agent" chevron onClick={askPassword} disabled={frozen} />
        <Row icon={<Ic.Disc />} title="Mount ISO" sub="Boot an installer image" right={detail.iso ? 'MOUNTED' : 'NONE'} chevron onClick={() => setDialog('iso')} disabled={frozen} />
        <Row icon={<Ic.Globe />} title="Reverse DNS" sub="PTR records" right={`${rdnsSet} SET`} chevron onClick={() => navigate(`/servers/${detail.id}/network`)} />
      </Group>

      <Group n="04" title="Data">
        <Row
          icon={<Ic.Box />}
          title="Backups"
          sub={`Daily · 7 kept · +${backupPct}%`}
          trailing={<Sw on={detail.backups} label="Backups" disabled={frozen} onToggle={askBackups} />}
        />
        <Row icon={<Ic.Camera />} title="Create snapshot" sub="Disk image · billed per GB" chevron onClick={() => setDialog('snapshot')} disabled={frozen} />
      </Group>

      <Group n="05" title="Protection">
        <Row
          icon={<Ic.Shield />}
          title="Delete & rebuild lock"
          sub="Blocks delete and rebuild"
          trailing={<Sw on={protectedOn} label="Delete and rebuild protection" disabled={frozen} onToggle={askProtection} />}
        />
      </Group>

      <section style={{ padding: '34px 16px 40px' }}>
        <button type="button" className="btn btn-dng" style={{ width: '100%', height: 48 }} onClick={onDelete}>
          <Ic.Trash />
          Delete server
        </button>
      </section>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm?.go()}
        eyebrow={confirm?.eyebrow ?? ''}
        title={confirm?.title ?? ''}
        confirmLabel={confirm?.label ?? ''}
        danger={confirm?.danger}
      >
        {confirm?.body}
      </ConfirmDialog>

      <RebuildDialog
        open={dialog === 'rebuild'}
        onClose={() => setDialog(null)}
        detail={detail}
        catalog={catalog.data}
        catalogError={catalog.error?.message ?? ''}
        onDone={(pw) => {
          setDialog(null)
          onChanged()
          showPassword(pw)
        }}
      />
      <IsoDialog
        open={dialog === 'iso'}
        onClose={() => setDialog(null)}
        detail={detail}
        catalog={catalog.data}
        catalogError={catalog.error?.message ?? ''}
        onDone={() => {
          setDialog(null)
          onChanged()
        }}
      />
      <SnapshotDialog
        open={dialog === 'snapshot'}
        onClose={() => setDialog(null)}
        detail={detail}
        onDone={() => {
          setDialog(null)
          onChanged()
        }}
      />
      <InfoDialog open={dialog === 'password'} onClose={() => setDialog(null)} title="Root password" eyebrow={`${detail.name} · SHOWN ONCE`}>
        <PasswordReveal password={rootPassword} />
      </InfoDialog>
    </>
  )
}

// ---- pieces ------------------------------------------------------------

function Group({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section style={{ padding: '26px 0 0' }}>
      <div className="sec" style={{ padding: '0 16px', marginBottom: 6 }}>
        <h2>
          <i>{n}</i>
          {title}
        </h2>
      </div>
      <div style={{ borderTop: '1px solid var(--line-row)' }}>{children}</div>
    </section>
  )
}

function Row({
  icon,
  title,
  sub,
  right,
  chevron,
  onClick,
  trailing,
  disabled,
}: {
  icon: ReactNode
  title: string
  sub: string
  right?: string
  chevron?: boolean
  onClick?: () => void
  trailing?: ReactNode
  disabled?: boolean
}) {
  const inner = (
    <>
      <span style={{ color: 'var(--t2)', width: 36, height: 36, border: '1px solid var(--line2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{title}</span>
        {/* one line, always: long hints wrapped and made rows uneven */}
        <span className="t3" style={{ display: 'block', fontSize: 12.5, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sub}
        </span>
      </span>
      {right && <span className="m t2" style={{ fontSize: 11.5, letterSpacing: '.04em', flex: 'none' }}>{right}</span>}
      {trailing}
      {chevron && (
        <span className="t3">
          <Ic.ChevronRight />
        </span>
      )}
    </>
  )

  if (!onClick) return <div className="rowlink">{inner}</div>
  return (
    <button className="rowlink" style={{ width: '100%', opacity: disabled ? 0.45 : 1 }} onClick={onClick} disabled={disabled} type="button">
      {inner}
    </button>
  )
}

function NameField({ detail, onSaved }: { detail: ServerDetail; onSaved: () => void }) {
  const toast = useToast()
  const [draft, setDraft] = useState(detail.name)
  const [busy, setBusy] = useState(false)
  // trailing/leading dashes and dots are rejected by Hetzner — trim them on
  // save instead of nagging mid-typing
  const cleaned = draft.replace(/^[.-]+/, '').replace(/[.-]+$/, '')
  const dirty = cleaned !== detail.name && cleaned !== ''

  // follow renames that land from elsewhere (poll / other tab)
  useEffect(() => setDraft(detail.name), [detail.name])

  const save = async () => {
    if (!dirty || busy) return
    setBusy(true)
    try {
      if (cleaned !== draft) setDraft(cleaned)
      await API.rename(detail.id, cleaned)
      notifyChanged()
      toast.push({ kind: 'success', title: `Renamed to ${cleaned}` })
      onSaved()
    } catch (err) {
      toast.push({ kind: 'error', title: 'Rename failed', detail: err instanceof Error ? err.message : 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line-row)' }}>
      <label className="lbl" htmlFor="nm">
        Name
      </label>
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {/* typed text is normalised on the fly ("Web Server" → "web-server") */}
        <input id="nm" value={draft} autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => setDraft(toServerName(e.target.value))} />
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

function InfoDialog({ open, onClose, title, eyebrow, children }: { open: boolean; onClose: () => void; title: string; eyebrow: string; children: ReactNode }) {
  return (
    <Overlay open={open} onClose={onClose} kind="dialog" label={title}>
      <div style={{ padding: '16px 16px 20px' }}>
        <div className="eb">{eyebrow}</div>
        <h2 style={{ margin: '8px 0 16px', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>{title}</h2>
        {children}
      </div>
    </Overlay>
  )
}

function PasswordReveal({ password }: { password: string }) {
  const toast = useToast()
  const [show, setShow] = useState(false)
  return (
    <div style={{ border: '1px solid var(--accent)', padding: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span className="sq sq-err" style={{ width: 7, height: 7 }} />
        <span className="m" style={{ fontSize: 10.5, letterSpacing: '.14em', color: 'var(--accent-soft)', flex: 1 }}>
          ROOT PASSWORD
        </span>
        <span className="m" style={{ fontSize: 10.5, letterSpacing: '.14em', color: 'var(--accent-soft)' }}>SHOWN ONCE</span>
      </div>
      <div className="m" style={{ fontSize: 15, margin: '14px 0 0', wordBreak: 'break-all', lineHeight: 1.6 }}>
        {show ? password : '•••• •••• •••• •••• ••••'}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button type="button" className="btn" style={BTN} onClick={() => setShow((v) => !v)}>
          <Ic.Eye />
          {show ? 'Hide' : 'Reveal'}
        </button>
        <button
          type="button"
          className="btn"
          style={BTN}
          onClick={() => {
            void copyText(password).then((ok) => toast.push(ok ? { kind: 'success', title: 'Password copied' } : { kind: 'error', title: 'Copy failed' }))
          }}
        >
          <Ic.Copy />
          Copy
        </button>
      </div>
      <p className="t2" style={{ fontSize: 12.5, lineHeight: 1.5, margin: '12px 0 0' }}>
        Hetzner returns this only once. Hector doesn't store it — save it now.
      </p>
    </div>
  )
}

// ---- action dialogs ----------------------------------------------------

function RebuildDialog({
  open,
  onClose,
  detail,
  catalog,
  catalogError,
  onDone,
}: {
  open: boolean
  onClose: () => void
  detail: ServerDetail
  catalog: Catalog | null
  catalogError: string
  onDone: (rootPassword: string) => void
}) {
  const toast = useToast()
  const desktop = useIsDesktop()
  const [image, setImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)

  useEffect(() => {
    if (!open) {
      setImage('')
      setSure(false)
    }
  }, [open])

  // only images this server can boot: same CPU architecture
  const images = (catalog?.images ?? []).filter((img) => !img.arch || img.arch === detail.type.arch)
  const chosen = images.find((i) => imageRef(i) === image)

  const rebuild = async () => {
    if (!image || busy) return
    setBusy(true)
    const res = await toast.runTracked(`Rebuilding ${detail.name}`, API.action(detail.id, 'rebuild', { image }))
    setBusy(false)
    if (res) onDone(res.rootPassword)
  }

  return (
    <Overlay open={open} onClose={onClose} kind="dialog" label="Rebuild" width={760}>
      <div style={{ padding: '16px 16px 20px' }}>
        <div className="eb" style={{ color: 'var(--accent-soft)' }}>
          REBUILD · ERASES THE DISK
        </div>
        <h2 style={{ margin: '8px 0 14px', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Reinstall {detail.name}</h2>
        {detail.protectRebuild && (
          <p className="m" style={{ fontSize: 11, color: 'var(--warn)', margin: '0 0 12px', lineHeight: 1.5 }}>
            REBUILD PROTECTION IS ON · TURN OFF THE LOCK FIRST.
          </p>
        )}
        {catalog ? (
          <ImagePicker images={images} value={image} onChange={setImage} desktop={desktop} />
        ) : catalogError ? (
          <p className="m" style={{ fontSize: 11, color: 'var(--accent-soft)', margin: 0 }}>{catalogError}</p>
        ) : (
          <div className="skel" style={{ height: 180 }} />
        )}
        {sure && chosen && (
          <p style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--warn-text)', margin: '14px 0 0' }}>
            Everything on {detail.name}'s disk is replaced by <b>{chosen.description || chosen.name || `#${chosen.id}`}</b>. Press again to rebuild.
          </p>
        )}
        <DialogButtons
          onCancel={onClose}
          confirm={
            <button
              type="button"
              className={image && !busy && !detail.protectRebuild ? 'btn' : 'btn btn-dis'}
              style={{ ...BTN, ...(sure ? { background: 'var(--danger)', borderColor: 'var(--danger)', color: '#FFFFFF' } : { borderColor: 'var(--accent)', color: 'var(--accent-soft)', background: 'transparent' }) }}
              disabled={!image || busy || detail.protectRebuild}
              onClick={() => (sure ? void rebuild() : setSure(true))}
            >
              {sure ? 'Yes, rebuild' : 'Rebuild'}
            </button>
          }
        />
      </div>
    </Overlay>
  )
}

function IsoDialog({
  open,
  onClose,
  detail,
  catalog,
  catalogError,
  onDone,
}: {
  open: boolean
  onClose: () => void
  detail: ServerDetail
  catalog: Catalog | null
  catalogError: string
  onDone: () => void
}) {
  const toast = useToast()
  const [iso, setIso] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) setIso('')
  }, [open])

  // an ISO without an architecture boots anywhere; otherwise it must match
  const list = (catalog?.isos ?? []).filter((item) => !item.arch || item.arch === detail.type.arch)

  const attach = async () => {
    if (!iso || busy) return
    setBusy(true)
    const res = await toast.runTracked(`Mounting ISO on ${detail.name}`, API.action(detail.id, 'attach_iso', { iso }))
    setBusy(false)
    if (res) onDone()
  }

  const detach = async () => {
    setBusy(true)
    const res = await toast.runTracked(`Unmounting ISO from ${detail.name}`, API.action(detail.id, 'detach_iso'))
    setBusy(false)
    if (res) onDone()
  }

  return (
    <Overlay open={open} onClose={onClose} kind="dialog" label="Mount ISO" width={640}>
      <div style={{ padding: '16px 16px 20px' }}>
        <div className="eb">MOUNT ISO</div>
        <h2 style={{ margin: '8px 0 14px', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Virtual drive</h2>
        <div role="radiogroup" aria-label="ISO" style={{ borderTop: '1px solid var(--line)', maxHeight: '45vh', overflowY: 'auto' }}>
          {list.map((item) => {
            const on = iso === imageRef(item)
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setIso(imageRef(item))}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 56, padding: '8px 12px', borderBottom: '1px solid var(--line-row)', background: on ? 'var(--accent-dim)' : undefined }}
              >
                <span style={{ width: 12, height: 12, flex: 'none', background: on ? 'var(--accent)' : undefined, boxShadow: on ? undefined : 'inset 0 0 0 1.5px var(--ctrl2)' }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description || item.name}</span>
                  <span className="m t3" style={{ display: 'block', fontSize: 10.5, marginTop: 3 }}>{item.name}</span>
                </span>
              </button>
            )
          })}
          {!catalog && !catalogError && <div className="skel" style={{ height: 60, marginTop: 8 }} />}
          {catalogError && <p className="m" style={{ fontSize: 11, color: 'var(--accent-soft)', padding: '12px 0', margin: 0 }}>{catalogError}</p>}
          {catalog && list.length === 0 && <p className="m t3" style={{ fontSize: 11, padding: '12px 0', margin: 0 }}>No ISOs for this architecture.</p>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button type="button" className="btn" style={BTN} onClick={detail.iso ? detach : onClose} disabled={busy}>
            {detail.iso ? 'Detach current' : 'Cancel'}
          </button>
          <button type="button" className={iso && !busy ? 'btn btn-red' : 'btn btn-red btn-dis'} style={BTN} disabled={!iso || busy} onClick={attach}>
            Attach
          </button>
        </div>
      </div>
    </Overlay>
  )
}

function SnapshotDialog({ open, onClose, detail, onDone }: { open: boolean; onClose: () => void; detail: ServerDetail; onDone: () => void }) {
  const toast = useToast()
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) setDescription('')
  }, [open])

  const create = async () => {
    if (busy) return
    setBusy(true)
    const res = await toast.runTracked(
      `Creating snapshot of ${detail.name}`,
      API.action(detail.id, 'create_image', { type: 'snapshot', description: description.trim() || `${detail.name} snapshot` }),
    )
    setBusy(false)
    if (res) onDone()
  }

  return (
    <Overlay open={open} onClose={onClose} kind="dialog" label="Create snapshot" width={480}>
      <form
        style={{ padding: '16px 16px 20px' }}
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <div className="eb">SNAPSHOT · BILLED PER GB</div>
        <h2 style={{ margin: '8px 0 14px', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Image of the disk</h2>
        <label className="lbl" htmlFor="snap-desc">
          Description
        </label>
        <div className="field">
          <input id="snap-desc" value={description} placeholder={`${detail.name} snapshot`} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <DialogButtons
          onCancel={onClose}
          confirm={
            <button type="submit" className={busy ? 'btn btn-red btn-dis' : 'btn btn-red'} style={BTN} disabled={busy}>
              Create
            </button>
          }
        />
      </form>
    </Overlay>
  )
}
