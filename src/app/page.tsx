'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MS_COUNTIES } from '@/types'
import { useBreakpoint } from '@/lib/useBreakpoint'

interface CountyFeature {
  fips: string
  name: string
  sviScore?: number
  primaryCareScore?: number
  isMUA?: boolean
  isRural?: boolean
  hasFQHC?: boolean
  loaded: boolean
}

const MS_GEOJSON_URL = 'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json'

const QUICK = [
  { fips: '28055', name: 'Issaquena', note: 'Highest need' },
  { fips: '28027', name: 'Coahoma',   note: 'SVI 0.98' },
  { fips: '28049', name: 'Hinds',     note: 'Jackson' },
]

export default function LandingPage() {
  const router = useRouter()
  const { isMobile } = useBreakpoint()
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<Record<string, unknown> | null>(null)
  const geoLayerRef = useRef<unknown>(null)

  const [query,        setQuery]        = useState('')
  const [results,      setResults]      = useState<typeof MS_COUNTIES>([])
  const [focused,      setFocused]      = useState(false)
  const [hovered,      setHovered]      = useState<CountyFeature | null>(null)
  const [countyData,   setCountyData]   = useState<Record<string, CountyFeature>>({})
  const countyDataRef  = useRef<Record<string, CountyFeature>>({})
  const [mapReady,     setMapReady]     = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const q = query.toLowerCase()
    setResults(MS_COUNTIES.filter(c => c.name.toLowerCase().includes(q) || c.fips.includes(q)).slice(0, 8))
  }, [query])

  // Init Leaflet
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return
    import('leaflet').then(L => {
      if (leafletRef.current || !mapRef.current) return
      mapRef.current.innerHTML = ''
      const map = L.map(mapRef.current, { center: [32.7, -89.7], zoom: 7, zoomControl: false, attributionControl: false, scrollWheelZoom: true })
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', { maxZoom: 12, opacity: 0.6 }).addTo(map)
      leafletRef.current = { map, L } as Record<string, unknown>
      setMapReady(true)
    })
    return () => {
      if (leafletRef.current) { (leafletRef.current as { map: L.Map }).map.remove(); leafletRef.current = null }
    }
  }, [])

  // Load GeoJSON
  useEffect(() => {
    if (!mapReady || !leafletRef.current) return
    const { map, L } = leafletRef.current as { map: L.Map; L: typeof import('leaflet') }
    fetch(MS_GEOJSON_URL).then(r => r.json()).then(geojson => {
      let msFeatures = geojson.features.filter((f: GeoJSON.Feature) =>
        String(f.id || '').startsWith('28') ||
        String(f.properties?.STATE || f.properties?.STATEFP || '').padStart(2, '0') === '28'
      )
      if (!msFeatures.length) {
        msFeatures = geojson.features.filter((f: GeoJSON.Feature) => {
          const id = String(f.id || f.properties?.GEOID || '')
          return id.startsWith('28') && id.length === 5
        })
      }
      const layer = L.geoJSON({ type: 'FeatureCollection', features: msFeatures } as GeoJSON.GeoJsonObject, {
        style: (feature) => getCountyStyle(countyDataRef.current[String(feature?.id || feature?.properties?.GEOID || '')], false),
        onEachFeature: (feature, layer) => {
          const fips = String(feature.id || feature.properties?.GEOID || '')
          layer.on('mouseover', (e: L.LeafletMouseEvent) => {
            setHovered(countyDataRef.current[fips] ?? { fips, name: feature.properties?.NAME || '', loaded: false })
            ;(e.target as L.Path).setStyle({ fillOpacity: 0.9, weight: 2, color: '#f59e0b' })
          })
          layer.on('mouseout', (e: L.LeafletMouseEvent) => {
            setHovered(null)
            ;(e.target as L.Path).setStyle(getCountyStyle(countyDataRef.current[fips], false))
          })
          layer.on('click', () => router.push(`/county/${fips}`))
        },
      }).addTo(map)
      geoLayerRef.current = layer
    })
  }, [mapReady, router])

  // Load county data in batches
  useEffect(() => {
    if (!mapReady) return
    let cancelled = false; let count = 0
    const loaded: Record<string, CountyFeature> = {}
    async function loadBatch(batch: string[]) {
      await Promise.all(batch.map(async fips => {
        try {
          const res = await fetch(`/api/county/${fips}`)
          const data = await res.json()
          if (!data.success || cancelled) return
          const p = data.profile
          loaded[fips] = { fips, name: p.countyName, sviScore: p.sviScore, primaryCareScore: p.primaryCareScore, isMUA: p.isMUA, isRural: p.isRural, hasFQHC: p.hasFQHC, loaded: true }
          count++; setLoadProgress(Math.round((count / 82) * 100))
        } catch { /* skip */ }
      }))
      if (!cancelled) {
        setCountyData(prev => ({ ...prev, ...loaded }))
        if (geoLayerRef.current) {
          const layer = geoLayerRef.current as L.GeoJSON
          layer.setStyle((feature) => {
            const fips = String(feature?.id || feature?.properties?.GEOID || '')
            return getCountyStyle(loaded[fips] ?? countyDataRef.current[fips], false)
          })
        }
      }
    }
    async function loadAll() {
      const fips = MS_COUNTIES.map(c => c.fips)
      for (let i = 0; i < fips.length; i += 8) {
        if (cancelled) break
        await loadBatch(fips.slice(i, i + 8))
        await new Promise(r => setTimeout(r, 100))
      }
    }
    loadAll()
    return () => { cancelled = true }
  }, [mapReady])

  useEffect(() => {
    countyDataRef.current = countyData
    if (!geoLayerRef.current) return
    const layer = geoLayerRef.current as L.GeoJSON
    layer.setStyle((feature) => {
      const fips = String(feature?.id || feature?.properties?.GEOID || '')
      return getCountyStyle(countyData[fips], false)
    })
  }, [countyData])

  return (
    <main style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', background: 'var(--navy)' }}>

      {/* Inject Leaflet path transition */}
      <style>{`
        .leaflet-interactive {
          transition: fill 1.4s ease, fill-opacity 1.4s ease !important;
        }
        .leaflet-zoom-in, .leaflet-zoom-out {
          display: none !important;
        }
      `}</style>

      {/* Full-screen map */}
      <div ref={mapRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />

      {/* Gradient overlays */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', background: isMobile ? 'rgba(8,8,10,0.75)' : 'linear-gradient(90deg, rgba(8,8,10,0.92) 0%, rgba(8,8,10,0.7) 40%, rgba(10,15,30,0.1) 70%, transparent 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'linear-gradient(0deg, rgba(8,8,10,0.8) 0%, transparent 30%)' }} />

      {/* Nav */}
      <nav style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '16px 24px' : '16px 40px', background: 'linear-gradient(180deg, rgba(8,8,10,0.9) 0%, transparent 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, background: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'var(--navy)', fontFamily: 'IBM Plex Mono, monospace', borderRadius: 2 }}>GQ</div>
          <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 15, fontWeight: 700, letterSpacing: '0.01em' }}>
            GRANT<span style={{ color: 'var(--amber)' }}>IQ</span>
          </span>
          <span className="badge badge-amber" style={{ marginLeft: 4 }}>BETA</span>
        </div>
      </nav>

      {/* Left panel */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: isMobile ? 'auto' : 0, right: isMobile ? 0 : 'auto', zIndex: 5, width: isMobile ? '100%' : 440, display: 'flex', flexDirection: 'column', justifyContent: isMobile ? 'flex-start' : 'center', padding: isMobile ? '76px 24px 32px' : '80px 40px', pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <div style={{ width: 3, height: 20, background: '#b8973e', borderRadius: 2 }} />
            <span style={{ fontFamily: 'IBM Plex Sans, Inter, sans-serif', fontSize: 10, color: '#b8973e', letterSpacing: '0.03em', textTransform: 'uppercase', fontWeight: 700 }}>Federal Grant Intelligence System</span>
          </div>

          <h1 style={{ fontFamily: 'IBM Plex Sans, Inter, sans-serif', fontSize: 'clamp(28px, 3.5vw, 46px)', fontWeight: 700, lineHeight: 1.1, marginBottom: 14, letterSpacing: '-0.03em', color: '#dedad4' }}>
            Which federal grants is<br />
            your county leaving<br />
            <span style={{ color: '#b8973e' }}>on the table?</span>
          </h1>

          <p style={{ color: '#8f8b84', fontSize: 14, lineHeight: 1.7, marginBottom: 28, maxWidth: 360, fontFamily: 'Inter, sans-serif' }}>
            Click any county on the map or search below. We match real CDC, HRSA, and SVI health data against live federal grant opportunities.
          </p>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(12,12,14,0.92)', border: `1px solid ${focused ? '#b8973e' : 'rgba(255,255,255,0.10)'}`, borderRadius: 4, backdropFilter: 'blur(12px)', transition: 'border-color 0.2s', boxShadow: focused ? '0 0 0 3px rgba(184,151,62,0.10)' : 'none' }}>
              <div style={{ padding: '0 14px', color: '#8f8b84' }}>
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </div>
              <input value={query} onChange={e => setQuery(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 200)}
                placeholder="Search county name or FIPS..."
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#dedad4', fontSize: 14, padding: '14px 0', fontFamily: 'Inter, sans-serif' }} />
            </div>
            {results.length > 0 && focused && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'rgba(12,12,14,0.97)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, zIndex: 50, backdropFilter: 'blur(12px)', overflow: 'hidden' }}>
                {results.map((county, i) => (
                  <button key={county.fips} onMouseDown={() => router.push(`/county/${county.fips}`)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'transparent', border: 'none', borderBottom: i < results.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', cursor: 'pointer', transition: 'background 0.15s', textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#1c1c21'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ color: '#dedad4', fontSize: 13, fontFamily: 'Inter, sans-serif' }}>{county.name} County</span>
                    <span style={{ fontFamily: 'IBM Plex Sans, Inter, sans-serif', fontSize: 11, color: '#8f8b84' }}>{county.fips}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick access — 3 items filling the search bar width */}
          <div style={{ marginTop: 12 }}>
            <p style={{ fontFamily: 'IBM Plex Sans, Inter, sans-serif', fontSize: 9, color: '#8f8b84', letterSpacing: '0.03em', textTransform: 'uppercase', marginBottom: 8 }}>Quick Access</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {QUICK.map(c => (
                <button key={c.fips} onClick={() => router.push(`/county/${c.fips}`)}
                  style={{ background: 'rgba(12,12,14,0.75)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, padding: '10px 12px', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left', backdropFilter: 'blur(8px)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#b8973e'; e.currentTarget.style.background = 'rgba(184,151,62,0.08)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.background = 'rgba(12,12,14,0.75)' }}>
                  <div style={{ color: '#dedad4', fontSize: 13, fontWeight: 700, fontFamily: 'IBM Plex Sans, Inter, sans-serif', marginBottom: 3 }}>{c.name}</div>
                  <div style={{ color: '#8f8b84', fontSize: 10, fontFamily: 'IBM Plex Sans, Inter, sans-serif' }}>{c.note}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Hover tooltip */}
      {hovered && !isMobile && (
        <div style={{ position: 'absolute', bottom: 100, right: 32, zIndex: 10, background: 'rgba(12,12,14,0.95)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, padding: '16px 20px', minWidth: 260, backdropFilter: 'blur(12px)', pointerEvents: 'none', borderLeft: '3px solid #b8973e' }}>
          <div style={{ fontFamily: 'IBM Plex Sans, Inter, sans-serif', fontSize: 18, fontWeight: 600, color: '#dedad4', marginBottom: 10, lineHeight: 1.2 }}>
            {hovered.name} <span style={{ color: '#8f8b84', fontWeight: 400 }}>County</span>
          </div>
          {hovered.loaded ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                {[
                  { label: 'SVI Score',  value: (hovered.sviScore ?? 0).toFixed(3), alert: (hovered.sviScore ?? 0) > 0.75 },
                  { label: 'HPSA Score', value: hovered.primaryCareScore ? String(hovered.primaryCareScore) : 'Not designated', alert: false },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: '#8f8b84', fontSize: 11, fontFamily: 'IBM Plex Sans, Inter, sans-serif', letterSpacing: '0.01em', textTransform: 'uppercase' }}>{row.label}</span>
                    <span style={{ fontFamily: 'IBM Plex Sans, Inter, sans-serif', fontSize: 12, fontWeight: 700, color: row.alert ? '#b85c5c' : '#dedad4' }}>{row.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                {hovered.isMUA                       && <span style={{ background: 'rgba(184,151,62,0.12)', border: '1px solid rgba(184,151,62,0.30)', color: '#b8973e', borderRadius: 2, padding: '2px 8px', fontSize: 9, fontFamily: 'IBM Plex Sans, Inter, sans-serif', fontWeight: 700, letterSpacing: '0.02em' }}>MUA</span>}
                {(hovered.primaryCareScore ?? 0) > 0 && <span style={{ background: 'rgba(184,92,92,0.12)', border: '1px solid rgba(184,92,92,0.30)', color: '#b85c5c', borderRadius: 2, padding: '2px 8px', fontSize: 9, fontFamily: 'IBM Plex Sans, Inter, sans-serif', fontWeight: 700, letterSpacing: '0.02em' }}>HPSA</span>}
                {hovered.isRural                     && <span style={{ background: 'rgba(82,80,75,0.12)', border: '1px solid rgba(255,255,255,0.10)', color: '#8f8b84', borderRadius: 2, padding: '2px 8px', fontSize: 9, fontFamily: 'IBM Plex Sans, Inter, sans-serif', fontWeight: 700, letterSpacing: '0.02em' }}>RURAL</span>}
                {hovered.hasFQHC
                  ? <span style={{ background: 'rgba(74,115,148,0.12)', border: '1px solid rgba(74,115,148,0.30)', color: '#4a7394', borderRadius: 2, padding: '2px 8px', fontSize: 9, fontFamily: 'IBM Plex Sans, Inter, sans-serif', fontWeight: 700, letterSpacing: '0.02em' }}>HAS FQHC</span>
                  : <span style={{ background: 'rgba(184,92,92,0.12)', border: '1px solid rgba(184,92,92,0.30)', color: '#b85c5c', borderRadius: 2, padding: '2px 8px', fontSize: 9, fontFamily: 'IBM Plex Sans, Inter, sans-serif', fontWeight: 700, letterSpacing: '0.02em' }}>NO FQHC</span>}
              </div>
            </>
          ) : (
            <div style={{ color: '#8f8b84', fontSize: 11, fontFamily: 'IBM Plex Sans, Inter, sans-serif', marginBottom: 10 }}>Loading data...</div>
          )}
          <div style={{ color: '#b8973e', fontSize: 10, fontFamily: 'IBM Plex Sans, Inter, sans-serif', fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Click to view grants →</div>
        </div>
      )}

      {/* Legend — same exact style as hover tooltip */}
      {!hovered && !isMobile && (
        <div style={{ position: 'absolute', bottom: 100, right: 32, zIndex: 10, background: 'rgba(12,12,14,0.95)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, padding: '16px 20px', minWidth: 260, backdropFilter: 'blur(12px)', pointerEvents: 'none', borderLeft: '3px solid #b8973e' }}>
          <div style={{ fontFamily: 'IBM Plex Sans, Inter, sans-serif', fontSize: 18, fontWeight: 600, color: '#dedad4', marginBottom: 10, lineHeight: 1.2 }}>
            Social <span style={{ color: '#8f8b84', fontWeight: 400 }}>Vulnerability</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
            {[
              { color: 'rgba(239,68,68,0.85)', label: '≥0.90 Critical' },
              { color: 'rgba(239,68,68,0.5)',  label: '0.75–0.90 High' },
              { color: 'rgba(245,158,11,0.6)', label: '0.50–0.75 Moderate' },
              { color: 'rgba(16,185,129,0.5)', label: 'Lower need' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: '#8f8b84', fontSize: 11, fontFamily: 'IBM Plex Sans, Inter, sans-serif', letterSpacing: '0.01em', textTransform: 'uppercase' }}>{item.label}</span>
                <div style={{ width: 12, height: 12, background: item.color, borderRadius: 2, flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)', alignSelf: 'center' }} />
              </div>
            ))}
          </div>
          {loadProgress < 100 ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: '#8f8b84', fontSize: 11, fontFamily: 'IBM Plex Sans, Inter, sans-serif', letterSpacing: '0.01em', textTransform: 'uppercase' }}>Loading data</span>
              <span style={{ fontFamily: 'IBM Plex Sans, Inter, sans-serif', fontSize: 12, fontWeight: 700, color: '#b8973e' }}>{loadProgress}%</span>
            </div>
          ) : (
            <div style={{ color: '#b8973e', fontSize: 10, fontFamily: 'IBM Plex Sans, Inter, sans-serif', fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Hover a county to explore →</div>
          )}
        </div>
      )}

      {/* Map init overlay */}
      {!mapReady && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'var(--amber)', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, letterSpacing: '0.15em' }}>INITIALIZING MAP...</div>
        </div>
      )}
    </main>
  )
}

function getCountyStyle(data: CountyFeature | undefined, isHovered: boolean): import('leaflet').PathOptions {
  const svi = data?.sviScore
  let fillColor = 'rgba(100,116,139,0.3)'
  let fillOpacity = 0.55
  if (svi !== undefined) {
    if (svi >= 0.9)       { fillColor = '#ef4444'; fillOpacity = 0.75 }
    else if (svi >= 0.75) { fillColor = '#ef4444'; fillOpacity = 0.45 }
    else if (svi >= 0.5)  { fillColor = '#f59e0b'; fillOpacity = 0.5  }
    else                  { fillColor = '#10b981'; fillOpacity = 0.4  }
  }
  return { fillColor, fillOpacity: isHovered ? 0.9 : fillOpacity, color: isHovered ? '#f59e0b' : 'rgba(255,255,255,0.15)', weight: isHovered ? 2.5 : 0.8 }
}

