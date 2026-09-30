import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API, CATALOG_CACHE, notifyChanged } from '../api'
import { useAsync, useIsDesktop } from '../hooks'
import { Ic } from '../icons'
import { Sw } from '../components/ui'
import { useToast } from '../components/toast'
import { ErrorPanel } from '../components/states'
import { euro, randomServerName, tierOf, toServerName, validServerName, type Tier } from '../format'
import { ImagePicker, defaultImage, imageRef, type Img } from '../components/images'
import type { Catalog, CatalogServerType } from '../types'


const shortFp = (fp: string) => {
  const m = fp.match(/SHA256:[A-Za-z0-9+/=]{6,}/)
  if (m) return `${m[0].slice(0, 13)}…${m[0].slice(-4)}`
  return fp.length > 18 ? `${fp.slice(0, 10)}…${fp.slice(-4)}` : fp
}

/**
 * 08 / 13 · New server — location, image, type, networking, ssh keys and
 * details. Mobile is a full page, desktop a modal with the build sheet.
 */
export default function NewServer() {
  const navigate = useNavigate()
  const toast = useToast()
  const desktop = useIsDesktop()

  const catalogSt = useAsync<Catalog>(() => API.catalog(), [], { cache: CATALOG_CACHE })
  const catalog = catalogSt.data

  const [loc, setLoc] = useState('')
  const [imageKey, setImageKey] = useState('')
  const [tier, setTier] = useState<Tier>('REGULAR')
  const [arch, setArch] = useState<'x86' | 'arm'>('x86')
  const [typeName, setTypeName] = useState('')
  const [sshKeys, setSshKeys] = useState<number[]>([])
  // a ready-made name: change it, re-roll it, or just keep it
  const [name, setName] = useState(randomServerName)
  const [userData, setUserData] = useState('')
  const [showCloudInit, setShowCloudInit] = useState(false)
  const [backups, setBackups] = useState(false)
  const [startAfter, setStartAfter] = useState(true)
  const [enableIpv4, setEnableIpv4] = useState(true)
  const [enableIpv6, setEnableIpv6] = useState(true)
  const [busy, setBusy] = useState(false)

  const location = catalog?.locations.find((l) => l.name === loc) ?? catalog?.locations[0]
  const locCodeName = location?.code ?? ''

  // Images are per CPU architecture: an x86 image on an Arm type fails, and
  // Hetzner lists e.g. ubuntu-24.04 once per architecture.
  const archImages = useMemo(() => (catalog?.images ?? []).filter((i) => !i.arch || i.arch === arch), [catalog, arch])

  // always have an image picked: newest Ubuntu by default, and re-pick when
  // an architecture switch makes the current one impossible
  useEffect(() => {
    if (archImages.length && !archImages.some((i) => imageRef(i) === imageKey)) {
      const d = defaultImage(archImages)
      if (d) setImageKey(imageRef(d))
    }
  }, [archImages, imageKey])

  const effectiveImage: Img | undefined = archImages.find((i) => imageRef(i) === imageKey)

  const typeOptions = useMemo(() => {
    if (!catalog) return []
    return catalog.serverTypes
      .filter((t) => tierOf(t) === tier && t.arch === arch && !t.deprecated)
      .sort((a, b) => a.cores - b.cores)
  }, [catalog, tier, arch])

  // never default to (or keep) a type that isn't sold in the chosen location
  const sellable = (t: CatalogServerType) => !!t.prices[locCodeName]?.available
  const selectedType = typeOptions.find((t) => t.name === typeName && sellable(t)) ?? typeOptions.find(sellable)
  const price = selectedType?.prices[locCodeName]?.monthly ?? 0
  const hourly = selectedType?.prices[locCodeName]?.hourly ?? 0
  const backupPct = Number(catalog?.backupPercent ?? '20')
  const backupPrice = (price * backupPct) / 100

  // trailing/leading dashes and dots are rejected by Hetzner — trim them for
  // the create call instead of nagging while the user types
  const cleanedName = name.replace(/^[.-]+/, '').replace(/[.-]+$/, '')
  const nameValid = validServerName(cleanedName)
  const hasPublicNet = enableIpv4 || enableIpv6
  // the first missing piece, shown next to the disabled Create button
  const missing = !selectedType
    ? 'Pick an available type'
    : !effectiveImage
      ? 'Pick an image'
      : !name
        ? 'Name the server'
        : !nameValid
          ? 'Fix the name'
          : !hasPublicNet
            ? 'Keep IPv4 or IPv6 on'
            : ''
  const ready = !missing && !busy

  useEffect(() => {
    if (!desktop) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('/')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [desktop, navigate])

  const create = async () => {
    if (!ready || !selectedType || !effectiveImage || !location) return
    setBusy(true)
    try {
      const result = await API.create({
        name: cleanedName,
        type: selectedType.name,
        image: imageRef(effectiveImage),
        location: location.name,
        sshKeys,
        userData,
        startAfterCreate: startAfter,
        backups,
        enableIpv4,
        enableIpv6,
      })
      toast.trackAction(`Building ${cleanedName}`, result.action)
      notifyChanged()
      navigate(`/servers/${result.server.id}/created`, {
        state: {
          name: cleanedName,
          rootPassword: result.rootPassword,
          actions: [result.action, ...result.nextActions],
        },
      })
    } catch (err) {
      toast.push({ kind: 'error', title: 'Create failed', detail: err instanceof Error ? err.message : 'error' })
      setBusy(false)
    }
  }

  if (!catalog || !location) {
    return (
      <div className={desktop ? 'page page--d' : 'page'} style={{ padding: 24 }}>
        <button type="button" className="btn btn-ico btn-bare" aria-label="Close" onClick={() => navigate('/')}>
          <Ic.X />
        </button>
        {catalogSt.error ? (
          <div style={{ marginTop: 12 }}>
            <ErrorPanel error={catalogSt.error} onRetry={() => catalogSt.reload()} />
          </div>
        ) : (
          <>
            <div className="skel" style={{ height: 60, width: 320, marginTop: 12 }} />
            <div className="skel" style={{ height: 400, marginTop: 24 }} />
          </>
        )}
      </div>
    )
  }

  const summary = `${selectedType?.name.toUpperCase() ?? '—'} · ${locCodeName} · ${(effectiveImage?.description || effectiveImage?.name || '—').toUpperCase()}`

  // ---- shared sections --------------------------------------------------

  const locationSection = desktop ? (
    <section>
      <SectionNo n="01" title="Location" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8 }}>
        {catalog.locations.map((l) => {
          const on = l.name === location.name
          return (
            <button
              key={l.name}
              type="button"
              onClick={() => setLoc(l.name)}
              style={{ position: 'relative', height: 92, padding: 12, textAlign: 'left', border: `1px solid ${on ? 'var(--accent)' : 'var(--line2)'}`, background: on ? 'var(--accent-dim)' : 'var(--bg)' }}
            >
              {on && <span style={{ position: 'absolute', right: 0, top: 0, width: 12, height: 12, background: 'var(--accent)' }} />}
              <span className="num" style={{ display: 'block', fontSize: 20 }}>{l.code}</span>
              <span className="t2" style={{ display: 'block', fontSize: 12, marginTop: 6 }}>{l.city}, {l.country}</span>
              <span className="m t3" style={{ display: 'block', fontSize: 10, marginTop: 4 }}>{l.zone.toUpperCase()}</span>
            </button>
          )
        })}
      </div>
    </section>
  ) : (
    <section style={{ padding: '32px 16px 0' }}>
      <div className="sec">
        <h2>
          <i>01</i>Location
        </h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {catalog.locations.map((l) => {
          const on = l.name === location.name
          return (
            <button
              key={l.name}
              type="button"
              onClick={() => setLoc(l.name)}
              style={{ position: 'relative', height: 104, padding: 12, textAlign: 'left', border: `1px solid ${on ? 'var(--accent)' : 'var(--line2)'}`, background: on ? 'var(--accent-dim)' : 'var(--bg)' }}
            >
              {on && <span style={{ position: 'absolute', right: 0, top: 0, width: 12, height: 12, background: 'var(--accent)' }} />}
              <span className="num" style={{ display: 'block', fontSize: 22 }}>{l.code}</span>
              <span className="t2" style={{ display: 'block', fontSize: 13, marginTop: 6 }}>{l.city}, {l.country}</span>
              <span className="m t3" style={{ display: 'block', fontSize: 10.5, marginTop: 4 }}>{l.zone.toUpperCase()}</span>
            </button>
          )
        })}
      </div>
    </section>
  )

  const imageSection = <ImagePicker images={archImages} value={imageKey} onChange={setImageKey} desktop={desktop} />

  const typeSection = (
    <>
      <div className="grid1" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {(['REGULAR', 'COST-OPT.', 'DEDICATED'] as Tier[]).map((t) => {
          const on = t === tier
          return (
            <button
              key={t}
              className="m"
              style={{ height: 42, textAlign: 'center', fontSize: 11, letterSpacing: '.1em', background: on ? 'var(--fg)' : 'var(--bg)', color: on ? 'var(--bg)' : 'var(--t2)' }}
              aria-pressed={on}
              onClick={() => {
                setTier(t)
                setTypeName('')
              }}
            >
              {t}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, margin: '10px 0', alignItems: 'center' }}>
        <button className={arch === 'x86' ? 'chip chip-on' : 'chip'} style={{ height: 32 }} aria-pressed={arch === 'x86'} onClick={() => { setArch('x86'); setTypeName('') }}>
          x86
        </button>
        <button className={arch === 'arm' ? 'chip chip-on' : 'chip'} style={{ height: 32 }} aria-pressed={arch === 'arm'} onClick={() => { setArch('arm'); setTypeName('') }}>
          Arm64
        </button>
        <span className="m t3" style={{ marginLeft: 'auto', fontSize: 10, letterSpacing: '.06em' }}>
          PRICE IN {locCodeName} · INCL. VAT
        </span>
      </div>
      {desktop && (
        <div className="eb" style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 90px 110px 100px', padding: '0 12px 8px', borderBottom: '1px solid var(--line3)', fontSize: 10 }}>
          <span style={{ paddingLeft: 22 }}>Name</span>
          <span style={{ textAlign: 'right' }}>vCPU</span>
          <span style={{ textAlign: 'right' }}>RAM</span>
          <span style={{ textAlign: 'right' }}>Disk</span>
          <span style={{ textAlign: 'right' }}>Hourly</span>
          <span style={{ textAlign: 'right' }}>Monthly</span>
        </div>
      )}
      <div role="radiogroup" aria-label="Server type" style={{ borderTop: desktop ? undefined : '1px solid var(--line)' }}>
        {typeOptions.map((t) => (
          <TypeRow
            key={t.name}
            t={t}
            locCode={locCodeName}
            on={selectedType?.name === t.name}
            desktop={desktop}
            onPick={() => setTypeName(t.name)}
          />
        ))}
      </div>
    </>
  )

  const sshSection = (
    <>
      <div className="card">
        {catalog.sshKeys.map((k, i) => (
          <label
            key={k.id}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderBottom: i === catalog.sshKeys.length - 1 ? undefined : '1px solid var(--line)' }}
          >
            <input
              type="checkbox"
              checked={sshKeys.includes(k.id)}
              style={{ width: 20, height: 20, accentColor: 'var(--accent)', margin: 0 }}
              onChange={(e) => setSshKeys((keys) => (e.target.checked ? [...keys, k.id] : keys.filter((id) => id !== k.id)))}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{k.name}</span>
              <span className="m t3" style={{ display: 'block', fontSize: 10.5, marginTop: 3 }}>{shortFp(k.fingerprint)}</span>
            </span>
          </label>
        ))}
        {catalog.sshKeys.length === 0 && (
          <p className="m t3" style={{ fontSize: 11, padding: 14 }}>
            No SSH keys in this project.
          </p>
        )}
      </div>
      <div className="m t3" style={{ fontSize: 10.5, marginTop: 8, lineHeight: 1.5 }}>
        NONE PICKED → HETZNER RETURNS A ROOT PASSWORD, SHOWN ONCE.
      </div>
    </>
  )

  const detailsSection = (
    <>
      <label className="lbl" htmlFor="cn">
        Name
      </label>
      <div className="field" style={{ paddingRight: 0, ...(name && !nameValid ? { borderColor: 'var(--accent)' } : {}) }}>
        {/* typed text is normalised on the fly ("Web Server" → "web-server") */}
        <input
          id="cn"
          value={name}
          placeholder="web-01"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setName(toServerName(e.target.value))}
        />
        <button
          type="button"
          className="btn btn-ico btn-bare"
          style={{ height: 46, borderLeft: '1px solid var(--line2)' }}
          aria-label="Random name"
          title="Random name"
          onClick={() => setName(randomServerName())}
        >
          <Ic.Rotate />
        </button>
      </div>
      {/* desktop: cloud-init, backups and start live in the build sheet only */}
      {!desktop && (
        <>
      <div style={{ marginTop: 18, border: '1px solid var(--line2)' }}>
        <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', height: 52, padding: '0 14px' }} onClick={() => setShowCloudInit((v) => !v)}>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Cloud-init user data</span>
          <span className="m t3" style={{ fontSize: 11 }}>OPTIONAL</span>
          <span className="t3" style={{ transform: showCloudInit ? 'rotate(180deg)' : undefined, display: 'inline-flex' }}>
            <Ic.ChevronDown />
          </span>
        </button>
        {showCloudInit && (
          <div style={{ borderTop: '1px solid var(--line)', padding: 12 }}>
            <textarea
              value={userData}
              onChange={(e) => setUserData(e.target.value)}
              placeholder="#cloud-config&#10;packages:&#10;  - nginx"
              aria-label="Cloud-init user data"
              rows={6}
              style={{ width: '100%', background: 'var(--field)', border: '1px solid var(--line2)', padding: 10, fontSize: 13, fontFamily: "'Geist Mono', monospace", resize: 'vertical' }}
            />
          </div>
        )}
      </div>
      <div className="card" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderBottom: '1px solid var(--line)' }}>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>Backups</span>
            <span className="t3" style={{ display: 'block', fontSize: 12.5, marginTop: 3 }}>
              +{backupPct}% · {euro(backupPrice)}/mo
            </span>
          </span>
          <Sw on={backups} label="Backups" onToggle={() => setBackups((v) => !v)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14 }}>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>Start after create</span>
            <span className="t3" style={{ display: 'block', fontSize: 12.5, marginTop: 3 }}>Boot as soon as it's built</span>
          </span>
          <Sw on={startAfter} label="Start after create" onToggle={() => setStartAfter((v) => !v)} />
        </div>
      </div>
        </>
      )}
    </>
  )

  // ---- desktop ----------------------------------------------------------

  if (desktop) {
    return (
      <div className="page page--d" style={{ minHeight: '100vh' }}>
        <div style={{ position: 'fixed', inset: 0, background: 'var(--scrim2)', zIndex: 30 }} onClick={() => navigate('/')} />
        <div
          role="dialog"
          aria-label="New server"
          className="sheet-scroll"
          style={{
            position: 'fixed',
            top: '5vh',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 1160,
            maxWidth: '94vw',
            // fixed height + two independently scrolling columns: the form
            // scrolls, the build sheet (price + Create) stays in view
            height: 'min(90vh, 920px)',
            background: 'var(--panel)',
            border: '1px solid var(--line3)',
            zIndex: 40,
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          <div className="sheet-scroll" style={{ flex: 1, minWidth: 0, padding: '26px 30px', borderRight: '1px solid var(--line)', overflowY: 'auto' }}>
            <h1 className="d" style={{ margin: 0, fontSize: 44 }}>New server</h1>
            <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 26 }}>
              {locationSection}
              <section>
                <SectionNo n="02" title="Image" />
                {imageSection}
              </section>
              <section>
                <SectionNo n="03" title="Type" />
                {typeSection}
              </section>
              <section>
                <SectionNo n="04" title="SSH keys" />
                {sshSection}
              </section>
              <section>
                <SectionNo n="05" title="Name" />
                {detailsSection}
              </section>
            </div>
          </div>
          <div className="sheet-scroll" style={{ width: 320, flex: 'none', padding: '26px 24px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="eb">Build sheet</span>
              <button type="button" className="btn btn-ico btn-line" aria-label="Close" onClick={() => navigate('/')}>
                <Ic.X />
              </button>
            </div>
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column' }}>
              <SheetRow k="Location" v={`${locCodeName} · ${location.city}`} />
              <SheetRow k="Image" v={effectiveImage?.description ?? '—'} />
              <SheetRow k="Type" v={selectedType ? `${selectedType.name.toUpperCase()} · ${selectedType.cores} / ${Math.round(selectedType.memoryGb)} GB / ${selectedType.diskGb} GB` : '—'} />
            </div>
            {/* networking has no section in the desktop form — the toggles live here */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line-row)' }}>
              <span className="eb" style={{ fontSize: 10 }}>IPv4</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="m t3" style={{ fontSize: 11 }}>{enableIpv4 ? 'NEW PRIMARY IP' : 'NONE'}</span>
                <Sw on={enableIpv4} label="Public IPv4" onToggle={() => setEnableIpv4((v) => !v)} />
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line-row)' }}>
              <span className="eb" style={{ fontSize: 10 }}>IPv6</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="m t3" style={{ fontSize: 11 }}>{enableIpv6 ? 'NEW /64' : 'NONE'}</span>
                <Sw on={enableIpv6} label="Public IPv6" onToggle={() => setEnableIpv6((v) => !v)} />
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <SheetRow k="SSH keys" v={sshKeys.length ? `${sshKeys.length} · ${catalog.sshKeys.filter((k) => sshKeys.includes(k.id)).map((k) => k.name).join(', ')}` : 'Root password'} />
              <SheetRow k="Name" v={name || '—'} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Backups <span className="t3" style={{ fontWeight: 400 }}>+{euro(backupPrice)}</span></span>
              <Sw on={backups} label="Backups" onToggle={() => setBackups((v) => !v)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Start after create</span>
              <Sw on={startAfter} label="Start after create" onToggle={() => setStartAfter((v) => !v)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Cloud-init</span>
              <button type="button" className="m t3" style={{ fontSize: 11, letterSpacing: '.1em', display: 'inline-flex', alignItems: 'center', gap: 4, height: 32 }} onClick={() => setShowCloudInit((v) => !v)}>
                {userData ? 'EDIT' : 'ADD'} <Ic.ChevronRight />
              </button>
            </div>
            {showCloudInit && (
              <textarea
                value={userData}
                onChange={(e) => setUserData(e.target.value)}
                placeholder="#cloud-config"
                aria-label="Cloud-init user data"
                rows={5}
                style={{ marginTop: 10, width: '100%', background: 'var(--field)', border: '1px solid var(--line2)', padding: 10, fontSize: 12, fontFamily: "'Geist Mono', monospace", resize: 'vertical' }}
              />
            )}
            <div style={{ flex: 1 }} />
            <div style={{ marginTop: 26 }}>
              <div className="eb">Monthly · incl. VAT</div>
              <div className="d" style={{ fontSize: 44, marginTop: 8 }}>{euro(price, 2)}</div>
              <div className="m t3" style={{ fontSize: 10.5, marginTop: 6, letterSpacing: '.06em' }}>
                {euro(hourly, 4)} / HOUR · {enableIpv4 ? 'IPV4 BILLED SEPARATELY' : 'NO PUBLIC IPV4'}
              </div>
            </div>
            {missing && (
              <div className="m t3" style={{ fontSize: 10.5, letterSpacing: '.06em', marginTop: 14 }}>
                {missing.toUpperCase()}
              </div>
            )}
            <button
              type="button"
              className={ready ? 'btn btn-red' : 'btn btn-red btn-dis'}
              style={{ width: '100%', height: 52, marginTop: missing ? 8 : 18, fontSize: 13 }}
              disabled={!ready}
              onClick={create}
            >
              {busy ? 'Creating…' : 'Create server'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- mobile -----------------------------------------------------------

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 8px 0' }}>
        <button type="button" className="btn btn-ico btn-bare" aria-label="Close" onClick={() => navigate('/')}>
          <Ic.X />
        </button>
      </div>
      <div style={{ padding: '8px 16px 0' }}>
        <h1 className="d" style={{ margin: 0, fontSize: 44, maxWidth: 260 }}>
          New server
        </h1>
      </div>

      {locationSection}
      <section style={{ padding: '32px 16px 0' }}>
        <div className="sec">
          <h2>
            <i>02</i>Image
          </h2>
        </div>
        {imageSection}
      </section>
      <section style={{ padding: '32px 16px 0' }}>
        <div className="sec">
          <h2>
            <i>03</i>Type
          </h2>
        </div>
        {typeSection}
      </section>
      <section style={{ padding: '32px 16px 0' }}>
        <div className="sec">
          <h2>
            <i>04</i>Networking
          </h2>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderBottom: '1px solid var(--line)' }}>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>Public IPv4</span>
              <span className="t3" style={{ display: 'block', fontSize: 12.5, marginTop: 3 }}>New primary IP · billed separately</span>
            </span>
            <Sw on={enableIpv4} label="Public IPv4" onToggle={() => setEnableIpv4((v) => !v)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14 }}>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>Public IPv6</span>
              <span className="t3" style={{ display: 'block', fontSize: 12.5, marginTop: 3 }}>/64 network · free</span>
            </span>
            <Sw on={enableIpv6} label="Public IPv6" onToggle={() => setEnableIpv6((v) => !v)} />
          </div>
        </div>
        {!hasPublicNet && (
          <div className="m" style={{ fontSize: 10.5, color: 'var(--accent-soft)', marginTop: 8, lineHeight: 1.5 }}>
            WITHOUT A PUBLIC IP THE SERVER NEEDS A PRIVATE NETWORK — NOT AVAILABLE HERE YET.
          </div>
        )}
      </section>
      <section style={{ padding: '32px 16px 130px' }}>
        <div className="sec">
          <h2>
            <i>05</i>SSH keys
          </h2>
        </div>
        {sshSection}
        <div className="sec" style={{ marginTop: 32 }}>
          <h2>
            <i>06</i>Details
          </h2>
        </div>
        {detailsSection}
      </section>

      <div className="dock" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 520, bottom: 0, padding: '14px 16px 24px', background: 'var(--bg)', borderTop: '1px solid var(--line)', zIndex: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
          <span className="m" style={{ fontSize: 11, letterSpacing: '.08em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: missing ? 'var(--accent-soft)' : 'var(--t2)' }}>
            {missing ? missing.toUpperCase() : summary}
          </span>
          <span className="num" style={{ fontSize: 18, flex: 'none' }}>
            {euro(price)}
            <span className="t3" style={{ fontSize: 12 }}>/mo</span>
          </span>
        </div>
        <button type="button" className={ready ? 'btn btn-red' : 'btn btn-red btn-dis'} style={{ width: '100%', height: 54, fontSize: 13 }} disabled={!ready} onClick={create}>
          {busy ? 'Creating…' : 'Create server'}
        </button>
      </div>
    </div>
  )
}

// ---- pieces ------------------------------------------------------------

function SectionNo({ n, title }: { n: string; title: string }) {
  return (
    <div className="sec">
      <h2>
        <i>{n}</i>
        {title}
      </h2>
    </div>
  )
}

function SheetRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--line-row)' }}>
      <span className="eb" style={{ fontSize: 10, flex: 'none' }}>{k}</span>
      <span className="m" style={{ fontSize: 12, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
    </div>
  )
}

function TypeRow({
  t,
  locCode,
  on,
  desktop,
  onPick,
}: {
  t: CatalogServerType
  locCode: string
  on: boolean
  desktop: boolean
  onPick: () => void
}) {
  const price = t.prices[locCode]
  const available = price?.available ?? false

  if (desktop) {
    return (
      <button
        role="radio"
        aria-checked={on}
        disabled={!available}
        onClick={onPick}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 80px 80px 90px 110px 100px',
          alignItems: 'center',
          width: '100%',
          height: 52,
          padding: '0 12px',
          border: `1px solid ${on ? 'var(--accent)' : 'transparent'}`,
          borderBottom: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
          opacity: available ? 1 : 0.4,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 12, height: 12, background: on ? 'var(--accent)' : undefined, boxShadow: on ? undefined : 'inset 0 0 0 1.5px var(--ctrl2)' }} />
          <span className="num" style={{ fontSize: 15 }}>{t.name.toUpperCase()}</span>
        </span>
        <span className="num" style={{ fontSize: 13, textAlign: 'right' }}>{t.cores}</span>
        <span className="num" style={{ fontSize: 13, textAlign: 'right' }}>{Math.round(t.memoryGb)} GB</span>
        <span className="num" style={{ fontSize: 13, textAlign: 'right' }}>{t.diskGb} GB</span>
        <span className="num t3" style={{ fontSize: 12, textAlign: 'right' }}>{available ? euro(price.hourly, 4) : '—'}</span>
        <span className="num" style={{ fontSize: 14, textAlign: 'right' }}>{available ? euro(price.monthly) : <span className="t3">Unavailable</span>}</span>
      </button>
    )
  }

  return (
    <button
      role="radio"
      aria-checked={on}
      disabled={!available}
      onClick={onPick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: '100%',
        minHeight: 64,
        padding: '10px 12px 10px 14px',
        border: `1px solid ${on ? 'var(--accent)' : 'transparent'}`,
        borderBottom: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
        opacity: available ? 1 : 0.4,
      }}
    >
      <span style={{ width: 12, height: 12, flex: 'none', background: on ? 'var(--accent)' : undefined, boxShadow: on ? undefined : 'inset 0 0 0 1.5px var(--ctrl2)' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="num" style={{ display: 'block', fontSize: 16 }}>{t.name.toUpperCase()}</span>
        <span className="m t3" style={{ display: 'block', fontSize: 11, marginTop: 3 }}>
          {t.cores} vCPU · {Math.round(t.memoryGb)} GB · {t.diskGb} GB
        </span>
      </span>
      <span style={{ textAlign: 'right' }}>
        <span className="num" style={{ display: 'block', fontSize: 14 }}>{available ? euro(price?.monthly ?? 0) : '—'}</span>
        <span className="m t3" style={{ display: 'block', fontSize: 10.5, marginTop: 3 }}>
          {available ? `${euro(price?.hourly ?? 0, 4)}/h` : 'UNAVAILABLE HERE'}
        </span>
      </span>
    </button>
  )
}
