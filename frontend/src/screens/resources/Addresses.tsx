import { useState } from 'react'
import { API, CATALOG_CACHE, FloatingIPs, PrimaryIPs } from '../../api'
import { useAsync } from '../../hooks'
import { ago } from '../../format'
import type { ActionResult, FloatingIP, PrimaryIP } from '../../types'
import {
  Act,
  Field,
  ResourceScreen,
  Select,
  Sheet,
  TextInput,
  Toggle,
  useConfirm,
  useServers,
  type Ctx,
} from '../../components/resource'

const IP_COLS = 'minmax(150px,1.2fr) minmax(140px,1fr) minmax(90px,.5fr) minmax(140px,.9fr) minmax(110px,.7fr) minmax(110px,.7fr)'

const tabs = [
  { label: 'Floating IPs', path: '/addresses', end: true },
  { label: 'Primary IPs', path: '/addresses/primary' },
]

// ---- floating IPs -------------------------------------------------------

export function FloatingIPsScreen() {
  return (
    <ResourceScreen<FloatingIP>
      cacheKey="floating-ips"
      n="06"
      heading="Address"
      title="Floating IPs"
      emptyCopy="No floating IPs yet. One moves between servers without changing DNS."
      tabs={tabs}
      load={FloatingIPs.list}
      id={(f) => f.id}
      name={(f) => f.name || f.ip}
      matches={(f, q) => (f.name || '').toLowerCase().includes(q) || f.ip.includes(q)}
      cols={[
        { key: 'name', head: 'Name', render: (f) => <b style={{ fontWeight: 600 }}>{f.name || '—'}</b> },
        { key: 'ip', head: 'Address', render: (f) => <span className="num">{f.ip}</span> },
        { key: 'type', head: 'Type', render: (f) => <span className="tag">{f.type}</span> },
        { key: 'server', head: 'Assigned', render: (f) => <span className="num">{f.serverId ? `#${f.serverId}` : '—'}</span> },
        { key: 'loc', head: 'Home', render: (f) => f.location.city || f.location.code },
        { key: 'created', head: 'Created', render: (f) => <span className="t3">{ago(f.created)}</span> },
      ]}
      grid={IP_COLS}
      card={(f) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={f.serverId ? 'tag tag-run' : 'tag'}>{f.serverId ? 'assigned' : 'free'}</span>
            <b className="num" style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0 }}>
              {f.ip}
            </b>
          </div>
          <div className="m t3" style={{ fontSize: 11, marginTop: 8 }}>
            {f.name || 'unnamed'} · {f.location.city}
          </div>
        </div>
      )}
      detail={({ row: f }) => [
        ['Id', <span className="num">{f.id}</span>],
        ['Name', f.name || '—'],
        ['Address', <span className="num">{f.ip}</span>],
        ['Type', <span className="tag">{f.type}</span>],
        ['Assigned', f.serverId ? `server #${f.serverId}` : 'not assigned'],
        ['Description', f.description || '—'],
        ['Home', `${f.location.city} · ${f.location.code}`],
        [
          'Reverse DNS',
          f.dns.length ? (
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {f.dns.map((d) => (
                <span key={d.ip} className="num">
                  {d.ip} → {d.dnsPtr || '—'}
                </span>
              ))}
            </span>
          ) : (
            '—'
          ),
        ],
        ['Created', ago(f.created)],
      ]}
      actions={(ctx) => (
        <IPActions
          ctx={ctx}
          assigned={ctx.row.serverId != null}
          act={(title, action, body) => ctx.act(title, FloatingIPs.act(ctx.row.id, action, body))}
          onRename={(name) => FloatingIPs.update(ctx.row.id, { name, description: ctx.row.description })}
          onDelete={() => FloatingIPs.remove(ctx.row.id)}
        />
      )}
      create={(ctx) => <FloatingCreate close={ctx.close} mutate={ctx.mutate} />}
      createLabel="New IP"
    />
  )
}

function FloatingCreate({ close, mutate }: { close: () => void; mutate: Ctx<FloatingIP>['mutate'] }) {
  const catalog = useAsync(() => API.catalog(), [], { cache: CATALOG_CACHE })
  const { servers } = useServers()
  const [name, setName] = useState('')
  const [type, setType] = useState('ipv4')
  const [location, setLocation] = useState('')
  const [server, setServer] = useState('')
  const [busy, setBusy] = useState(false)
  const locations = catalog.data?.locations ?? []
  const loc = location || locations[0]?.name || ''
  const valid = name.trim().length > 0 && !!loc

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    const done = await mutate(
      'Create floating IP',
      FloatingIPs.create({
        name: name.trim(),
        type,
        location: loc,
        serverId: server ? Number(server) : null,
      }),
    )
    setBusy(false)
    if (done) close()
  }

  return (
    <>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="vip-edge" />
      </Field>
      <Field label="Type">
        <Select
          value={type}
          onChange={setType}
          options={[
            { value: 'ipv4', label: 'IPv4' },
            { value: 'ipv6', label: 'IPv6' },
          ]}
        />
      </Field>
      <Field label="Home location">
        <Select
          value={loc}
          onChange={setLocation}
          options={locations.map((l) => ({ value: l.name, label: `${l.city} · ${l.name}` }))}
        />
      </Field>
      <Field label="Assign now" hint="Leave empty to keep it free until you need it.">
        <Select
          value={server}
          onChange={setServer}
          options={[
            { value: '', label: 'Not assigned' },
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
        Create floating IP
      </button>
    </>
  )
}

// ---- primary IPs --------------------------------------------------------

export function PrimaryIPsScreen() {
  return (
    <ResourceScreen<PrimaryIP>
      cacheKey="primary-ips"
      n="07"
      heading="Address"
      title="Primary IPs"
      emptyCopy="No primary IPs yet. A primary IP survives every rebuild of its server."
      tabs={tabs}
      load={PrimaryIPs.list}
      id={(p) => p.id}
      name={(p) => p.name || p.ip}
      matches={(p, q) => (p.name || '').toLowerCase().includes(q) || p.ip.includes(q)}
      cols={[
        { key: 'name', head: 'Name', render: (p) => <b style={{ fontWeight: 600 }}>{p.name || '—'}</b> },
        { key: 'ip', head: 'Address', render: (p) => <span className="num">{p.ip}</span> },
        { key: 'type', head: 'Type', render: (p) => <span className="tag">{p.type}</span> },
        {
          key: 'assigned',
          head: 'Assigned',
          render: (p) => <span className="num">{p.assigneeId ? `#${p.assigneeId}` : '—'}</span>,
        },
        { key: 'loc', head: 'Location', render: (p) => p.location.city || p.location.code },
        { key: 'created', head: 'Created', render: (p) => <span className="t3">{ago(p.created)}</span> },
      ]}
      grid={IP_COLS}
      card={(p) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={p.assigneeId ? 'tag tag-run' : 'tag'}>{p.assigneeId ? 'assigned' : 'free'}</span>
            <b className="num" style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0 }}>
              {p.ip}
            </b>
          </div>
          <div className="m t3" style={{ fontSize: 11, marginTop: 8 }}>
            {p.name || 'unnamed'} · {p.assigneeType || 'unassigned'}
          </div>
        </div>
      )}
      detail={({ row: p }) => [
        ['Id', <span className="num">{p.id}</span>],
        ['Name', p.name || '—'],
        ['Address', <span className="num">{p.ip}</span>],
        ['Type', <span className="tag">{p.type}</span>],
        ['Assignee', p.assigneeId ? `${p.assigneeType} #${p.assigneeId}` : 'not assigned'],
        ['Auto delete', p.autoDelete ? 'yes — removed with the server' : 'no'],
        ['Location', `${p.location.city} · ${p.location.code}`],
        [
          'Reverse DNS',
          p.dns.length ? (
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {p.dns.map((d) => (
                <span key={d.ip} className="num">
                  {d.ip} → {d.dnsPtr || '—'}
                </span>
              ))}
            </span>
          ) : (
            '—'
          ),
        ],
        ['Created', ago(p.created)],
      ]}
      actions={(ctx) => (
        <IPActions
          ctx={ctx}
          assigned={ctx.row.assigneeId != null}
          act={(title, action, body) => ctx.act(title, PrimaryIPs.act(ctx.row.id, action, body))}
          onRename={(name) => PrimaryIPs.update(ctx.row.id, { name, autoDelete: ctx.row.autoDelete })}
          onDelete={() => PrimaryIPs.remove(ctx.row.id)}
          autoDelete={ctx.row.autoDelete}
          onAutoDelete={(v) => PrimaryIPs.update(ctx.row.id, { name: ctx.row.name, autoDelete: v })}
        />
      )}
      create={(ctx) => <PrimaryCreate close={ctx.close} mutate={ctx.mutate} />}
      createLabel="New IP"
    />
  )
}

function PrimaryCreate({ close, mutate }: { close: () => void; mutate: Ctx<PrimaryIP>['mutate'] }) {
  const catalog = useAsync(() => API.catalog(), [], { cache: CATALOG_CACHE })
  const { servers } = useServers()
  const [name, setName] = useState('')
  const [type, setType] = useState('ipv4')
  const [location, setLocation] = useState('')
  const [server, setServer] = useState('')
  const [autoDelete, setAutoDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const locations = catalog.data?.locations ?? []
  const loc = location || locations[0]?.name || ''
  const valid = name.trim().length > 0 && !!loc

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    const done = await mutate(
      'Create primary IP',
      PrimaryIPs.create({
        name: name.trim(),
        type,
        location: loc,
        autoDelete,
        assigneeId: server ? Number(server) : null,
        assigneeType: server ? 'server' : '',
      }),
    )
    setBusy(false)
    if (done) close()
  }

  return (
    <>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="web-1" />
      </Field>
      <Field label="Type">
        <Select
          value={type}
          onChange={setType}
          options={[
            { value: 'ipv4', label: 'IPv4' },
            { value: 'ipv6', label: 'IPv6' },
          ]}
        />
      </Field>
      <Field label="Location">
        <Select
          value={loc}
          onChange={setLocation}
          options={locations.map((l) => ({ value: l.name, label: `${l.city} · ${l.name}` }))}
        />
      </Field>
      <Field label="Assign now" hint="Leave empty to keep it free.">
        <Select
          value={server}
          onChange={setServer}
          options={[
            { value: '', label: 'Not assigned' },
            ...servers.map((s) => ({ value: String(s.id), label: `${s.name} · ${s.status}` })),
          ]}
        />
      </Field>
      <Toggle label="Delete together with the server" on={autoDelete} onChange={setAutoDelete} />
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 50, marginTop: 16 }}
        disabled={!valid || busy}
        onClick={() => void submit()}
      >
        Create primary IP
      </button>
    </>
  )
}

// ---- shared actions -----------------------------------------------------

interface IPish {
  id: number
  name: string
  ip: string
  dns: { ip: string; dnsPtr: string }[]
  protectDelete: boolean
}

function IPActions<T extends IPish>({
  ctx,
  assigned,
  act,
  onRename,
  onDelete,
  autoDelete,
  onAutoDelete,
}: {
  ctx: Ctx<T>
  assigned: boolean
  act: (title: string, action: string, body: unknown) => Promise<ActionResult | null>
  onRename: (name: string) => Promise<unknown>
  onDelete: () => Promise<unknown>
  autoDelete?: boolean
  onAutoDelete?: (v: boolean) => Promise<unknown>
}) {
  const [pane, setPane] = useState<'' | 'assign' | 'unassign' | 'dns' | 'rename'>('')
  const [name, setName] = useState(ctx.row.name)
  const confirm = useConfirm()
  const item = ctx.row

  return (
    <>
      {assigned ? (
        <Act tone="danger" onClick={() => setPane('unassign')}>
          Unassign
        </Act>
      ) : (
        <Act tone="primary" onClick={() => setPane('assign')}>
          Assign to server
        </Act>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <Act onClick={() => setPane('dns')}>Reverse DNS</Act>
        <Act onClick={() => setPane('rename')}>Rename</Act>
      </div>
      {onAutoDelete && (
        <Act onClick={() => void onAutoDelete(!autoDelete)}>
          {autoDelete ? 'Keep after delete' : 'Delete with the server'}
        </Act>
      )}
      <Act
        onClick={() =>
          void act(
            item.protectDelete ? 'Disable delete protection' : 'Enable delete protection',
            'change_protection',
            { protect: !item.protectDelete },
          )
        }
      >
        {item.protectDelete ? 'Allow delete' : 'Protect from delete'}
      </Act>
      <Act tone="danger" onClick={confirm.ask}>
        Delete IP
      </Act>

      {pane === 'assign' && (
        <AssignSheet ctx={ctx} act={(b) => act('Assign IP', 'assign', b)} onClose={() => setPane('')} />
      )}
      {pane === 'unassign' && (
        <UnassignSheet ctx={ctx} act={() => act('Unassign IP', 'unassign', {})} onClose={() => setPane('')} />
      )}
      {pane === 'dns' && (
        <DnsSheet ctx={ctx} act={(b) => act('Set reverse DNS', 'change_dns_ptr', b)} onClose={() => setPane('')} />
      )}
      {pane === 'rename' && (
        <Sheet open onClose={() => setPane('')} eyebrow="Address" title="Rename" sub={`Id ${item.id}`}>
          <Field label="Name">
            <TextInput value={name} onChange={setName} placeholder="vip-edge" />
          </Field>
          <button
            type="button"
            className="btn btn-red"
            style={{ width: '100%', height: 48 }}
            disabled={!name.trim()}
            onClick={() =>
              void ctx.mutate('Rename IP', onRename(name.trim())).then((d) => {
                if (d) setPane('')
              })
            }
          >
            Save
          </button>
        </Sheet>
      )}

      {confirm.dialog({
        eyebrow: 'Address',
        title: `Delete ${item.name || item.ip}?`,
        confirmLabel: 'Delete',
        onConfirm: () => {
          void ctx.mutate('Delete IP', onDelete(), { close: true })
        },
        children: 'The address is released back to Hetzner. Servers using it lose that interface.',
      })}
    </>
  )
}

function AssignSheet<T extends IPish>({
  ctx,
  act,
  onClose,
}: {
  ctx: Ctx<T>
  act: (body: unknown) => Promise<ActionResult | null>
  onClose: () => void
}) {
  const { servers } = useServers()
  const [pick, setPick] = useState('')

  return (
    <Sheet open onClose={onClose} eyebrow="Address" title="Assign to server" sub={ctx.row.ip}>
      <Field label="Server">
        <Select
          value={pick}
          onChange={setPick}
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
        disabled={!pick}
        onClick={() => {
          void act({ serverId: Number(pick), assigneeId: Number(pick), assigneeType: 'server' }).then((res) => {
            if (res) onClose()
          })
        }}
      >
        Assign
      </button>
    </Sheet>
  )
}

function UnassignSheet<T extends IPish>({
  ctx,
  act,
  onClose,
}: {
  ctx: Ctx<T>
  act: () => Promise<ActionResult | null>
  onClose: () => void
}) {
  return (
    <Sheet open onClose={onClose} eyebrow="Address" title="Unassign" sub={ctx.row.ip}>
      <p className="t2" style={{ fontSize: 13.5, lineHeight: 1.55, margin: 0 }}>
        The server loses this address until it is assigned again. The address itself stays in the project.
      </p>
      <button
        type="button"
        className="btn btn-dng"
        style={{ width: '100%', height: 48, marginTop: 18 }}
        onClick={() => {
          void act().then((res) => {
            if (res) onClose()
          })
        }}
      >
        Unassign
      </button>
    </Sheet>
  )
}

function DnsSheet<T extends IPish>({
  ctx,
  act,
  onClose,
}: {
  ctx: Ctx<T>
  act: (body: unknown) => Promise<ActionResult | null>
  onClose: () => void
}) {
  const [ip, setIp] = useState(ctx.row.dns[0]?.ip ?? ctx.row.ip)
  const [ptr, setPtr] = useState(ctx.row.dns[0]?.dnsPtr ?? '')

  return (
    <Sheet open onClose={onClose} eyebrow="Address" title="Reverse DNS" sub={ctx.row.ip}>
      <Field label="IP address">
        <TextInput value={ip} onChange={setIp} />
      </Field>
      <Field label="Hostname" hint="Leave empty to remove the pointer.">
        <TextInput value={ptr} onChange={setPtr} placeholder="web.example.com" />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 48 }}
        disabled={!ip.trim()}
        onClick={() =>
          void act({ ip: ip.trim(), dnsPtr: ptr.trim() }).then((res) => {
            if (res) onClose()
          })
        }
      >
        Save
      </button>
    </Sheet>
  )
}
