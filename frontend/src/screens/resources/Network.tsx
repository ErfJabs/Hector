import { useState } from 'react'
import { Networks } from '../../api'
import { ago } from '../../format'
import type { Network } from '../../types'
import {
  Act,
  Field,
  ResourceScreen,
  Select,
  Sheet,
  StatusTag,
  TextInput,
  useConfirm,
  type Ctx,
} from '../../components/resource'

const COLS = 'minmax(170px,1.3fr) minmax(150px,1fr) minmax(90px,.5fr) minmax(90px,.5fr) minmax(110px,.6fr) minmax(110px,.7fr)'

export default function NetworkScreen() {
  return (
    <ResourceScreen<Network>
      cacheKey="networks"
      n="04"
      heading="Network"
      title="Networks"
      emptyCopy="This project has no private networks yet."
      tabs={[
        { label: 'Networks', path: '/network', end: true },
        { label: 'Firewalls', path: '/network/firewalls' },
      ]}
      load={Networks.list}
      id={(n) => n.id}
      name={(n) => n.name}
      matches={(n, q) => n.name.toLowerCase().includes(q) || n.ipRange.includes(q)}
      cols={[
        { key: 'name', head: 'Network', render: (n) => <b style={{ fontWeight: 600 }}>{n.name}</b> },
        { key: 'range', head: 'IP range', render: (n) => <span className="num">{n.ipRange}</span> },
        { key: 'subnets', head: 'Subnets', render: (n) => <span className="num">{n.subnets.length}</span> },
        { key: 'servers', head: 'Servers', render: (n) => <span className="num">{n.servers.length}</span> },
        {
          key: 'protect',
          head: 'Protection',
          render: (n) => <span className={n.protectDelete ? 'tag tag-run' : 'tag'}>{n.protectDelete ? 'on' : 'off'}</span>,
        },
        { key: 'created', head: 'Created', render: (n) => <span className="t3">{ago(n.created)}</span> },
      ]}
      grid={COLS}
      card={(n) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="tag">{n.subnets.length} subnets</span>
            <b style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {n.name}
            </b>
          </div>
          <div className="m t3 num" style={{ fontSize: 12, marginTop: 8 }}>
            {n.ipRange} · {n.servers.length} servers
          </div>
        </div>
      )}
      detail={({ row: n, act }) => [
        ['Id', <span className="num">{n.id}</span>],
        ['IP range', <span className="num">{n.ipRange}</span>],
        [
          'Subnets',
          n.subnets.length ? (
            <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {n.subnets.map((s) => (
                <span key={s.ipRange} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="num">{s.ipRange}</span>
                  <span className="tag">{s.networkZone}</span>
                  <button
                    type="button"
                    className="btn btn-ico btn-bare"
                    style={{ width: 28, height: 28, color: 'var(--accent-soft)' }}
                    aria-label={`Delete subnet ${s.ipRange}`}
                    onClick={() => void act('Delete subnet', Networks.act(n.id, 'delete_subnet', { ipRange: s.ipRange }))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </span>
          ) : (
            'none'
          ),
        ],
        [
          'Routes',
          n.routes.length ? (
            <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {n.routes.map((r) => (
                <span key={r.destination} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="num">
                    {r.destination} → {r.gateway}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ico btn-bare"
                    style={{ width: 28, height: 28, color: 'var(--accent-soft)' }}
                    aria-label={`Delete route ${r.destination}`}
                    onClick={() =>
                      void act('Delete route', Networks.act(n.id, 'delete_route', { destination: r.destination, gateway: r.gateway }))
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </span>
          ) : (
            'none'
          ),
        ],
        ['Servers', n.servers.length ? n.servers.map((id) => `#${id}`).join(', ') : 'none'],
        ['Load balancers', n.loadBalancers.length ? n.loadBalancers.map((id) => `#${id}`).join(', ') : 'none'],
        ['Created', ago(n.created)],
      ]}
      actions={(ctx) => <NetworkActions ctx={ctx} />}
      create={(ctx) => <NetworkCreate close={ctx.close} mutate={ctx.mutate} />}
      createLabel="New network"
    />
  )
}

function NetworkActions({ ctx }: { ctx: Ctx<Network> }) {
  const [pane, setPane] = useState<'' | 'rename' | 'subnet' | 'route'>('')
  const confirm = useConfirm()
  const n = ctx.row

  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        <Act onClick={() => setPane('rename')}>Rename</Act>
        <Act onClick={() => setPane('subnet')}>Add subnet</Act>
      </div>
      <Act onClick={() => setPane('route')}>Add route</Act>
      <Act
        onClick={() =>
          ctx.act(n.protectDelete ? 'Disable delete protection' : 'Enable delete protection', Networks.act(n.id, 'change_protection', { protect: !n.protectDelete }))
        }
      >
        {n.protectDelete ? 'Allow delete' : 'Protect from delete'}
      </Act>
      <Act tone="danger" onClick={confirm.ask}>
        Delete network
      </Act>

      {pane === 'rename' && <RenameSheet ctx={ctx} onClose={() => setPane('')} />}
      {pane === 'subnet' && <SubnetSheet ctx={ctx} onClose={() => setPane('')} />}
      {pane === 'route' && <RouteSheet ctx={ctx} onClose={() => setPane('')} />}

      {confirm.dialog({
        eyebrow: 'Network',
        title: `Delete ${n.name}?`,
        confirmLabel: 'Delete',
        onConfirm: () => {
          void ctx.act('Delete network', Networks.remove(n.id)).then((res) => {
            if (res) ctx.close()
          })
        },
        children: 'Every server attached to it loses its private interface. Hetzner refuses while members remain.',
      })}
    </>
  )
}

function RenameSheet({ ctx, onClose }: { ctx: Ctx<Network>; onClose: () => void }) {
  const [name, setName] = useState(ctx.row.name)
  return (
    <Sheet open onClose={onClose} eyebrow="Network" title="Rename network" sub={`Id ${ctx.row.id}`}>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="backend" />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 48 }}
        disabled={!name.trim()}
        onClick={() =>
          void ctx.mutate('Rename network', Networks.update(ctx.row.id, { name: name.trim() })).then((d) => d && onClose())
        }
      >
        Save
      </button>
    </Sheet>
  )
}

const ZONES = ['eu-central', 'us-east', 'us-west']

function SubnetSheet({ ctx, onClose }: { ctx: Ctx<Network>; onClose: () => void }) {
  const [ip, setIp] = useState('')
  const [zone, setZone] = useState('eu-central')
  const valid = /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(ip.trim())

  return (
    <Sheet open onClose={onClose} eyebrow="Network" title="Add subnet" sub={ctx.row.name}>
      <Field label="IP range" hint="Inside the network's range, for example 10.0.1.0/24.">
        <TextInput value={ip} onChange={setIp} placeholder="10.0.1.0/24" />
      </Field>
      <Field label="Zone">
        <Select value={zone} onChange={setZone} options={ZONES.map((z) => ({ value: z, label: z }))} />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 48 }}
        disabled={!valid}
        onClick={() =>
          void ctx
            .act('Add subnet', Networks.act(ctx.row.id, 'add_subnet', { ipRange: ip.trim(), networkZone: zone, type: 'cloud' }))
            .then((res) => res && onClose())
        }
      >
        Add subnet
      </button>
    </Sheet>
  )
}

function RouteSheet({ ctx, onClose }: { ctx: Ctx<Network>; onClose: () => void }) {
  const [dest, setDest] = useState('')
  const [gateway, setGateway] = useState('')
  const valid = dest.trim().length > 0 && gateway.trim().length > 0

  return (
    <Sheet open onClose={onClose} eyebrow="Network" title="Add route" sub={ctx.row.name}>
      <Field label="Destination" hint="The CIDR that should be routed, e.g. 172.16.0.0/16.">
        <TextInput value={dest} onChange={setDest} placeholder="172.16.0.0/16" />
      </Field>
      <Field label="Gateway" hint="Must be an address inside the network.">
        <TextInput value={gateway} onChange={setGateway} placeholder="10.0.0.1" />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 48 }}
        disabled={!valid}
        onClick={() =>
          void ctx
            .act('Add route', Networks.act(ctx.row.id, 'add_route', { destination: dest.trim(), gateway: gateway.trim() }))
            .then((res) => res && onClose())
        }
      >
        Add route
      </button>
    </Sheet>
  )
}

function NetworkCreate({ close, mutate }: { close: () => void; mutate: Ctx<Network>['mutate'] }) {
  const [name, setName] = useState('')
  const [range, setRange] = useState('10.0.0.0/8')
  const [subnet, setSubnet] = useState('10.0.0.0/24')
  const [zone, setZone] = useState('eu-central')
  const [busy, setBusy] = useState(false)

  const valid = name.trim().length > 0 && /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(range.trim())

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    const done = await mutate(
      'Create network',
      Networks.create({ name: name.trim(), ipRange: range.trim(), subnetIpRange: subnet.trim(), subnetZone: zone }),
    )
    setBusy(false)
    if (done) close()
  }

  return (
    <>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="backend" />
      </Field>
      <Field label="Network range" hint="The whole private range. Servers get addresses from inside it.">
        <TextInput value={range} onChange={setRange} placeholder="10.0.0.0/8" />
      </Field>
      <Field label="First subnet" hint="Leave empty to create the network without a subnet.">
        <TextInput value={subnet} onChange={setSubnet} placeholder="10.0.0.0/24" />
      </Field>
      <Field label="Zone">
        <Select value={zone} onChange={setZone} options={ZONES.map((z) => ({ value: z, label: z }))} />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 50 }}
        disabled={!valid || busy}
        onClick={() => void submit()}
      >
        Create network
      </button>
      <div className="t3" style={{ fontSize: 12, marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatusTag status="ready" />
        Usable as soon as the network exists — attach servers from their network tab.
      </div>
    </>
  )
}
