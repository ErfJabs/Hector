import { useState } from 'react'
import { Certificates, SSHKeys } from '../../api'
import { copyText } from '../../hooks'
import { ago } from '../../format'
import type { Certificate, SSHKey } from '../../types'
import {
  Act,
  Field,
  ResourceScreen,
  Select,
  Sheet,
  StatusTag,
  TextArea,
  TextInput,
  useConfirm,
  type Ctx,
} from '../../components/resource'

const tabs = [
  { label: 'SSH keys', path: '/access', end: true },
  { label: 'Certificates', path: '/access/certificates' },
]

const KEY_COLS = 'minmax(190px,1.4fr) minmax(280px,1.6fr) minmax(110px,.7fr) minmax(110px,.7fr)'
const CERT_COLS = 'minmax(180px,1.3fr) minmax(100px,.6fr) minmax(200px,1.4fr) minmax(120px,.7fr) minmax(120px,.7fr)'

// ---- SSH keys -----------------------------------------------------------

export function SSHKeysScreen() {
  return (
    <ResourceScreen<SSHKey>
      cacheKey="ssh-keys"
      n="09"
      heading="Access"
      title="SSH keys"
      emptyCopy="No SSH keys yet. Add the public key you actually log in with."
      tabs={tabs}
      load={SSHKeys.list}
      id={(k) => k.id}
      name={(k) => k.name}
      matches={(k, q) => k.name.toLowerCase().includes(q) || k.fingerprint.toLowerCase().includes(q)}
      cols={[
        { key: 'name', head: 'Key', render: (k) => <b style={{ fontWeight: 600 }}>{k.name}</b> },
        { key: 'fp', head: 'Fingerprint', render: (k) => <span className="num t2">{k.fingerprint}</span> },
        { key: 'created', head: 'Added', render: (k) => <span className="t3">{ago(k.created)}</span> },
        { key: 'labels', head: 'Labels', render: (k) => <span className="t3">{Object.keys(k.labels || {}).length}</span> },
      ]}
      grid={KEY_COLS}
      card={(k) => (
        <div>
          <b style={{ fontSize: 15, fontWeight: 600 }}>{k.name}</b>
          <div className="m t3 num" style={{ fontSize: 11, marginTop: 8 }}>
            {k.fingerprint}
          </div>
        </div>
      )}
      detail={({ row: k }) => [
        ['Id', <span className="num">{k.id}</span>],
        ['Fingerprint', <span className="num">{k.fingerprint}</span>],
        ['Added', ago(k.created)],
        ['Public key', <PublicBlock text={k.publicKey} />],
      ]}
      actions={(ctx) => <KeyActions ctx={ctx} />}
      create={(ctx) => <KeyCreate close={ctx.close} mutate={ctx.mutate} />}
      createLabel="Add key"
    />
  )
}

function PublicBlock({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <span style={{ display: 'block' }}>
      <span
        className="m"
        style={{ display: 'block', fontSize: 11.5, lineHeight: 1.5, wordBreak: 'break-all', color: 'var(--t2)' }}
      >
        {text}
      </span>
      <button
        type="button"
        className="btn btn-sm btn-line"
        style={{ marginTop: 8 }}
        onClick={() =>
          void copyText(text).then((ok) => {
            setDone(ok)
            window.setTimeout(() => setDone(false), 1500)
          })
        }
      >
        {done ? 'Copied' : 'Copy'}
      </button>
    </span>
  )
}

function KeyActions({ ctx }: { ctx: Ctx<SSHKey> }) {
  const [renaming, setRenaming] = useState(false)
  const confirm = useConfirm()
  const k = ctx.row

  return (
    <>
      <Act onClick={() => setRenaming(true)}>Rename</Act>
      <Act tone="danger" onClick={confirm.ask}>
        Remove key
      </Act>

      {renaming && (
        <RenameSheet ctx={ctx} onClose={() => setRenaming(false)} title="Rename key" />
      )}
      {confirm.dialog({
        eyebrow: 'Access',
        title: `Remove ${k.name}?`,
        confirmLabel: 'Remove',
        onConfirm: () => void ctx.mutate('Remove SSH key', SSHKeys.remove(k.id), { close: true }),
        children: 'Servers already created with this key keep their authorized_keys; new servers just stop seeing it.',
      })}
    </>
  )
}

function RenameSheet({
  ctx,
  onClose,
  title,
}: {
  ctx: Ctx<SSHKey>
  onClose: () => void
  title: string
}) {
  const [name, setName] = useState(ctx.row.name)
  return (
    <Sheet open onClose={onClose} eyebrow="Access" title={title} sub={`Id ${ctx.row.id}`}>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="laptop" />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 48 }}
        disabled={!name.trim()}
        onClick={() =>
          void ctx.mutate('Rename SSH key', SSHKeys.update(ctx.row.id, { name: name.trim() })).then((d) => d && onClose())
        }
      >
        Save
      </button>
    </Sheet>
  )
}

function KeyCreate({ close, mutate }: { close: () => void; mutate: Ctx<SSHKey>['mutate'] }) {
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const valid = name.trim().length > 0 && /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp\d+)\s+\S+/.test(key.trim())

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    const done = await mutate('Add SSH key', SSHKeys.create({ name: name.trim(), publicKey: key.trim() }))
    setBusy(false)
    if (done) close()
  }

  return (
    <>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="laptop" />
      </Field>
      <Field label="Public key" hint="The whole line from ~/.ssh/id_ed25519.pub. Never paste a private key here.">
        <TextArea value={key} onChange={setKey} placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA… me@host" />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 50 }}
        disabled={!valid || busy}
        onClick={() => void submit()}
      >
        Add key
      </button>
    </>
  )
}

// ---- certificates -------------------------------------------------------

export function CertificatesScreen() {
  return (
    <ResourceScreen<Certificate>
      cacheKey="certificates"
      n="10"
      heading="Access"
      title="Certificates"
      emptyCopy="No certificates yet. Managed ones are issued and renewed automatically."
      tabs={tabs}
      load={Certificates.list}
      id={(c) => c.id}
      name={(c) => c.name}
      matches={(c, q) => c.name.toLowerCase().includes(q) || c.domainNames.join(' ').toLowerCase().includes(q)}
      cols={[
        { key: 'name', head: 'Certificate', render: (c) => <b style={{ fontWeight: 600 }}>{c.name}</b> },
        { key: 'type', head: 'Type', render: (c) => <span className="tag">{c.type}</span> },
        { key: 'domains', head: 'Domains', render: (c) => <span className="cell-ov t2">{c.domainNames.join(', ')}</span> },
        { key: 'issuance', head: 'Issuance', render: (c) => <StatusTag status={c.issuance} /> },
        { key: 'expiry', head: 'Expires', render: (c) => <span className="t3">{ago(c.notValidAfter)}</span> },
      ]}
      grid={CERT_COLS}
      card={(c) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusTag status={c.issuance} />
            <b style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {c.name}
            </b>
          </div>
          <div className="m t3" style={{ fontSize: 11, marginTop: 8 }}>
            {c.domainNames.join(', ')}
          </div>
        </div>
      )}
      detail={({ row: c }) => [
        ['Id', <span className="num">{c.id}</span>],
        ['Type', <span className="tag">{c.type}</span>],
        ['Domains', c.domainNames.join(', ') || '—'],
        ['Issuance', <StatusTag status={c.issuance} />],
        ['Renewal', c.renewal || '—'],
        ['Valid from', ago(c.notValidBefore)],
        ['Valid until', ago(c.notValidAfter)],
        ['Fingerprint', <span className="num">{c.fingerprint}</span>],
        [
          'Used by',
          c.usedBy.length ? c.usedBy.map((u) => `${u.type} #${u.id}`).join(', ') : 'nothing',
        ],
        c.issuanceError ? ['Issuance error', <span className="red">{c.issuanceError}</span>] : ['Created', ago(c.created)],
      ]}
      actions={(ctx) => <CertActions ctx={ctx} />}
      create={(ctx) => <CertCreate close={ctx.close} mutate={ctx.mutate} />}
      createLabel="New certificate"
    />
  )
}

function CertActions({ ctx }: { ctx: Ctx<Certificate> }) {
  const [renaming, setRenaming] = useState(false)
  const confirm = useConfirm()
  const c = ctx.row

  return (
    <>
      <Act onClick={() => setRenaming(true)}>Rename</Act>
      {c.type === 'managed' && (
        <Act onClick={() => void ctx.act('Retry issuance', Certificates.retry(c.id))}>Retry issuance</Act>
      )}
      <Act tone="danger" onClick={confirm.ask}>
        Delete certificate
      </Act>

      {renaming && <RenameCert ctx={ctx} onClose={() => setRenaming(false)} />}

      {confirm.dialog({
        eyebrow: 'Access',
        title: `Delete ${c.name}?`,
        confirmLabel: 'Delete',
        onConfirm: () => void ctx.mutate('Delete certificate', Certificates.remove(c.id), { close: true }),
        children: 'Load balancer services pointing at it lose TLS until you attach another one.',
      })}
    </>
  )
}

function RenameCert({ ctx, onClose }: { ctx: Ctx<Certificate>; onClose: () => void }) {
  const [name, setName] = useState(ctx.row.name)
  return (
    <Sheet open onClose={onClose} eyebrow="Access" title="Rename certificate" sub={`Id ${ctx.row.id}`}>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="edge-tls" />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 48 }}
        disabled={!name.trim()}
        onClick={() =>
          void ctx.mutate('Rename certificate', Certificates.update(ctx.row.id, { name: name.trim() })).then((d) => d && onClose())
        }
      >
        Save
      </button>
    </Sheet>
  )
}

function CertCreate({ close, mutate }: { close: () => void; mutate: Ctx<Certificate>['mutate'] }) {
  const [type, setType] = useState('managed')
  const [name, setName] = useState('')
  const [domains, setDomains] = useState('')
  const [cert, setCert] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)

  const domainList = domains
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean)
  const valid =
    name.trim().length > 0 &&
    (type === 'managed' ? domainList.length > 0 : cert.trim().length > 0 && key.trim().length > 0)

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    const body =
      type === 'managed'
        ? { name: name.trim(), type, domainNames: domainList }
        : { name: name.trim(), type, certificate: cert.trim(), privateKey: key.trim() }
    const done = await mutate('Create certificate', Certificates.create(body))
    setBusy(false)
    if (done) close()
  }

  return (
    <>
      <Field label="Type">
        <Select
          value={type}
          onChange={setType}
          options={[
            { value: 'managed', label: 'Managed — issued and renewed for us' },
            { value: 'uploaded', label: 'Uploaded — we bring the PEM pair' },
          ]}
        />
      </Field>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="edge-tls" />
      </Field>
      {type === 'managed' ? (
        <Field label="Domains" hint="Comma separated. DNS for each one must already point at Hetzner.">
          <TextInput value={domains} onChange={setDomains} placeholder="example.com, www.example.com" />
        </Field>
      ) : (
        <>
          <Field label="Certificate (PEM)">
            <TextArea value={cert} onChange={setCert} placeholder={'-----BEGIN CERTIFICATE-----\n…'} />
          </Field>
          <Field label="Private key (PEM)" hint="Stored in the project, never shown again.">
            <TextArea value={key} onChange={setKey} placeholder={'-----BEGIN PRIVATE KEY-----\n…'} />
          </Field>
        </>
      )}
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 50 }}
        disabled={!valid || busy}
        onClick={() => void submit()}
      >
        Create certificate
      </button>
    </>
  )
}
