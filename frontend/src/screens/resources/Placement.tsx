import { useState } from 'react'
import { PlacementGroups } from '../../api'
import { ago } from '../../format'
import type { PlacementGroup } from '../../types'
import { Act, Field, ResourceScreen, Select, Sheet, TextInput, useConfirm, type Ctx } from '../../components/resource'

const COLS = 'minmax(190px,1.4fr) minmax(120px,.7fr) minmax(180px,1.2fr) minmax(110px,.7fr)'

const TYPES = [
  { value: 'spread', label: 'Spread — keep servers on different hosts' },
  { value: 'fanout', label: 'Fanout — spread across hosts in different racks' },
]

export default function PlacementScreen() {
  return (
    <ResourceScreen<PlacementGroup>
      cacheKey="placement-groups"
      n="11"
      heading="Placement"
      title="Placement groups"
      emptyCopy="No placement groups yet. One keeps servers off the same physical host."
      load={PlacementGroups.list}
      id={(g) => g.id}
      name={(g) => g.name}
      matches={(g, q) => g.name.toLowerCase().includes(q) || g.type.includes(q)}
      cols={[
        { key: 'name', head: 'Group', render: (g) => <b style={{ fontWeight: 600 }}>{g.name}</b> },
        { key: 'type', head: 'Type', render: (g) => <span className="tag">{g.type}</span> },
        {
          key: 'servers',
          head: 'Servers',
          render: (g) => <span className="num">{g.serverIds.length ? g.serverIds.map((id) => `#${id}`).join(', ') : '—'}</span>,
        },
        { key: 'created', head: 'Created', render: (g) => <span className="t3">{ago(g.created)}</span> },
      ]}
      grid={COLS}
      card={(g) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="tag">{g.type}</span>
            <b style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {g.name}
            </b>
          </div>
          <div className="m t3" style={{ fontSize: 11, marginTop: 8 }}>
            {g.serverIds.length ? `${g.serverIds.length} servers` : 'no servers yet'}
          </div>
        </div>
      )}
      detail={({ row: g }) => [
        ['Id', <span className="num">{g.id}</span>],
        ['Type', <span className="tag">{g.type}</span>],
        ['Servers', g.serverIds.length ? g.serverIds.map((id) => `#${id}`).join(', ') : 'none'],
        ['Created', ago(g.created)],
        ['Note', 'Servers join a group when they are created or rescaled — not afterwards.'],
      ]}
      actions={(ctx) => <PlacementActions ctx={ctx} />}
      create={(ctx) => <PlacementCreate close={ctx.close} mutate={ctx.mutate} />}
      createLabel="New group"
    />
  )
}

function PlacementActions({ ctx }: { ctx: Ctx<PlacementGroup> }) {
  const [renaming, setRenaming] = useState(false)
  const confirm = useConfirm()
  const g = ctx.row

  return (
    <>
      <Act onClick={() => setRenaming(true)}>Rename</Act>
      <Act tone="danger" onClick={confirm.ask}>
        Delete group
      </Act>

      {renaming && <RenameSheet ctx={ctx} onClose={() => setRenaming(false)} />}
      {confirm.dialog({
        eyebrow: 'Placement',
        title: `Delete ${g.name}?`,
        confirmLabel: 'Delete',
        onConfirm: () => void ctx.mutate('Delete placement group', PlacementGroups.remove(g.id), { close: true }),
        children: 'The servers in it keep running; they just stop being pinned apart.',
      })}
    </>
  )
}

function RenameSheet({ ctx, onClose }: { ctx: Ctx<PlacementGroup>; onClose: () => void }) {
  const [name, setName] = useState(ctx.row.name)
  return (
    <Sheet open onClose={onClose} eyebrow="Placement" title="Rename group" sub={`Id ${ctx.row.id}`}>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="ha-pair" />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 48 }}
        disabled={!name.trim()}
        onClick={() =>
          void ctx
            .mutate('Rename placement group', PlacementGroups.update(ctx.row.id, { name: name.trim() }))
            .then((d) => d && onClose())
        }
      >
        Save
      </button>
    </Sheet>
  )
}

function PlacementCreate({ close, mutate }: { close: () => void; mutate: Ctx<PlacementGroup>['mutate'] }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('spread')
  const [busy, setBusy] = useState(false)
  const valid = name.trim().length > 0

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    const done = await mutate('Create placement group', PlacementGroups.create({ name: name.trim(), type }))
    setBusy(false)
    if (done) close()
  }

  return (
    <>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="ha-pair" />
      </Field>
      <Field label="Type">
        <Select value={type} onChange={setType} options={TYPES} />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 50 }}
        disabled={!valid || busy}
        onClick={() => void submit()}
      >
        Create group
      </button>
      <p className="t3" style={{ fontSize: 12, marginTop: 14, lineHeight: 1.5 }}>
        Pick the group while creating a server — the API won't move an existing server into one.
      </p>
    </>
  )
}
