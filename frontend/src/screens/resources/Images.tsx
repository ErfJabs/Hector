import { useState } from 'react'
import { Images } from '../../api'
import { ago } from '../../format'
import type { Image } from '../../types'
import { Act, Field, ResourceScreen, Sheet, StatusTag, TextInput, useConfirm, type Ctx } from '../../components/resource'

const COLS = 'minmax(190px,1.5fr) minmax(110px,.7fr) minmax(150px,.9fr) minmax(110px,.6fr) minmax(90px,.5fr) minmax(110px,.7fr)'

const deletable = (i: Image) => i.type === 'snapshot' || i.type === 'backup'

export default function ImagesScreen() {
  return (
    <ResourceScreen<Image>
      cacheKey="images"
      n="03"
      heading="Images"
      title="Images"
      emptyCopy="No snapshots or backups yet. Take one from a server's manage tab."
      load={() => Images.list()}
      id={(i) => i.id}
      name={(i) => i.description || i.name}
      matches={(i, q) => (i.description || i.name).toLowerCase().includes(q) || i.osFlavor.includes(q)}
      chips={[
        { id: '', label: 'All', test: () => true },
        { id: 'snapshot', label: 'Snapshots', test: (i) => i.type === 'snapshot' },
        { id: 'backup', label: 'Backups', test: (i) => i.type === 'backup' },
        { id: 'system', label: 'System', test: (i) => i.type === 'system' },
      ]}
      cols={[
        {
          key: 'name',
          head: 'Image',
          render: (i) => (
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <b style={{ fontWeight: 600 }}>{i.description || i.name}</b>
              <span className="m t3" style={{ fontSize: 11 }}>
                {i.name}
              </span>
            </span>
          ),
        },
        { key: 'type', head: 'Type', render: (i) => <span className="tag">{i.type}</span> },
        {
          key: 'os',
          head: 'System',
          render: (i) => (
            <span className="t2">
              {i.osFlavor} {i.osVersion}
            </span>
          ),
        },
        { key: 'status', head: 'Status', render: (i) => <StatusTag status={i.status} /> },
        { key: 'size', head: 'Size', render: (i) => <span className="num">{i.sizeGb} GB</span> },
        { key: 'created', head: 'Created', render: (i) => <span className="t3">{ago(i.created)}</span> },
      ]}
      grid={COLS}
      card={(i) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusTag status={i.status} />
            <b style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {i.description || i.name}
            </b>
            <span className="num t3" style={{ fontSize: 13 }}>
              {i.sizeGb} GB
            </span>
          </div>
          <div className="m t3" style={{ fontSize: 11, marginTop: 8 }}>
            {i.type} · {i.osFlavor} {i.osVersion} · {i.arch}
          </div>
        </div>
      )}
      detail={({ row: i }) => [
        ['Id', <span className="num">{i.id}</span>],
        ['Type', <span className="tag">{i.type}</span>],
        ['Status', <StatusTag status={i.status} />],
        ['System', `${i.osFlavor} ${i.osVersion} · ${i.arch}`],
        ['Size', <span className="num">{i.sizeGb} GB</span>],
        ['Disk', <span className="num">{i.diskGb} GB</span>],
        ['Bound to', i.boundTo ? `server #${i.boundTo}` : '—'],
        ['Created', ago(i.created)],
        ['Deprecated', i.deprecated ? ago(i.deprecated) : '—'],
      ]}
      actions={(ctx) => <ImageActions ctx={ctx} />}
    />
  )
}

function ImageActions({ ctx }: { ctx: Ctx<Image> }) {
  const [renaming, setRenaming] = useState(false)
  const confirm = useConfirm()
  const i = ctx.row
  const mine = deletable(i)

  return (
    <>
      <Act onClick={() => setRenaming(true)}>Rename</Act>
      <Act
        onClick={() =>
          ctx.act(i.protectDelete ? 'Disable delete protection' : 'Enable delete protection', Images.act(i.id, 'change_protection', { protect: !i.protectDelete }))
        }
      >
        {i.protectDelete ? 'Allow delete' : 'Protect from delete'}
      </Act>
      {mine && (
        <Act tone="danger" onClick={confirm.ask}>
          Delete image
        </Act>
      )}

      {renaming && <RenameImage ctx={ctx} onClose={() => setRenaming(false)} />}

      {confirm.dialog({
        eyebrow: 'Images',
        title: `Delete ${i.description || i.name}?`,
        confirmLabel: 'Delete',
        onConfirm: () => {
          void ctx.mutate('Delete image', Images.remove(i.id), { close: true })
        },
        children: 'Servers booted from this image keep running; new boots from it stop working.',
      })}
    </>
  )
}

/** Images have no rename endpoint — Hetzner stores the name in `description`. */
function RenameImage({ ctx, onClose }: { ctx: Ctx<Image>; onClose: () => void }) {
  const [value, setValue] = useState(ctx.row.description || ctx.row.name)
  const ok = value.trim().length > 0

  return (
    <Sheet open onClose={onClose} eyebrow="Images" title="Rename image" sub={`Id ${ctx.row.id}`}>
      <Field label="Name">
        <TextInput value={value} onChange={setValue} placeholder="ubuntu-base" />
      </Field>
      <button
        type="button"
        className="btn btn-red"
        style={{ width: '100%', height: 48 }}
        disabled={!ok}
        onClick={() =>
          void ctx.mutate('Rename image', Images.update(ctx.row.id, { description: value.trim() })).then((done) => {
            if (done) onClose()
          })
        }
      >
        Save
      </button>
    </Sheet>
  )
}
