'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MS_COUNTIES } from '@/types'

interface CountyMapData {
  fips: string
  countyName: string
  lat: number
  lng: number
  sviScore: number
  primaryCareScore: number
  isMUA: boolean
  isRural: boolean
  hasFQHC: boolean
  diabetesRate: number
  povertyRate: number
  matchCount: number
}

type ColorMode = 'svi' | 'hpsa' | 'diabetes' | 'poverty' | 'fqhc'

function getColor(county: CountyMapData, mode: ColorMode): string {
  const red    = (a: number) => `rgba(239,68,68,${a})`
  const amber  = (a: number) => `rgba(245,158,11,${a})`
  const green  = (a: number) => `rgba(16,185,129,${a})`
  const blue   = (a: number) => `rgba(59,130,246,${a})`

  switch (mode) {
    case 'svi': {
      const v = county.sviScore
      if (v >= 0.9) return red(0.85)
      if (v >= 0.75) return red(0.55)
      if (v >= 0.5) return amber(0.55)
      if (v >= 0.25) return amber(0.3)
      return green(0.4)
    }
    case 'hpsa': {
      const v = county.primaryCareScore
      if (v >= 20) return red(0.85)
      if (v >= 17) return red(0.55)
      if (v >= 14) return amber(0.6)
      if (v >= 10) return amber(0.35)
      return green(0.35)
    }
    case 'diabetes': {
      const v = county.diabetesRate
      if (v >= 18) return red(0.85)
      if (v >= 16) return red(0.55)
      if (v >= 14) return amber(0.6)
      if (v >= 12) return amber(0.35)
      return green(0.35)
    }
    case 'poverty': {
      const v = county.povertyRate
      if (v >= 35) return red(0.85)
      if (v >= 25) return red(0.55)
      if (v >= 18) return amber(0.6)
      if (v >= 12) return amber(0.35)
      return green(0.35)
    }
    case 'fqhc':
      return county.hasFQHC ? blue(0.5) : red(0.7)
    default:
      return amber(0.4)
  }
}

const MODE_LABELS: Record<ColorMode, string> = {
  svi: 'Social Vulnerability (SVI)',
  hpsa: 'HPSA Score',
  diabetes: 'Diabetes Rate',
  poverty: 'Poverty Rate',
  fqhc: 'FQHC Presence',
}

export default function MapPage() {
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<unknown>(null)
  const markersRef = useRef<unknown[]>([])

  const [counties, setCounties] = useState<CountyMapData[]>([])
  const [loading, setLoading] = useState(true)
  const [colorMode, setColorMode] = useState<ColorMode>('svi')
  const [hovered, setHovered] = useState<CountyMapData | null>(null)
  const [loaded, setLoaded] = useState(0)

  // Load all county data in batches
  useEffect(() => {
    let cancelled = false
    const results: CountyMapData[] = []

    async function loadBatch(fipsList: string[]) {
      const promises = fipsList.map(async fips => {
        try {
          const res = await fetch(`/api/county/${fips}`)
          const data = await res.json()
          if (!data.success) return null
          const p = data.profile
          return {
            fips: p.fips,
            countyName: p.countyName,
            lat: p.lat,
            lng: p.lng,
            sviScore: p.sviScore,
            primaryCareScore: p.primaryCareScore,
            isMUA: p.isMUA,
            isRural: p.isRural,
            hasFQHC: p.hasFQHC,
            diabetesRate: p.diabetesRate,
            povertyRate: p.povertyRate,
            matchCount: 0,
          } as CountyMapData
        } catch { return null }
      })
      const batch = (await Promise.all(promises)).filter(Boolean) as CountyMapData[]
      if (!cancelled) {
        results.push(...batch)
        setLoaded(results.length)
        setCounties([...results])
      }
    }

    // Load in batches of 10 to avoid overwhelming the server
    async function loadAll() {
      const fips = MS_COUNTIES.map(c => c.fips)
      const batchSize = 10
      for (let i = 0; i < fips.length; i += batchSize) {
        if (cancelled) break
        await loadBatch(fips.slice(i, i + batchSize))
      }
      if (!cancelled) setLoading(false)
    }

    loadAll()
    return () => { cancelled = true }
  }, [])

// Init Leaflet map
useEffect(() => {
    if (!mapRef.current || leafletRef.current) return

    let map: L.Map

    // Dynamically import leaflet (client-only)
    import('leaflet').then(L => {
      // Guard against StrictMode double-invoke
      if (leafletRef.current) return
      if (!mapRef.current) return

      // Clear any previous instance
      mapRef.current.innerHTML = ''

      map = L.map(mapRef.current, {
        center: [32.7, -89.5],
        zoom: 7,
        zoomControl: true,
        attributionControl: false,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
        maxZoom: 12,
      }).addTo(map)

      leafletRef.current = { map, L }
    })

    return () => {
      if (leafletRef.current) {
        const { map } = leafletRef.current as { map: L.Map }
        map.remove()
        leafletRef.current = null
      }
    }
  }, [])

  // Update markers when counties or color mode changes
  useEffect(() => {
    if (!leafletRef.current || !counties.length) return
    const { map, L } = leafletRef.current as { map: L.Map; L: typeof import('leaflet') }

    // Remove old markers
    markersRef.current.forEach((m: unknown) => (m as L.Layer).remove())
    markersRef.current = []

    counties.forEach(county => {
      const color = getColor(county, colorMode)

      const marker = L.circleMarker([county.lat, county.lng], {
        radius: Math.max(6, Math.min(14, county.primaryCareScore * 0.5 + 4)),
        fillColor: color,
        fillOpacity: 0.85,
        color: 'rgba(255,255,255,0.2)',
        weight: 1,
      })

      marker.on('mouseover', () => setHovered(county))
      marker.on('mouseout', () => setHovered(null))
      marker.on('click', () => router.push(`/county/${county.fips}`))

      marker.addTo(map)
      markersRef.current.push(marker)
    })
  }, [counties, colorMode, router])

  const stats = counties.length ? {
    avgSVI: (counties.reduce((s, c) => s + c.sviScore, 0) / counties.length).toFixed(3),
    hpsaCount: counties.filter(c => c.primaryCareScore > 0).length,
    noFQHC: counties.filter(c => !c.hasFQHC).length,
    muaCount: counties.filter(c => c.isMUA).length,
  } : null

  return (
    <main style={{ background: 'var(--navy)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{
        borderBottom: '1px solid var(--border)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(10,15,30,0.95)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.push('/')} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--slate)', fontSize: 12,
            fontFamily: 'IBM Plex Mono, monospace',
          }}>
            ← GRANTIQ
          </button>
          <span style={{ color: 'var(--border)' }}>/</span>
          <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: 'var(--white)', fontWeight: 600 }}>
            MISSISSIPPI HEALTH EQUITY MAP
          </span>
          {loading && (
            <span style={{ color: 'var(--amber)', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, animation: 'pulse-amber 1.5s infinite' }}>
              LOADING {loaded}/82
            </span>
          )}
        </div>

        {/* Color mode selector */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(Object.keys(MODE_LABELS) as ColorMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setColorMode(mode)}
              style={{
                padding: '4px 10px',
                background: colorMode === mode ? 'rgba(245,158,11,0.15)' : 'transparent',
                border: `1px solid ${colorMode === mode ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
                borderRadius: 2,
                color: colorMode === mode ? 'var(--amber)' : 'var(--slate-2)',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.05em',
                transition: 'all 0.2s',
              }}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
      </nav>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Map */}
        <div style={{ flex: 1, position: 'relative' }}>
          <div ref={mapRef} style={{ width: '100%', height: 'calc(100vh - 90px)' }} />

          {/* Hover tooltip */}
          {hovered && (
            <div style={{
              position: 'absolute',
              bottom: 20,
              left: 20,
              background: 'var(--navy-2)',
              border: '1px solid var(--border)',
              borderRadius: 2,
              padding: '14px 18px',
              zIndex: 999,
              minWidth: 240,
              pointerEvents: 'none',
            }}>
              <div style={{
                fontFamily: 'IBM Plex Serif, serif',
                fontSize: 18,
                fontWeight: 600,
                marginBottom: 6,
              }}>
                {hovered.countyName} County
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {[
                  { label: 'SVI Score', value: hovered.sviScore.toFixed(3), alert: hovered.sviScore > 0.75 },
                  { label: 'HPSA Score', value: hovered.primaryCareScore || 'Not designated' },
                  { label: 'Diabetes Rate', value: `${hovered.diabetesRate}%`, alert: hovered.diabetesRate > 14.5 },
                  { label: 'Poverty Rate', value: `${hovered.povertyRate}%`, alert: hovered.povertyRate > 25 },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                    <span style={{ color: 'var(--slate-2)', fontSize: 11 }}>{row.label}</span>
                    <span style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 11,
                      fontWeight: 600,
                      color: (row as { alert?: boolean }).alert ? 'var(--red)' : 'var(--white)',
                    }}>{row.value}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {hovered.isMUA && <span className="badge badge-amber">MUA</span>}
                  {hovered.primaryCareScore > 0 && <span className="badge badge-red">HPSA</span>}
                  {hovered.isRural && <span className="badge badge-slate">RURAL</span>}
                  {hovered.hasFQHC && <span className="badge badge-blue">FQHC</span>}
                  {!hovered.hasFQHC && <span className="badge badge-red">NO FQHC</span>}
                </div>
                <div style={{ marginTop: 8, color: 'var(--amber)', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}>
                  CLICK TO VIEW GRANT MATCHES →
                </div>
              </div>
            </div>
          )}

          {/* Legend */}
          <div style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'rgba(17,24,39,0.9)',
            border: '1px solid var(--border)',
            borderRadius: 2,
            padding: '12px 16px',
            zIndex: 999,
            minWidth: 180,
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{ color: 'var(--slate-2)', fontSize: 9, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.1em', marginBottom: 10 }}>
              {MODE_LABELS[colorMode].toUpperCase()}
            </div>
            {colorMode !== 'fqhc' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[
                  { color: 'rgba(239,68,68,0.85)', label: colorMode === 'svi' ? '≥0.90 Critical' : colorMode === 'hpsa' ? '≥20 Critical' : colorMode === 'diabetes' ? '≥18% Critical' : '≥35% Critical' },
                  { color: 'rgba(239,68,68,0.55)', label: colorMode === 'svi' ? '0.75–0.90 High' : colorMode === 'hpsa' ? '17–19 High' : colorMode === 'diabetes' ? '16–18% High' : '25–35% High' },
                  { color: 'rgba(245,158,11,0.6)',  label: colorMode === 'svi' ? '0.50–0.75 Moderate' : colorMode === 'hpsa' ? '14–16 Moderate' : colorMode === 'diabetes' ? '14–16% Moderate' : '18–25% Moderate' },
                  { color: 'rgba(16,185,129,0.4)',  label: 'Lower need' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                    <span style={{ color: 'var(--slate)', fontSize: 10 }}>{item.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'rgba(59,130,246,0.5)' }} />
                  <span style={{ color: 'var(--slate)', fontSize: 10 }}>Has FQHC</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'rgba(239,68,68,0.7)' }} />
                  <span style={{ color: 'var(--slate)', fontSize: 10 }}>No FQHC (Priority)</span>
                </div>
              </div>
            )}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', color: 'var(--slate-2)', fontSize: 9, fontFamily: 'IBM Plex Mono, monospace' }}>
              CIRCLE SIZE = HPSA SCORE
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{
          width: 280,
          background: 'var(--navy-2)',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {/* Stats */}
          {stats && (
            <div style={{
              padding: '16px',
              borderBottom: '1px solid var(--border)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}>
              {[
                { label: 'Loaded', value: `${counties.length}/82` },
                { label: 'Avg SVI', value: stats.avgSVI },
                { label: 'HPSA Counties', value: stats.hpsaCount },
                { label: 'No FQHC', value: stats.noFQHC },
              ].map(s => (
                <div key={s.label} style={{
                  background: 'var(--navy-3)',
                  border: '1px solid var(--border)',
                  borderRadius: 2,
                  padding: '10px 12px',
                }}>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 18, fontWeight: 700, color: 'var(--amber)', lineHeight: 1 }}>{s.value}</div>
                  <div style={{ color: 'var(--slate-2)', fontSize: 10, marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* County list sorted by current metric */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            <div style={{ padding: '8px 16px 4px', color: 'var(--slate-2)', fontSize: 9, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.1em' }}>
              HIGHEST NEED — {MODE_LABELS[colorMode].toUpperCase()}
            </div>
            {[...counties]
              .sort((a, b) => {
                switch (colorMode) {
                  case 'svi':      return b.sviScore - a.sviScore
                  case 'hpsa':     return b.primaryCareScore - a.primaryCareScore
                  case 'diabetes': return b.diabetesRate - a.diabetesRate
                  case 'poverty':  return b.povertyRate - a.povertyRate
                  case 'fqhc':     return (a.hasFQHC ? 1 : 0) - (b.hasFQHC ? 1 : 0)
                  default:         return 0
                }
              })
              .slice(0, 20)
              .map((county, i) => (
                <button
                  key={county.fips}
                  onClick={() => router.push(`/county/${county.fips}`)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 16px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--navy-3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 10,
                    color: i < 5 ? 'var(--red)' : 'var(--slate-2)',
                    width: 20,
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--white)', fontSize: 12, fontWeight: 500 }}>{county.countyName}</div>
                    <div style={{ color: 'var(--slate-2)', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', marginTop: 1 }}>
                      {colorMode === 'svi'      && `SVI ${county.sviScore.toFixed(3)}`}
                      {colorMode === 'hpsa'     && `HPSA ${county.primaryCareScore}`}
                      {colorMode === 'diabetes' && `${county.diabetesRate}% diabetes`}
                      {colorMode === 'poverty'  && `${county.povertyRate}% poverty`}
                      {colorMode === 'fqhc'     && (county.hasFQHC ? 'Has FQHC' : 'No FQHC')}
                    </div>
                  </div>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: getColor(county, colorMode), flexShrink: 0 }} />
                </button>
              ))}
          </div>
        </div>
      </div>
    </main>
  )
}