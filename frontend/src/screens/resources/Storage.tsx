import { useState } from 'react'
import { API, CATALOG_CACHE, Volumes } from '../../api'
import { useAsync } from '../../hooks'
import { ago } from '../../format'
import type { Volume } from '../../types'
import {
  Act,
  Field,
  ResourceScreen,
  Select,
  Sheet,
  StatusTag,
  TextInput,
  useConfirm,
  useServers,
  type Ctx,
} from '../../components/resource'

const COLS = 'minmax(170px,1.4fr) minmax(78px,.5fr) minmax(116px,.7fr) minmax(120px,.7fr) minmax(170px,1.1fr) minmax(110px,.7fr)'

const fmtSize = (n: number) => `${n} GB`
const serverOf = (v: Volume) => (v.serverId ? `#${v.serverId}` : '—')

export default function Storage() {
  return (
    <ResourceScreen<Volume>
      cacheKey="volumes"
      n="02"
      heading="Storage"
      title="Volumes"
      emptyCopy="This project has no volumes yet."
      key-name="volumes"
      load={Volumes.list}
      id={(v) => v.id}
      name={(v) => v.name}
      matches={(v, q) => v.name.toLowerCase().includes(q) || String(v.sizeGb) === q || v.location.code.includes(q)}
      cols={[
        { key: 'name', head: 'Volume', render: (v) => <b style={{ fontWeight: 600 }}>{v.name}</b> },
        { key: 'size', head: 'Size', render: (v) => <span className="num">{fmtSize(v.sizeGb)}</span> },
        { key: 'status', head: 'Status', render: (v) => <StatusTag status={v.status} /> },
        { key: 'loc', head: 'Location', render: (v) => v.location.city || v.location.code },
        { key: 'server', head: 'Attached', render: (v) => serverOf(v) },
        { key: 'created', head: 'Created', render: (v) => <span className="t3">{ago(v.created)}</span> },
      ]}
      grid={COLS}
      card={(v) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <StatusTag status={v.status} />
          <b style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {v.name}
          </b>
          <span className="num t3" style={{ fontSize: 13 }}>
            {fmtSize(v.sizeGb)}
          </span>
        </div>
      )}
      detail={({ row: v }) => [
        ['Id', <span className="num">{v.id}</span>],
        ['Status', <StatusTag status={v.status} />],
        ['Size', <span className="num">{fmtSize(v.sizeGb)}</span>],
        ['Location', `${v.location.city} · ${v.location.code}`],
        ['Attached', serverOf(v)],
        ['Device', v.device || '—'],
        ['Format', v.format || '—'],
        ['Created', ago(v.created)],
      ]}
      actions={(ctx) => <VolumeActions ctx={ctx} />}
      create={(ctx) => <VolumeCreate close={ctx.close} mutate={ctx.mutate} />}
      createLabel="New volume"
    />
  )
}

// ---- detail actions -----------------------------------------------------

function VolumeActions({ ctx }: { ctx: Ctx<Volume> }) {
  const [pane, setPane] = useState<'' | 'attach' | 'resize' | 'rename'>('')
  const confirm = useConfirm()
  const v = ctx.row
  const attached = v.serverId != null

  const toggleProtect = () =>
    ctx.act(v.protectDelete ? 'Disable delete protection' : 'Enable delete protection', Volumes.act(v.id, 'change_protection', { protect: !v.protectDelete }))

  return (
    <>
      {!attached && (
        <Act tone="primary" onClick={() => setPane('attach')}>
          Attach to server
        </Act>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <Act onClick={() => setPane('resize')}>Resize</Act>
        <Act onClick={() => setPane('rename')}>Rename</Act>
      </div>
      {attached && (
        <Act
          tone="danger"
          onClick={() =>
            ctx.act('Detach volume', Volumes.act(v.id, 'detach')).then((res) => {
              if (res) ctx.close()
            })
          }
        >
          Detach
        </Act>
      )}
      <Act onClick={toggleProtect}>{v.protectDelete ? 'Allow delete' : 'Protect from delete'}</Act>
      <Act tone="danger" onClick={confirm.ask}>
        Delete volume
      </Act>

      {pane === 'attach' && <AttachSheet ctx={ctx} onClose={() => setPane('')} />}
      {pane === 'resize' && <ResizeSheet ctx={ctx} onClose={() => setPane('')} />}
      {pane === 'rename' && <RenameSheet ctx={ctx} onClose={() => setPane('')} />}

      {confirm.dialog({
        eyebrow: 'Storage',
        title: `Delete ${v.name}?`,
        confirmLabel: 'Delete',
        onConfirm: async () => {
          const res = await ctx.act('Delete volume', Volumes.remove(v.id))
          if (res) ctx.close()
        },
        children: attached
          ? 'This volume is still attached. Hetzner refuses to delete it — detach it first.'
          : 'The data on this volume is gone for good. There is no undo.',
      })}
    </>
  )
}

function AttachSheet({ ctx, onClose }: { ctx: Ctx<Volume>; onClose: () => void }) {
  const { servers, error } = useServers()
  const [serverId, setServerId] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!serverId || busy) return
    setBusy(true)
    const res = await ctx.act('Attach volume', Volumes.act(ctx.row.id, 'attach', { serverId: Number(serverId), automount: true }))
    setBusy(false)
    if (res) {
      onClose()
      ctx.close()
    }
  }

  return (
    <Sheet open onClose={onClose} eyebrow="Storage" title="Attach volume" sub={ctx.row.name}>
      <Field label="Server" hint={error ? 'The server list could not be read.' : 'The volume shows up at /dev/disk/by-id after it is ready.'}>
        <Select
          value={serverId}
          onChange={setServerId}
          options={[
            { value: '', label: servers.length ? 'Pick a server…' : 'No servers in this project' },
            ...servers.map((s) => ({ value: String(s.id), label: `${s.name} · ${s.status}` })),
          ]}
        />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 48 }}
        disabled={!serverId || busy}
        onClick={() => void submit()}
      >
        Attach
      </button>
    </Sheet>
  )
}

function ResizeSheet({ ctx, onClose }: { ctx: Ctx<Volume>; onClose: () => void }) {
  const [size, setSize] = useState(String(ctx.row.sizeGb))
  const n = Number(size)
  const valid = Number.isFinite(n) && n >= 1 && Math.floor(n) === n && n >= ctx.row.sizeGb

  return (
    <Sheet open onClose={onClose} eyebrow="Storage" title="Resize volume" sub={ctx.row.name}>
      <Field label="New size (GB)" hint="Volumes only grow. Shrinking means a new volume and a copy.">
        <TextInput value={size} onChange={setSize} type="number" inputMode="numeric" />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 48 }}
        disabled={!valid}
        onClick={() =>
          void ctx.act('Resize volume', Volumes.act(ctx.row.id, 'resize', { sizeGb: n })).then((res) => {
            if (res) onClose()
          })
        }
      >
        Resize to {valid ? n : '—'} GB
      </button>
      {ctx.row.sizeGb > 0 && !valid && (
        <p className="t3 m" style={{ fontSize: 12, marginTop: 12 }}>
          {n < ctx.row.sizeGb ? 'A volume can never be smaller than it is now.' : 'Enter a whole number of GB.'}
        </p>
      )}
    </Sheet>
  )
}

function RenameSheet({ ctx, onClose }: { ctx: Ctx<Volume>; onClose: () => void }) {
  const [name, setName] = useState(ctx.row.name)
  const ok = name.trim().length > 0

  return (
    <Sheet open onClose={onClose} eyebrow="Storage" title="Rename volume" sub={`Id ${ctx.row.id}`}>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="backup-01" />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 48 }}
        disabled={!ok}
        onClick={() =>
          void ctx.mutate('Rename volume', Volumes.update(ctx.row.id, { name: name.trim() })).then((done) => {
            if (done) onClose()
          })
        }
      >
        Save
      </button>
    </Sheet>
  )
}

// ---- create -------------------------------------------------------------

function VolumeCreate({ close, mutate }: { close: () => void; mutate: Ctx<Volume>['mutate'] }) {
  const catalog = useAsync(() => API.catalog(), [], { cache: CATALOG_CACHE })
  const { servers } = useServers()

  const [name, setName] = useState('')
  const [size, setSize] = useState('20')
  const [location, setLocation] = useState('')
  const [server, setServer] = useState('')
  const [busy, setBusy] = useState(false)

  const locations = catalog.data?.locations ?? []
  const loc = location || locations[0]?.name || ''
  const n = Number(size)
  const valid = name.trim().length > 0 && Number.isFinite(n) && n >= 1 && Math.floor(n) === n && !!loc

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    const done = await mutate(
      'Create volume',
      Volumes.create({
        name: name.trim(),
        sizeGb: n,
        location: loc,
        automount: true,
        serverId: server ? Number(server) : null,
      }),
    )
    setBusy(false)
    if (done) close()
  }

  return (
    <>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="backup-01" />
      </Field>
      <Field label="Size (GB)" hint="1 GB to 10 TB. It can grow later, never shrink.">
        <TextInput value={size} onChange={setSize} type="number" inputMode="numeric" />
      </Field>
      <Field label="Location">
        <Select
          value={loc}
          onChange={setLocation}
          options={locations.map((l) => ({ value: l.name, label: `${l.city} · ${l.name}` }))}
        />
      </Field>
      <Field label="Attach to server" hint="Leave empty to create it detached.">
        <Select
          value={server}
          onChange={setServer}
          options={[
            { value: '', label: 'Not attached' },
            ...servers.map((s) => ({ value: String(s.id), label: `${s.name} · ${s.status}` })),
          ]}
        />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 50 }}
        disabled={!valid || busy}
        onClick={() => void submit()}
      >
        Create volume
      </button>
    </>
  )
}
