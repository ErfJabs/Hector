import { useState } from 'react'
import { API, CATALOG_CACHE, LoadBalancers } from '../../api'
import { useAsync } from '../../hooks'
import { ago } from '../../format'
import type { ActionResult, LoadBalancer } from '../../types'
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

const COLS = 'minmax(170px,1.3fr) minmax(90px,.5fr) minmax(130px,.8fr) minmax(100px,.5fr) minmax(120px,.7fr) minmax(110px,.7fr)'

const ALGORITHMS = [
  { value: 'round_robin', label: 'Round robin' },
  { value: 'least_conn', label: 'Least connections' },
]

const LB_TYPES = ['lb11', 'lb21', 'lb31']

export default function LoadBalancersScreen() {
  return (
    <ResourceScreen<LoadBalancer>
      cacheKey="load-balancers"
      n="08"
      heading="Balancer"
      title="Load balancers"
      emptyCopy="No load balancers yet. One spreads traffic across several servers behind a single address."
      load={LoadBalancers.list}
      id={(l) => l.id}
      name={(l) => l.name}
      matches={(l, q) => l.name.toLowerCase().includes(q) || l.ipv4.includes(q)}
      cols={[
        { key: 'name', head: 'Balancer', render: (l) => <b style={{ fontWeight: 600 }}>{l.name}</b> },
        { key: 'type', head: 'Type', render: (l) => <span className="tag">{l.type}</span> },
        { key: 'loc', head: 'Location', render: (l) => l.location.city || l.location.code },
        {
          key: 'public',
          head: 'Public',
          render: (l) => <span className={l.publicEnabled ? 'tag tag-run' : 'tag'}>{l.publicEnabled ? 'on' : 'off'}</span>,
        },
        { key: 'targets', head: 'Targets', render: (l) => <span className="num">{l.targets.length}</span> },
        { key: 'created', head: 'Created', render: (l) => <span className="t3">{ago(l.created)}</span> },
      ]}
      grid={COLS}
      card={(l) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="tag">{l.type}</span>
            <b style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {l.name}
            </b>
            <span className="num t3" style={{ fontSize: 13 }}>
              {l.targets.length} targets
            </span>
          </div>
          <div className="m t3 num" style={{ fontSize: 11, marginTop: 8 }}>
            {l.publicEnabled ? l.ipv4 : 'no public interface'} · {l.algorithm}
          </div>
        </div>
      )}
      detail={({ row: l }) => [
        ['Id', <span className="num">{l.id}</span>],
        ['Type', <span className="tag">{l.type}</span>],
        ['Location', `${l.location.city} · ${l.location.code}`],
        ['Algorithm', l.algorithm],
        ['Public', l.publicEnabled ? <span className="num">{l.ipv4}</span> : 'disabled'],
        [
          'Services',
          l.services.length
            ? l.services.map((s) => `${s.protocol} ${s.listenPort} → ${s.destinationPort}`).join(', ')
            : 'none',
        ],
        [
          'Targets',
          l.targets.length ? (
            <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {l.targets.map((t, i) => (
                <span key={`${t.type}-${t.serverId || t.selector || t.ip}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="num">{t.type === 'server' ? `#${t.serverId}` : t.selector || t.ip}</span>
                  <span className={t.healthStatus.some((h) => h.status === 'healthy') ? 'tag tag-run' : 'tag'}>
                    {t.healthStatus.map((h) => h.status).join(' ') || 'unknown'}
                  </span>
                </span>
              ))}
            </span>
          ) : (
            'none'
          ),
        ],
        ['Created', ago(l.created)],
      ]}
      actions={(ctx) => <LBActions ctx={ctx} />}
      create={(ctx) => <LBCreate close={ctx.close} mutate={ctx.mutate} />}
      createLabel="New balancer"
    />
  )
}

function LBActions({ ctx }: { ctx: Ctx<LoadBalancer> }) {
  const [pane, setPane] = useState<'' | 'rename' | 'target' | 'algorithm' | 'type'>('')
  const confirm = useConfirm()
  const l = ctx.row

  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        <Act onClick={() => setPane('rename')}>Rename</Act>
        <Act onClick={() => setPane('target')}>Add target</Act>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Act onClick={() => setPane('algorithm')}>Algorithm</Act>
        <Act onClick={() => setPane('type')}>Type</Act>
      </div>
      <Act
        onClick={() =>
          void ctx.act(
            l.publicEnabled ? 'Disable public interface' : 'Enable public interface',
            LoadBalancers.act(l.id, l.publicEnabled ? 'disable_public_interface' : 'enable_public_interface', {}),
          )
        }
      >
        {l.publicEnabled ? 'Disable public IP' : 'Enable public IP'}
      </Act>
      <Act
        onClick={() =>
          ctx.act(
            l.protectDelete ? 'Disable delete protection' : 'Enable delete protection',
            LoadBalancers.act(l.id, 'change_protection', { protect: !l.protectDelete }),
          )
        }
      >
        {l.protectDelete ? 'Allow delete' : 'Protect from delete'}
      </Act>
      <Act tone="danger" onClick={confirm.ask}>
        Delete balancer
      </Act>

      {pane === 'rename' && <RenameSheet ctx={ctx} onClose={() => setPane('')} />}
      {pane === 'target' && <TargetSheet ctx={ctx} onClose={() => setPane('')} />}
      {pane === 'algorithm' && (
        <PickSheet
          ctx={ctx}
          title="Algorithm"
          value={l.algorithm}
          options={ALGORITHMS}
          onSubmit={(v) => ctx.act('Change algorithm', LoadBalancers.act(l.id, 'change_algorithm', { algorithm: v }))}
          onClose={() => setPane('')}
        />
      )}
      {pane === 'type' && (
        <PickSheet
          ctx={ctx}
          title="Balancer type"
          value={l.type}
          options={LB_TYPES.map((t) => ({ value: t, label: t }))}
          onSubmit={(v) => ctx.act('Change type', LoadBalancers.act(l.id, 'change_type', { type: v }))}
          onClose={() => setPane('')}
        />
      )}

      {confirm.dialog({
        eyebrow: 'Balancer',
        title: `Delete ${l.name}?`,
        confirmLabel: 'Delete',
        onConfirm: () => {
          void ctx.act('Delete balancer', LoadBalancers.remove(l.id)).then((res) => {
            if (res) ctx.close()
          })
        },
        children: 'The public address disappears with it. Targets keep running.',
      })}
    </>
  )
}

function RenameSheet({ ctx, onClose }: { ctx: Ctx<LoadBalancer>; onClose: () => void }) {
  const [name, setName] = useState(ctx.row.name)
  return (
    <Sheet open onClose={onClose} eyebrow="Balancer" title="Rename" sub={`Id ${ctx.row.id}`}>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="edge" />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 48 }}
        disabled={!name.trim()}
        onClick={() =>
          void ctx.mutate('Rename balancer', LoadBalancers.update(ctx.row.id, { name: name.trim() })).then((d) => d && onClose())
        }
      >
        Save
      </button>
    </Sheet>
  )
}

function PickSheet({
  ctx,
  title,
  value,
  options,
  onSubmit,
  onClose,
}: {
  ctx: Ctx<LoadBalancer>
  title: string
  value: string
  options: { value: string; label: string }[]
  onSubmit: (v: string) => Promise<ActionResult | null>
  onClose: () => void
}) {
  const [pick, setPick] = useState(value)
  return (
    <Sheet open onClose={onClose} eyebrow="Balancer" title={title} sub={ctx.row.name}>
      <Field label={title}>
        <Select value={pick} onChange={setPick} options={options} />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 48 }}
        onClick={() => void onSubmit(pick).then((res) => { if (res) onClose() })}
      >
        Save
      </button>
    </Sheet>
  )
}

function TargetSheet({ ctx, onClose }: { ctx: Ctx<LoadBalancer>; onClose: () => void }) {
  const { servers } = useServers()
  const [kind, setKind] = useState('server')
  const [server, setServer] = useState('')
  const [selector, setSelector] = useState('')
  const [ip, setIp] = useState('')

  const valid = kind === 'server' ? !!server : kind === 'label_selector' ? selector.trim().length > 0 : ip.trim().length > 0

  const submit = () => {
    if (!valid) return
    const body =
      kind === 'server'
        ? { type: 'server', serverId: Number(server) }
        : kind === 'label_selector'
          ? { type: 'label_selector', selector: selector.trim() }
          : { type: 'ip', ip: ip.trim() }
    void ctx.act('Add target', LoadBalancers.act(ctx.row.id, 'add_target', body)).then((res) => {
      if (res) onClose()
    })
  }

  return (
    <Sheet open onClose={onClose} eyebrow="Balancer" title="Add target" sub={ctx.row.name}>
      <Field label="Target kind">
        <Select
          value={kind}
          onChange={setKind}
          options={[
            { value: 'server', label: 'A server' },
            { value: 'label_selector', label: 'Servers by label' },
            { value: 'ip', label: 'An IP address' },
          ]}
        />
      </Field>
      {kind === 'server' && (
        <Field label="Server">
          <Select
            value={server}
            onChange={setServer}
            options={[
              { value: '', label: servers.length ? 'Pick a server…' : 'No servers in this project' },
              ...servers.map((s) => ({ value: String(s.id), label: `${s.name} · ${s.status}` })),
            ]}
          />
        </Field>
      )}
      {kind === 'label_selector' && (
        <Field label="Label selector" hint="For example role=web.">
          <TextInput value={selector} onChange={setSelector} placeholder="role=web" />
        </Field>
      )}
      {kind === 'ip' && (
        <Field label="IP address" hint="Must be routable from the balancer's network.">
          <TextInput value={ip} onChange={setIp} placeholder="10.0.0.10" />
        </Field>
      )}
      <button type="button" className="btn btn-red" style={{ width: '100%', height: 48 }} disabled={!valid} onClick={submit}>
        Add target
      </button>
      {ctx.row.targets.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <span className="lbl">Remove a target</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ctx.row.targets.map((t, i) => (
              <button
                key={`${t.type}-${t.serverId || t.selector || t.ip}-${i}`}
                type="button"
                className="btn btn-line"
                style={{ height: 40, justifyContent: 'space-between' }}
                onClick={() =>
                  void ctx.act(
                    'Remove target',
                    LoadBalancers.act(ctx.row.id, 'remove_target', {
                      type: t.type,
                      serverId: t.serverId,
                      selector: t.selector,
                      ip: t.ip,
                    }),
                  )
                }
              >
                <span className="num">{t.type === 'server' ? `#${t.serverId}` : t.selector || t.ip}</span>
                <span className="t3">Remove</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  )
}

function LBCreate({ close, mutate }: { close: () => void; mutate: Ctx<LoadBalancer>['mutate'] }) {
  const catalog = useAsync(() => API.catalog(), [], { cache: CATALOG_CACHE })
  const [name, setName] = useState('')
  const [type, setType] = useState('lb11')
  const [algorithm, setAlgorithm] = useState('round_robin')
  const [location, setLocation] = useState('')
  const [busy, setBusy] = useState(false)
  const locations = catalog.data?.locations ?? []
  const loc = location || locations[0]?.name || ''
  const valid = name.trim().length > 0 && !!loc

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    const done = await mutate(
      'Create balancer',
      LoadBalancers.create({ name: name.trim(), type, location: loc, algorithm }),
    )
    setBusy(false)
    if (done) close()
  }

  return (
    <>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="edge" />
      </Field>
      <Field label="Type" hint="lb11 is enough for most setups; lb21/lb31 add more connections per second.">
        <Select value={type} onChange={setType} options={LB_TYPES.map((t) => ({ value: t, label: t }))} />
      </Field>
      <Field label="Algorithm">
        <Select value={algorithm} onChange={setAlgorithm} options={ALGORITHMS} />
      </Field>
      <Field label="Location">
        <Select
          value={loc}
          onChange={setLocation}
          options={locations.map((l) => ({ value: l.name, label: `${l.city} · ${l.name}` }))}
        />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 50 }}
        disabled={!valid || busy}
        onClick={() => void submit()}
      >
        Create balancer
      </button>
      <div className="t3" style={{ fontSize: 12, marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatusTag status="pending" />
        No services or targets yet — add them from the balancer's sheet.
      </div>
    </>
  )
}
