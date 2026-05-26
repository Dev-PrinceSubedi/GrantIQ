'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MS_COUNTIES } from '@/types'

// ── Same Stitch design tokens as county page ──────────────────────────────────
const SURF   = '#1f1b11'
const CARD   = '#231f14'
const CARDHI = '#2e2a1e'
const BDR    = 'rgba(255,255,255,0.05)'
const BDR2   = '#4d4632'
const PRI    = '#facc15'
const PRI_TXT = '#ffecb9'
const GRN    = '#4edea3'
const RED    = '#ffb4ab'
const BLU    = '#bec6e0'
const TXT    = '#ebe2d0'
const TXT2   = '#d1c6ab'
const TXT3   = '#9a9078'
const GEIST  = 'Geist, Inter, sans-serif'
const SANS   = 'Inter, sans-serif'

const glassCard: React.CSSProperties = {
  background: 'rgba(35,31,20,0.85)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: `1px solid ${BDR2}`,
  borderRadius: 4,
}

const MS_GEOJSON_URL = 'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json'

interface CountyData {
  fips: string
  name: string
  sviScore?: number
  primaryCareScore?: number
  isMUA?: boolean
  isRural?: boolean
  hasFQHC?: boolean
  diabetesRate?: number
  povertyRate?: number
  loaded: boolean
}

type ColorMode = 'svi' | 'hpsa' | 'diabetes' | 'poverty' | 'fqhc'

const MODE_LABELS: Record<ColorMode, string> = {
  svi: 'Social Vulnerability', hpsa: 'HPSA Score',
  diabetes: 'Diabetes Rate', poverty: 'Poverty Rate', fqhc: 'FQHC Presence',
}

const LEGENDS: Record<ColorMode, { color: string; label: string }[]> = {
  svi:      [{ color:'rgba(239,68,68,0.85)', label:'≥0.90 Critical' }, { color:'rgba(239,68,68,0.5)', label:'0.75–0.90 High' }, { color:'rgba(245,158,11,0.6)', label:'0.50–0.75 Moderate' }, { color:'rgba(16,185,129,0.5)', label:'Lower need' }],
  hpsa:     [{ color:'rgba(239,68,68,0.85)', label:'≥20 Critical' }, { color:'rgba(239,68,68,0.5)', label:'17–19 High' }, { color:'rgba(245,158,11,0.6)', label:'14–16 Moderate' }, { color:'rgba(16,185,129,0.5)', label:'Lower need' }],
  diabetes: [{ color:'rgba(239,68,68,0.85)', label:'≥18% Critical' }, { color:'rgba(239,68,68,0.5)', label:'16–18% High' }, { color:'rgba(245,158,11,0.6)', label:'14–16% Moderate' }, { color:'rgba(16,185,129,0.5)', label:'Lower need' }],
  poverty:  [{ color:'rgba(239,68,68,0.85)', label:'≥35% Critical' }, { color:'rgba(239,68,68,0.5)', label:'25–35% High' }, { color:'rgba(245,158,11,0.6)', label:'18–25% Moderate' }, { color:'rgba(16,185,129,0.5)', label:'Lower need' }],
  fqhc:     [{ color:'rgba(59,130,246,0.6)', label:'Has FQHC' }, { color:'rgba(239,68,68,0.75)', label:'No FQHC (Priority)' }],
}

function getStyle(data: CountyData | undefined, mode: ColorMode, hov = false): Record<string, unknown> {
  let fillColor = 'rgba(77,70,50,0.4)'
  let fillOpacity = 0.55
  if (data?.loaded) {
    switch (mode) {
      case 'svi': {
        const v = data.sviScore ?? 0
        if (v >= 0.9)       { fillColor = '#ef4444'; fillOpacity = 0.75 }
        else if (v >= 0.75) { fillColor = '#ef4444'; fillOpacity = 0.45 }
        else if (v >= 0.5)  { fillColor = '#f59e0b'; fillOpacity = 0.5  }
        else                { fillColor = '#10b981'; fillOpacity = 0.4  }
        break
      }
      case 'hpsa': {
        const v = data.primaryCareScore ?? 0
        if (v >= 20)      { fillColor = '#ef4444'; fillOpacity = 0.75 }
        else if (v >= 17) { fillColor = '#ef4444'; fillOpacity = 0.45 }
        else if (v >= 14) { fillColor = '#f59e0b'; fillOpacity = 0.5  }
        else if (v > 0)   { fillColor = '#f59e0b'; fillOpacity = 0.3  }
        else              { fillColor = '#10b981'; fillOpacity = 0.4  }
        break
      }
      case 'diabetes': {
        const v = data.diabetesRate ?? 0
        if (v >= 18)      { fillColor = '#ef4444'; fillOpacity = 0.75 }
        else if (v >= 16) { fillColor = '#ef4444'; fillOpacity = 0.45 }
        else if (v >= 14) { fillColor = '#f59e0b'; fillOpacity = 0.5  }
        else              { fillColor = '#10b981'; fillOpacity = 0.4  }
        break
      }
      case 'poverty': {
        const v = data.povertyRate ?? 0
        if (v >= 35)      { fillColor = '#ef4444'; fillOpacity = 0.75 }
        else if (v >= 25) { fillColor = '#ef4444'; fillOpacity = 0.45 }
        else if (v >= 18) { fillColor = '#f59e0b'; fillOpacity = 0.5  }
        else              { fillColor = '#10b981'; fillOpacity = 0.4  }
        break
      }
      case 'fqhc':
        fillColor = data.hasFQHC ? '#3b82f6' : '#ef4444'
        fillOpacity = data.hasFQHC ? 0.5 : 0.7
        break
    }
  }
  return { fillColor, fillOpacity: hov ? 0.92 : fillOpacity, color: hov ? PRI : 'rgba(255,255,255,0.12)', weight: hov ? 2.5 : 0.8 }
}

function sortValue(c: CountyData, mode: ColorMode): number {
  switch (mode) {
    case 'svi':      return c.sviScore ?? 0
    case 'hpsa':     return c.primaryCareScore ?? 0
    case 'diabetes': return c.diabetesRate ?? 0
    case 'poverty':  return c.povertyRate ?? 0
    case 'fqhc':     return c.hasFQHC ? 0 : 1
    default:         return 0
  }
}

function valueLabel(c: CountyData, mode: ColorMode): string {
  switch (mode) {
    case 'svi':      return `SVI ${(c.sviScore ?? 0).toFixed(3)}`
    case 'hpsa':     return `HPSA ${c.primaryCareScore ?? 0}`
    case 'diabetes': return `${c.diabetesRate ?? 0}% diabetes`
    case 'poverty':  return `${c.povertyRate ?? 0}% poverty`
    case 'fqhc':     return c.hasFQHC ? 'Has FQHC' : 'No FQHC'
    default:         return ''
  }
}

function needColor(c: CountyData, mode: ColorMode): string {
  const fc = (getStyle(c, mode) as { fillColor: string }).fillColor
  return fc
}

export default function EquityMap() {
  const router      = useRouter()
  const mapRef      = useRef<HTMLDivElement>(null)
  const leafletRef  = useRef<Record<string, unknown> | null>(null)
  const geoLayerRef = useRef<unknown>(null)
  const dataRef     = useRef<Record<string, CountyData>>({})

  const [colorMode,    setColorMode]    = useState<ColorMode>('svi')
  const colorModeRef                   = useRef<ColorMode>('svi')
  const [countyData,   setCountyData]   = useState<Record<string, CountyData>>({})
  const [hovered,      setHovered]      = useState<CountyData | null>(null)
  const [mapReady,     setMapReady]     = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)

  // Init Leaflet
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return
    import('leaflet').then(L => {
      if (leafletRef.current || !mapRef.current) return
      mapRef.current.innerHTML = ''
      const map = L.map(mapRef.current, { center: [32.8, -89.4], zoom: 7, zoomControl: false, attributionControl: false, scrollWheelZoom: false })
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', { maxZoom: 7, opacity: 0.55 }).addTo(map)
      leafletRef.current = { map, L } as Record<string, unknown>
      setMapReady(true)
    })
    return () => {
      if (leafletRef.current) { (leafletRef.current as { map: L.Map }).map.remove(); leafletRef.current = null }
    }
  }, [])

  // Load GeoJSON polygons
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
      const layer = (L as typeof import('leaflet')).geoJSON({ type: 'FeatureCollection', features: msFeatures } as GeoJSON.GeoJsonObject, {
        style: (feature) => getStyle(dataRef.current[String(feature?.id || feature?.properties?.GEOID || '')], colorModeRef.current) as L.PathOptions,
        onEachFeature: (feature, layer) => {
          const fips = String(feature.id || feature.properties?.GEOID || '')
          layer.on('mouseover', (e: L.LeafletMouseEvent) => {
            setHovered(dataRef.current[fips] ?? { fips, name: feature.properties?.NAME || '', loaded: false })
            ;(e.target as L.Path).setStyle({ fillOpacity: 0.92, weight: 2.5, color: PRI })
          })
          layer.on('mouseout', (e: L.LeafletMouseEvent) => {
            setHovered(null)
            ;(e.target as L.Path).setStyle(getStyle(dataRef.current[fips], colorModeRef.current) as L.PathOptions)
          })
          layer.on('click', () => router.push(`/county/${fips}`))
        },
      }).addTo(map)
      geoLayerRef.current = layer
    })
  }, [mapReady, router])

  // Load county health data in batches
  useEffect(() => {
    if (!mapReady) return
    let cancelled = false; let count = 0
    const loaded: Record<string, CountyData> = {}

    async function loadBatch(batch: string[]) {
      await Promise.all(batch.map(async fips => {
        try {
          const res = await fetch(`/api/county/${fips}`)
          const data = await res.json()
          if (!data.success || cancelled) return
          const p = data.profile
          loaded[fips] = { fips, name: p.countyName, sviScore: p.sviScore, primaryCareScore: p.primaryCareScore, isMUA: p.isMUA, isRural: p.isRural, hasFQHC: p.hasFQHC, diabetesRate: p.diabetesRate, povertyRate: p.povertyRate, loaded: true }
          count++; setLoadProgress(Math.round((count / 82) * 100))
        } catch { /* skip */ }
      }))
      if (!cancelled) {
        setCountyData(prev => ({ ...prev, ...loaded }))
        if (geoLayerRef.current) {
          const layer = geoLayerRef.current as L.GeoJSON
          layer.setStyle((feature) => getStyle(loaded[String(feature?.id || feature?.properties?.GEOID || '')] ?? dataRef.current[String(feature?.id || feature?.properties?.GEOID || '')], colorModeRef.current) as L.PathOptions)
        }
      }
    }

    async function loadAll() {
      const fips = MS_COUNTIES.map(c => c.fips)
      for (let i = 0; i < fips.length; i += 8) {
        if (cancelled) break
        await loadBatch(fips.slice(i, i + 8))
        await new Promise(r => setTimeout(r, 80))
      }
    }
    loadAll()
    return () => { cancelled = true }
  }, [mapReady])

  useEffect(() => {
    dataRef.current = countyData
    if (!geoLayerRef.current) return
    const layer = geoLayerRef.current as L.GeoJSON
    layer.setStyle((feature) => getStyle(countyData[String(feature?.id || feature?.properties?.GEOID || '')], colorModeRef.current) as L.PathOptions)
  }, [countyData])

  const handleModeChange = (mode: ColorMode) => {
    colorModeRef.current = mode; setColorMode(mode)
    if (!geoLayerRef.current) return
    const layer = geoLayerRef.current as L.GeoJSON
    layer.setStyle((feature) => getStyle(dataRef.current[String(feature?.id || feature?.properties?.GEOID || '')], mode) as L.PathOptions)
  }

  const counties = Object.values(countyData).filter(c => c.loaded)

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', background: '#171309' }}>

      {/* ── Map ── */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0, minHeight: 0 }}>
        <div ref={mapRef} style={{ position: 'absolute', inset: 0 }} />

        {/* Color mode bar —> inside map div so 50% centers within map only */}
        <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'flex', gap: 2, background: CARD, border: `1px solid ${BDR2}`, borderRadius: 4, padding: 3 }}>
          {(Object.keys(MODE_LABELS) as ColorMode[]).map(mode => (
            <button key={mode} onClick={() => handleModeChange(mode)}
              style={{ fontFamily: GEIST, fontSize: 11, letterSpacing: '0.05em', padding: '6px 14px', textTransform: 'uppercase', background: colorMode === mode ? CARDHI : 'transparent', border: `1px solid ${colorMode === mode ? BDR2 : 'transparent'}`, borderRadius: 2, color: colorMode === mode ? PRI_TXT : TXT2, cursor: 'pointer', fontWeight: colorMode === mode ? 700 : 400, transition: 'all 0.15s' }}
              onMouseEnter={e => { if (colorMode !== mode) { e.currentTarget.style.color = TXT; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' } }}
              onMouseLeave={e => { if (colorMode !== mode) { e.currentTarget.style.color = TXT2; e.currentTarget.style.background = 'transparent' } }}>
              {mode.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Hover tooltip —> matches grant card expanded style */}
        {hovered && (
          <div style={{ ...glassCard, position: 'absolute', bottom: 20, left: 20, padding: '16px 20px', zIndex: 999, minWidth: 256, pointerEvents: 'none', borderLeft: `3px solid ${PRI}` }}>
            <div style={{ fontFamily: GEIST, fontSize: 17, fontWeight: 700, color: TXT, marginBottom: 10, lineHeight: 1.3 }}>
              {hovered.name} <span style={{ color: TXT3, fontWeight: 400 }}>County</span>
            </div>
            {hovered.loaded ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
                  {[
                    { label: 'SVI Score',  value: (hovered.sviScore ?? 0).toFixed(3),  alert: (hovered.sviScore ?? 0) > 0.75 },
                    { label: 'HPSA Score', value: String(hovered.primaryCareScore || 'N/A') },
                    { label: 'Diabetes',   value: `${hovered.diabetesRate ?? 0}%`,      alert: (hovered.diabetesRate ?? 0) > 14.5 },
                    { label: 'Poverty',    value: `${hovered.povertyRate ?? 0}%`,       alert: (hovered.povertyRate ?? 0) > 25 },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '3px 0', borderBottom: `1px solid ${BDR}` }}>
                      <span style={{ color: TXT3, fontSize: 11, fontFamily: GEIST, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{row.label}</span>
                      <span style={{ fontFamily: GEIST, fontSize: 12, fontWeight: 700, color: row.alert ? RED : TXT }}>{row.value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                  {hovered.isMUA                   && <span style={{ background: 'rgba(250,204,21,0.12)', border: `1px solid rgba(250,204,21,0.3)`, color: PRI,   borderRadius: 2, padding: '2px 8px', fontSize: 9, fontFamily: GEIST, fontWeight: 700, letterSpacing: '0.08em' }}>MUA</span>}
                  {(hovered.primaryCareScore ?? 0) > 0 && <span style={{ background: 'rgba(255,180,171,0.12)', border: `1px solid rgba(255,180,171,0.3)`, color: RED,   borderRadius: 2, padding: '2px 8px', fontSize: 9, fontFamily: GEIST, fontWeight: 700, letterSpacing: '0.08em' }}>HPSA</span>}
                  {hovered.isRural                 && <span style={{ background: 'rgba(154,144,120,0.12)', border: `1px solid ${BDR2}`,                  color: TXT3,  borderRadius: 2, padding: '2px 8px', fontSize: 9, fontFamily: GEIST, fontWeight: 700, letterSpacing: '0.08em' }}>RURAL</span>}
                  {hovered.hasFQHC ? <span style={{ background: 'rgba(190,198,224,0.12)', border: `1px solid rgba(190,198,224,0.3)`, color: BLU, borderRadius: 2, padding: '2px 8px', fontSize: 9, fontFamily: GEIST, fontWeight: 700, letterSpacing: '0.08em' }}>FQHC</span>
                                   : <span style={{ background: 'rgba(255,180,171,0.12)', border: `1px solid rgba(255,180,171,0.3)`, color: RED, borderRadius: 2, padding: '2px 8px', fontSize: 9, fontFamily: GEIST, fontWeight: 700, letterSpacing: '0.08em' }}>NO FQHC</span>}
                </div>
              </>
            ) : (
              <div style={{ color: TXT3, fontSize: 11, fontFamily: GEIST, marginBottom: 10 }}>Loading data...</div>
            )}
            <div style={{ color: PRI, fontSize: 10, fontFamily: GEIST, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Click to view grant matches →</div>
          </div>
        )}

        {/* Legend */}
        <div style={{ ...glassCard, position: 'absolute', bottom: 20, right: 20, padding: '14px 16px', zIndex: 999, minWidth: 180 }}>
          <div style={{ fontFamily: GEIST, fontSize: 9, color: TXT3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${BDR2}`, borderLeft: `2px solid ${PRI}`, paddingLeft: 8 }}>
            {MODE_LABELS[colorMode]}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {LEGENDS[colorMode].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 14, height: 14, background: item.color, borderRadius: 2, flexShrink: 0, border: `1px solid rgba(255,255,255,0.1)` }} />
                <span style={{ color: TXT2, fontSize: 10, fontFamily: SANS }}>{item.label}</span>
              </div>
            ))}
          </div>
          {loadProgress < 100 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BDR2}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: TXT3, fontSize: 9, fontFamily: GEIST, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Loading data</span>
                <span style={{ color: PRI, fontSize: 9, fontFamily: GEIST, fontWeight: 700 }}>{loadProgress}%</span>
              </div>
              <div style={{ height: 3, background: SURF, borderRadius: 99 }}>
                <div style={{ height: '100%', width: `${loadProgress}%`, background: PRI, borderRadius: 99, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Sidebar ── */}
      <div style={{ width: 248, background: '#110e05', borderLeft: `1px solid ${BDR2}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BDR2}`, fontFamily: GEIST, fontSize: 9, color: TXT3, letterSpacing: '0.14em', textTransform: 'uppercase', paddingLeft: 20, borderLeft: `2px solid ${PRI}`, marginLeft: 4 }}>
          Highest Need — {MODE_LABELS[colorMode]}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {counties.length === 0 && (
            <div style={{ padding: '24px 16px', color: TXT3, fontSize: 11, fontFamily: GEIST, textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: PRI, display: 'block', marginBottom: 8 }}>hourglass_top</span>
              Loading counties...
            </div>
          )}
          {[...counties]
            .sort((a, b) => sortValue(b, colorMode) - sortValue(a, colorMode))
            .slice(0, 10)
            .map((county, i) => (
              <button key={county.fips} onClick={() => router.push(`/county/${county.fips}`)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'transparent', border: 'none', borderBottom: `1px solid ${BDR}`, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = CARD }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <span style={{ fontFamily: GEIST, fontSize: 11, fontWeight: 700, color: i < 5 ? RED : TXT3, width: 20, flexShrink: 0, lineHeight: 1 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: TXT, fontSize: 13, fontWeight: 600, fontFamily: GEIST, lineHeight: 1.2 }}>{county.name}</div>
                  <div style={{ color: TXT3, fontSize: 10, fontFamily: GEIST, marginTop: 2, letterSpacing: '0.04em' }}>{valueLabel(county, colorMode)}</div>
                </div>
                <div style={{ width: 9, height: 9, borderRadius: 2, background: needColor(county, colorMode), flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }} />
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}
