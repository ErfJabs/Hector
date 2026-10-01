import { useState } from 'react'
import { Firewalls } from '../../api'
import { ago } from '../../format'
import type { Firewall, FirewallRule } from '../../types'
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

const COLS = 'minmax(190px,1.4fr) minmax(90px,.5fr) minmax(140px,.9fr) minmax(110px,.6fr) minmax(110px,.7fr)'

const SSH_RULE: FirewallRule = {
  direction: 'in',
  protocol: 'tcp',
  port: '22',
  sources: ['0.0.0.0/0', '::/0'],
  destinations: [],
  description: 'SSH',
}

export default function FirewallsScreen() {
  return (
    <ResourceScreen<Firewall>
      cacheKey="firewalls"
      n="05"
      heading="Firewall"
      title="Firewalls"
      emptyCopy="No firewalls yet. One firewall can cover every server in the project."
      tabs={[
        { label: 'Networks', path: '/network', end: true },
        { label: 'Firewalls', path: '/network/firewalls' },
      ]}
      load={Firewalls.list}
      id={(f) => f.id}
      name={(f) => f.name}
      matches={(f, q) => f.name.toLowerCase().includes(q)}
      cols={[
        { key: 'name', head: 'Firewall', render: (f) => <b style={{ fontWeight: 600 }}>{f.name}</b> },
        { key: 'rules', head: 'Rules', render: (f) => <span className="num">{f.rules.length}</span> },
        {
          key: 'applied',
          head: 'Applied to',
          render: (f) =>
            f.appliedTo.length ? (
              <span className="num">
                {f.appliedTo.map((t) => (t.serverId ? `#${t.serverId}` : t.selector || t.type)).join(', ')}
              </span>
            ) : (
              <span className="t3">nothing</span>
            ),
        },
        { key: 'created', head: 'Created', render: (f) => <span className="num t3">{ago(f.created)}</span> },
        { key: 'labels', head: 'Labels', render: (f) => <span className="t3">{Object.keys(f.labels || {}).length}</span> },
      ]}
      grid={COLS}
      card={(f) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="tag">{f.rules.length} rules</span>
            <b style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {f.name}
            </b>
          </div>
          <div className="m t3" style={{ fontSize: 11, marginTop: 8 }}>
            {f.appliedTo.length
              ? `applied to ${f.appliedTo.map((t) => (t.serverId ? `#${t.serverId}` : t.selector || t.type)).join(', ')}`
              : 'not applied yet'}
          </div>
        </div>
      )}
      detail={({ row: f, act }) => [
        ['Id', <span className="num">{f.id}</span>],
        [
          'Rules',
          f.rules.length ? (
            <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {f.rules.map((r, i) => (
                <span key={`${r.protocol}-${r.port}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="num">
                    {r.direction} · {r.protocol} · {r.port || 'all'}
                  </span>
                  <span className="tag">{(r.sources[0] ?? r.destinations[0] ?? 'any').slice(0, 24)}</span>
                  <button
                    type="button"
                    className="btn btn-ico btn-bare"
                    style={{ width: 28, height: 28, color: 'var(--accent-soft)' }}
                    aria-label="Remove rule"
                    onClick={() =>
                      void act('Update rules', Firewalls.act(f.id, 'set_rules', { rules: f.rules.filter((_, k) => k !== i) }))
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </span>
          ) : (
            'none — everything is filtered by Hetzner defaults'
          ),
        ],
        [
          'Applied to',
          f.appliedTo.length
            ? f.appliedTo.map((t) => (t.serverId ? `server #${t.serverId}` : `${t.type} ${t.selector}`)).join(', ')
            : 'nothing',
        ],
        ['Created', ago(f.created)],
      ]}
      actions={(ctx) => <FirewallActions ctx={ctx} />}
      create={(ctx) => <FirewallCreate close={ctx.close} mutate={ctx.mutate} />}
      createLabel="New firewall"
    />
  )
}

function FirewallActions({ ctx }: { ctx: Ctx<Firewall> }) {
  const [pane, setPane] = useState<'' | 'rename' | 'rule' | 'apply' | 'unapply'>('')
  const confirm = useConfirm()
  const f = ctx.row

  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        <Act onClick={() => setPane('rename')}>Rename</Act>
        <Act onClick={() => setPane('rule')}>Add rule</Act>
      </div>
      <Act tone="primary" onClick={() => setPane('apply')}>
        Apply to servers
      </Act>
      {f.appliedTo.length > 0 && (
        <Act onClick={() => setPane('unapply')}>Remove from servers</Act>
      )}
      <Act tone="danger" onClick={confirm.ask}>
        Delete firewall
      </Act>

      {pane === 'rename' && <RenameSheet ctx={ctx} onClose={() => setPane('')} />}
      {pane === 'rule' && <RuleSheet ctx={ctx} onClose={() => setPane('')} />}
      {pane === 'apply' && <ApplySheet ctx={ctx} add onClose={() => setPane('')} />}
      {pane === 'unapply' && <ApplySheet ctx={ctx} onClose={() => setPane('')} />}

      {confirm.dialog({
        eyebrow: 'Firewall',
        title: `Delete ${f.name}?`,
        confirmLabel: 'Delete',
        onConfirm: () => {
          void ctx.mutate('Delete firewall', Firewalls.remove(f.id), { close: true })
        },
        children: 'Servers keep running — they simply lose this rule set.',
      })}
    </>
  )
}

function RenameSheet({ ctx, onClose }: { ctx: Ctx<Firewall>; onClose: () => void }) {
  const [name, setName] = useState(ctx.row.name)
  return (
    <Sheet open onClose={onClose} eyebrow="Firewall" title="Rename firewall" sub={`Id ${ctx.row.id}`}>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="edge" />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 48 }}
        disabled={!name.trim()}
        onClick={() =>
          void ctx.mutate('Rename firewall', Firewalls.update(ctx.row.id, { name: name.trim() })).then((d) => d && onClose())
        }
      >
        Save
      </button>
    </Sheet>
  )
}

const PROTOCOLS = ['tcp', 'udp', 'icmp', 'esp', 'ah']

function RuleSheet({ ctx, onClose }: { ctx: Ctx<Firewall>; onClose: () => void }) {
  const [direction, setDirection] = useState('in')
  const [protocol, setProtocol] = useState('tcp')
  const [port, setPort] = useState('22')
  const [source, setSource] = useState('0.0.0.0/0')

  const rule: FirewallRule = {
    direction,
    protocol,
    port: protocol === 'icmp' ? '' : port.trim(),
    sources: direction === 'in' ? source.split(',').map((s) => s.trim()).filter(Boolean) : [],
    destinations: direction === 'out' ? source.split(',').map((s) => s.trim()).filter(Boolean) : [],
    description: '',
  }
  const valid = rule.sources.length + rule.destinations.length > 0 && (protocol === 'icmp' || port.trim().length > 0)

  return (
    <Sheet open onClose={onClose} eyebrow="Firewall" title="Add rule" sub={ctx.row.name}>
      <Field label="Direction">
        <Select
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'in', label: 'Inbound — traffic coming in' },
            { value: 'out', label: 'Outbound — traffic going out' },
          ]}
        />
      </Field>
      <Field label="Protocol">
        <Select value={protocol} onChange={setProtocol} options={PROTOCOLS.map((p) => ({ value: p, label: p }))} />
      </Field>
      <Field label="Port" hint="A single port, a range like 8000-9000, or empty for all.">
        <TextInput value={port} onChange={setPort} placeholder="443" disabled={protocol === 'icmp'} />
      </Field>
      <Field label={direction === 'in' ? 'Allowed sources' : 'Allowed destinations'} hint="Comma-separated CIDRs.">
        <TextInput value={source} onChange={setSource} placeholder="0.0.0.0/0, ::/0" />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 48 }}
        disabled={!valid}
        onClick={() =>
          void ctx
            .act('Update rules', Firewalls.act(ctx.row.id, 'set_rules', { rules: [...ctx.row.rules, rule] }))
            .then((res) => res && onClose())
        }
      >
        Add rule
      </button>
      <p className="t3" style={{ fontSize: 12, marginTop: 14, lineHeight: 1.5 }}>
        Hetzner applies the whole set at once — adding a rule rewrites the firewall.
      </p>
    </Sheet>
  )
}

function ApplySheet({ ctx, add, onClose }: { ctx: Ctx<Firewall>; add?: boolean; onClose: () => void }) {
  const { servers } = useServers()
  const [pick, setPick] = useState('')

  const submit = () => {
    if (!pick) return
    void ctx
      .act(add ? 'Apply firewall' : 'Unapply firewall', Firewalls.act(ctx.row.id, add ? 'apply_to_resources' : 'remove_from_resources', { serverIds: [Number(pick)] }))
      .then((res) => {
        if (res) onClose()
      })
  }

  return (
    <Sheet open onClose={onClose} eyebrow="Firewall" title={add ? 'Apply to servers' : 'Remove from servers'} sub={ctx.row.name}>
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
      <button type="button" className="btn btn-red" style={{ width: '100%', height: 48 }} disabled={!pick} onClick={submit}>
        {add ? 'Apply' : 'Remove'}
      </button>
    </Sheet>
  )
}

function FirewallCreate({ close, mutate }: { close: () => void; mutate: Ctx<Firewall>['mutate'] }) {
  const [name, setName] = useState('')
  const [ssh, setSsh] = useState(true)
  const [busy, setBusy] = useState(false)
  const valid = name.trim().length > 0

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    const done = await mutate(
      'Create firewall',
      Firewalls.create({ name: name.trim(), rules: ssh ? [SSH_RULE] : [] }),
    )
    setBusy(false)
    if (done) close()
  }

  return (
    <>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="edge" />
      </Field>
      <Field label="Rules">
        <Toggle label="Allow inbound SSH (tcp/22, every address)" on={ssh} onChange={setSsh} />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 50 }}
        disabled={!valid || busy}
        onClick={() => void submit()}
      >
        Create firewall
      </button>
      <p className="t3" style={{ fontSize: 12, marginTop: 14, lineHeight: 1.5 }}>
        A new firewall does nothing until it is applied to at least one server.
      </p>
    </>
  )
}
