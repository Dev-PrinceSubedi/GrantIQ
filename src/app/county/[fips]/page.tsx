'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CountyProfile, GrantMatch, GrantsAPIResponse, MS_COUNTIES } from '@/types'
import BriefGenerator from '@/components/BriefGenerator'
import EquityMap from '@/components/EquityMap'
import DataAnalysis from '@/components/DataAnalysis'
import { useBreakpoint } from '@/lib/useBreakpoint'

function fmtPct(v: number) { return `${v.toFixed(1)}%` }
function fmtD(v: number, d = 3) { return v.toFixed(d) }
function fmtM(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}
type SortMode   = 'match' | 'deadline' | 'award'
type TabMode    = 'grants' | 'near' | 'health'
type NavSection = 'intelligence' | 'geographic' | 'analysis'

//Stitch design tokens — reference CSS vars so themes cascade automatically
const BG      = 'var(--s-bg)'
const SURF    = 'var(--s-surf)'
const CARD    = 'var(--s-card)'
const CARDHI  = 'var(--s-cardhi)'
const BDR     = 'var(--s-bdr)'
const BDR2    = 'var(--s-bdr2)'
const OUTLINE = 'var(--s-txt3)'
const PRI     = 'var(--s-pri)'
const PRI_TXT = 'var(--s-pri-txt)'
const GRN     = 'var(--s-grn)'
const GRN_DIM = 'var(--s-grn-dim)'
const RED     = 'var(--s-red)'
const BLU     = 'var(--s-blu)'
const TXT     = 'var(--s-txt)'
const TXT2    = 'var(--s-txt2)'
const TXT3    = OUTLINE
const SANS    = "'IBM Plex Sans', Inter, sans-serif"
const GEIST   = "'IBM Plex Sans', Inter, sans-serif"
const MONO    = "'IBM Plex Mono', monospace"

// Solid panel card 
const glassCard: React.CSSProperties = {
  background: 'var(--s-card)',
  border: `1px solid ${BDR}`,
  borderRadius: 3,
}

const A_COLOR: Record<string, string> = {
  HRSA: '#2d7a5c', CDC: '#2a6b7c', SAMHSA: '#5c4a8c',
  USDA: '#7a5c2d', NIH: '#7a2d5c', ACF: '#2d5080', CMS: '#7a4a2d',
}
const A_LABEL: Record<string, string> = {
  HRSA: 'HRSA', CDC: 'CDC', SAMHSA: 'SAMHSA',
  USDA: 'USDA/RD', NIH: 'NIH', ACF: 'ACF/HHS', CMS: 'CMS/HHS',
}

function agencyKey(code?: string | null) {
  return Object.keys(A_COLOR).find(k => code?.toUpperCase().includes(k)) ?? ''
}
function needTag(score: number) {
  if (score >= 85) return { label: 'Critical',  color: RED,     bg: 'rgba(255,180,171,0.12)' }
  if (score >= 70) return { label: 'High',       color: PRI,     bg: 'rgba(250,204,21,0.12)' }
  if (score >= 50) return { label: 'Moderate',   color: TXT2,    bg: 'rgba(209,198,171,0.1)' }
  return              { label: 'Low',         color: BLU,     bg: 'rgba(190,198,224,0.1)' }
}

// ── Conic-gradient score ring (Stitch pattern) ────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? GRN_DIM : score >= 60 ? PRI : BLU
  return (
    <div style={{ position: 'relative', width: 76, height: 76, flexShrink: 0 }}>
      <div style={{
        width: 76, height: 76, borderRadius: '50%',
        background: `conic-gradient(${color} ${score}%, var(--s-surf) 0)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: CARD, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color, lineHeight: 1 }}>{score}%</span>
        </div>
      </div>
    </div>
  )
}

// ── County selector pill ──────────────────────────────────────────────────────
function CountyPill({ name, onSelect }: { name: string; onSelect: (f: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ]       = useState('')
  const ref             = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const list = useMemo(() =>
    MS_COUNTIES.filter(c => c.name.toLowerCase().includes(q.toLowerCase())), [q])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => { setOpen(o => !o); setQ('') }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(250,204,21,0.08)', border: `1px solid rgba(250,204,21,0.3)`, borderRadius: 4, padding: '6px 14px', cursor: 'pointer', transition: 'all 0.2s' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(250,204,21,0.14)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(250,204,21,0.08)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: PRI }}>location_on</span>
        <span style={{ fontFamily: GEIST, fontSize: 12, color: PRI, letterSpacing: '0.06em', fontWeight: 600 }}>{name} County</span>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: TXT3 }}>expand_more</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, ...glassCard, width: 280, zIndex: 600, boxShadow: '0 24px 64px rgba(0,0,0,0.8)' }}>
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${BDR2}` }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search county..."
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BDR2}`, borderRadius: 4, color: TXT, fontSize: 13, padding: '8px 12px', outline: 'none', fontFamily: SANS, boxSizing: 'border-box' }} />
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {list.map(c => (
              <button key={c.fips} onClick={() => { onSelect(c.fips); setOpen(false) }}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: `1px solid ${BDR}`, color: TXT2, cursor: 'pointer', fontSize: 13, textAlign: 'left', fontFamily: SANS, transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(250,204,21,0.07)'; e.currentTarget.style.color = TXT }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = TXT2 }}>
                <span>{c.name}</span>
                <span style={{ color: TXT3, fontSize: 11, fontFamily: GEIST }}>{c.fips}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Nav link ──────────────────────────────────────────────────────────────────
function NavLink({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', background: active ? CARDHI : 'transparent', boxShadow: active ? `inset 2px 0 0 ${PRI}` : 'none', border: 'none', color: active ? PRI_TXT : TXT2, borderRadius: 2, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', fontFamily: GEIST, fontSize: 13, fontWeight: active ? 600 : 400 }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = CARD; e.currentTarget.style.color = TXT } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = TXT2 } }}>
      <span className="material-symbols-outlined" style={{ fontSize: 18, opacity: active ? 1 : 0.7 }}>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ value, color, max = 100 }: { value: number; color: string; max?: number }) {
  return (
    <div style={{ height: 4, background: SURF, borderRadius: 99, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, (value / max) * 100)}%`, background: color, borderRadius: 99 }} />
    </div>
  )
}

// ── Grant card (Stitch style) ─────────────────────────────────────────────────
function GrantCard({ grant, nearMiss }: { grant: GrantMatch; nearMiss?: boolean }) {
  const [open, setOpen] = useState(false)
  const { isMobile }    = useBreakpoint()
  const ak     = agencyKey(grant.agencyCode)
  const color  = A_COLOR[ak] || '#574500'
  const label  = A_LABEL[ak] || 'GOV'
  const score  = Math.round(grant.matchScore)
  const need   = needTag(grant.needScore)
  const url    = grant.opportunityId && /^\d+$/.test(grant.opportunityId)
    ? `https://www.grants.gov/search-results-detail/${grant.opportunityId}` : null
  const award  = grant.awardCeiling ? `$${grant.awardCeiling.toLocaleString()}` : null
  const urgent = grant.daysUntilClose != null && grant.daysUntilClose <= 14

  return (
    <article
      style={{ ...glassCard, position: 'relative', overflow: 'hidden', marginBottom: 8, transition: 'border-color 0.2s', borderLeft: urgent ? `3px solid ${RED}` : `3px solid ${color}` }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = urgent ? RED : PRI }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = urgent ? RED : color }}>

      {/* Deadline badge format */}
      {grant.daysUntilClose != null && grant.daysUntilClose <= 60 && (
        <div style={{
          position: 'absolute', top: 0, right: 0,
          background: urgent ? RED : grant.daysUntilClose <= 30 ? 'rgba(245,158,11,0.15)' : 'rgba(148,163,184,0.12)',
          color: urgent ? '#690005' : grant.daysUntilClose <= 30 ? PRI : TXT3,
          border: urgent ? 'none' : `1px solid ${grant.daysUntilClose <= 30 ? 'rgba(245,158,11,0.4)' : BDR2}`,
          padding: '2px 8px', fontSize: 9, fontFamily: GEIST, fontWeight: 700, letterSpacing: '0.06em',
          display: 'flex', alignItems: 'center', gap: 3,
        }}>
          {urgent && <span className="material-symbols-outlined" style={{ fontSize: 10 }}>local_fire_department</span>}
          {grant.daysUntilClose <= 0 ? 'CLOSING TODAY' : `${grant.daysUntilClose}D LEFT`}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', gap: 20 }}>

          {/* Agency icon block — hide on mobile */}
          {!isMobile && (
            <div style={{ width: 72, height: 72, flexShrink: 0, background: CARDHI, border: `1px solid ${BDR2}`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 36, color }}>
                {ak === 'HRSA' ? 'health_and_safety' : ak === 'CDC' ? 'coronavirus' : ak === 'NIH' ? 'biotech' : ak === 'USDA' ? 'grass' : ak === 'SAMHSA' ? 'psychology' : ak === 'CMS' ? 'medical_services' : 'account_balance'}
              </span>
            </div>
          )}

          {/* Main content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: color, background: color + '22', border: `1px solid ${color}44`, borderRadius: 2, padding: '2px 8px' }}>{label}</span>
              {grant.opportunityId && <span style={{ color: TXT3, fontSize: 10, fontFamily: MONO }}>#{grant.opportunityId.slice(0, 12)}</span>}
              {nearMiss && <span style={{ background: `${PRI}18`, color: PRI, border: `1px solid ${PRI}44`, borderRadius: 2, padding: '1px 8px', fontSize: 10, fontFamily: GEIST }}>Near Miss</span>}
            </div>

            <h3 style={{ color: TXT, fontSize: isMobile ? 15 : 17, fontWeight: 600, lineHeight: 1.45, marginBottom: 10, fontFamily: GEIST }}>{grant.title}</h3>

            {award && (
              <p style={{ color: PRI_TXT, fontSize: isMobile ? 16 : 20, fontWeight: 600, fontFamily: MONO, marginBottom: 12, lineHeight: 1 }}>
                {award} <span style={{ fontSize: 11, color: TXT3, fontWeight: 400, fontFamily: GEIST }}>max award</span>
              </p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 480 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: GEIST, fontSize: 11, marginBottom: 5 }}>
                  <span style={{ color: TXT3 }}>Eligibility</span>
                  <span style={{ color: PRI_TXT, fontFamily: MONO }}>{Math.round(grant.eligibilityScore)}%</span>
                </div>
                <ProgressBar value={grant.eligibilityScore} color={PRI} />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: GEIST, fontSize: 11, marginBottom: 5 }}>
                  <span style={{ color: TXT3 }}>Community Need</span>
                  <span style={{ color: need.color }}>{need.label}</span>
                </div>
                <ProgressBar value={grant.needScore} color={need.color} />
              </div>
            </div>
          </div>

          {/* Score ring + actions —> right column on desktop, row below on mobile */}
          {!isMobile && (
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingLeft: 24, borderLeft: `1px solid ${BDR2}`, minWidth: 140 }}>
              <ScoreRing score={score} />
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'block', width: '100%', textAlign: 'center', background: PRI, color: '#1a1200', borderRadius: 2, padding: '8px 4px', fontSize: 12, fontFamily: GEIST, fontWeight: 600, textDecoration: 'none', transition: 'filter 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1.1)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = 'none' }}>
                  Apply →
                </a>
              ) : (
                <div style={{ width: '100%', textAlign: 'center', background: `${PRI}14`, border: `1px solid ${PRI}33`, color: PRI, borderRadius: 2, padding: '8px 4px', fontSize: 12, fontFamily: GEIST }}>Apply →</div>
              )}
              <button onClick={() => setOpen(o => !o)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'transparent', border: `1px solid ${BDR2}`, color: TXT2, borderRadius: 2, padding: '7px 4px', fontSize: 12, fontFamily: GEIST, cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = BDR2; e.currentTarget.style.color = TXT }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = BDR2; e.currentTarget.style.color = TXT2 }}>
                Details
                <span className="material-symbols-outlined" style={{ fontSize: 14, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>expand_more</span>
              </button>
            </div>
          )}
        </div>

        {/* Mobile score + actions row */}
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${BDR}` }}>
            <ScoreRing score={score} />
            <div style={{ display: 'flex', flex: 1, gap: 8 }}>
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, textAlign: 'center', background: PRI, color: '#1a1200', borderRadius: 2, padding: '10px 4px', fontSize: 12, fontFamily: GEIST, fontWeight: 600, textDecoration: 'none' }}>
                  Apply →
                </a>
              ) : (
                <div style={{ flex: 1, textAlign: 'center', background: `${PRI}14`, border: `1px solid ${PRI}33`, color: PRI, borderRadius: 2, padding: '10px 4px', fontSize: 12, fontFamily: GEIST }}>Apply →</div>
              )}
              <button onClick={() => setOpen(o => !o)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'transparent', border: `1px solid ${BDR2}`, color: TXT2, borderRadius: 2, padding: '10px 4px', fontSize: 12, fontFamily: GEIST, cursor: 'pointer' }}>
                Details
                <span className="material-symbols-outlined" style={{ fontSize: 14, transform: open ? 'rotate(180deg)' : 'none' }}>expand_more</span>
              </button>
            </div>
          </div>
        )}
      </div>
      <div style={{ height: 20 }} />

      {/* Expanded criteria */}
      {open && (
        <div style={{ borderTop: `1px solid ${BDR2}`, background: SURF, padding: '16px 24px' }}>
          {nearMiss && grant.missingCriteria?.length > 0 && (
            <div style={{ marginBottom: 16, padding: '12px 14px', background: `${PRI}08`, border: `1px solid ${PRI}28`, borderRadius: 3 }}>
              <div style={{ color: PRI, fontSize: 11, fontFamily: GEIST, fontWeight: 600, marginBottom: 10 }}>How to Qualify</div>
              {grant.missingCriteria.map((mc, j) => (
                <div key={j} style={{ marginBottom: j < grant.missingCriteria.length - 1 ? 12 : 0 }}>
                  <div style={{ color: TXT, fontSize: 13, fontWeight: 600, marginBottom: 3 }}>⚠ {mc.label}</div>
                  <div style={{ color: TXT2, fontSize: 12, lineHeight: 1.6 }}>{mc.description}</div>
                  <div style={{ color: PRI, fontSize: 12, marginTop: 3 }}>→ {mc.howToClose}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: grant.keyDataPoints.length > 0 && grant.matchedCriteria.length > 0 ? '1fr 1fr' : '1fr', gap: 20 }}>
            {grant.matchedCriteria.length > 0 && (
              <div>
                <div style={{ color: TXT3, fontSize: 11, fontFamily: GEIST, marginBottom: 10 }}>Eligibility Criteria</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {grant.matchedCriteria.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '7px 10px', borderRadius: 4, background: c.met ? 'rgba(78,222,163,0.06)' : 'rgba(255,180,171,0.06)', border: `1px solid ${c.met ? 'rgba(78,222,163,0.2)' : 'rgba(255,180,171,0.2)'}` }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: c.met ? GRN : RED, marginTop: 1, flexShrink: 0 }}>{c.met ? 'check_circle' : 'cancel'}</span>
                      <div>
                        <div style={{ color: c.met ? TXT : TXT2, fontSize: 12, lineHeight: 1.4 }}>{c.label}</div>
                        {c.countyValue !== 'true' && c.countyValue !== 'false' && (
                          <div style={{ color: TXT3, fontSize: 10, fontFamily: GEIST, marginTop: 2 }}>County: {c.countyValue}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {grant.keyDataPoints.length > 0 && (
              <div>
                <div style={{ color: TXT3, fontSize: 10, fontFamily: GEIST, letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase' }}>Key Data Points</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 6 }}>
                  {grant.keyDataPoints.map((dp, i) => (
                    <div key={i} style={{ background: CARD, border: `1px solid ${BDR2}`, borderRadius: 4, padding: '10px 12px' }}>
                      <div style={{ color: TXT3, fontSize: 8, fontFamily: GEIST, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>{dp.label}</div>
                      <div style={{ color: PRI_TXT, fontFamily: GEIST, fontSize: 15, fontWeight: 700 }}>{dp.value}</div>
                      {dp.context && <div style={{ color: TXT2, fontSize: 10, marginTop: 3, lineHeight: 1.4 }}>{dp.context}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

// ── Health row ────────────────────────────────────────────────────────────────
function HealthRow({ label, value, national }: { label: string; value: number; national?: number }) {
  const high = national ? value > national * 1.1 : false
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${BDR}` }}>
      <span style={{ color: TXT2, fontSize: 12, fontFamily: SANS, flex: 1 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {national && <span style={{ color: TXT3, fontSize: 10, fontFamily: GEIST, minWidth: 36, textAlign: 'right' }}>{fmtPct(national)}</span>}
        <div style={{ width: 52, height: 3, background: SURF, borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, value)}%`, background: high ? RED : GRN, borderRadius: 99 }} />
        </div>
        <span style={{ fontFamily: GEIST, fontSize: 12, fontWeight: 700, color: high ? RED : TXT, minWidth: 42, textAlign: 'right' }}>{fmtPct(value)}</span>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CountyPage() {
  const params  = useParams()
  const router  = useRouter()
  const fips    = params.fips as string

  const { isMobile, isTablet } = useBreakpoint()

  const [profile,       setProfile]       = useState<CountyProfile | null>(null)
  const [grants,        setGrants]        = useState<GrantsAPIResponse | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [grantsLoading, setGrantsLoading] = useState(true)
  const [error,         setError]         = useState<string | null>(null)
  const [activeTab,     setActiveTab]     = useState<TabMode>('grants')
  const [sortMode,      setSortMode]      = useState<SortMode>('match')
  const [onlyUrgent,    setOnlyUrgent]    = useState(false)
  const [showBrief,     setShowBrief]     = useState(false)
  const [navSection,    setNavSection]    = useState<NavSection>('intelligence')
  const [isDark,        setIsDark]        = useState(true)
  const [showSettings,  setShowSettings]  = useState(false)
  const [sidebarOpen,   setSidebarOpen]   = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('grantiq-theme')
    if (saved === 'light') setIsDark(false)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    localStorage.setItem('grantiq-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setShowSettings(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    if (!fips) return
    setLoading(true); setGrantsLoading(true); setProfile(null); setGrants(null); setError(null)
    fetch(`/api/county/${fips}`)
      .then(r => r.json())
      .then(d => { if (!d.success) { setError(d.error); return }; setProfile(d.profile); setLoading(false) })
      .catch(() => { setError('Failed to load county data'); setLoading(false) })
    fetch(`/api/grants?fips=${fips}`)
      .then(r => r.json())
      .then(d => { setGrants(d); setGrantsLoading(false) })
      .catch(() => setGrantsLoading(false))
  }, [fips])

  const filteredGrants = useMemo(() => {
    if (!grants?.matches) return []
    let g = [...grants.matches]
    if (onlyUrgent) g = g.filter(x => x.daysUntilClose != null && x.daysUntilClose <= 30)
    switch (sortMode) {
      case 'match':    g.sort((a, b) => b.matchScore - a.matchScore); break
      case 'deadline': g.sort((a, b) => (a.daysUntilClose ?? 9999) - (b.daysUntilClose ?? 9999)); break
      case 'award':    g.sort((a, b) => (b.awardCeiling ?? 0) - (a.awardCeiling ?? 0)); break
    }
    return g
  }, [grants, sortMode, onlyUrgent])

  const urgentCount = useMemo(
    () => grants?.matches?.filter(g => g.daysUntilClose != null && g.daysUntilClose <= 30).length ?? 0,
    [grants],
  )

  if (loading) return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 8, background: 'rgba(250,204,21,0.1)', border: '1px solid rgba(250,204,21,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: PRI }}>
                <path d="M12 2L4 6v6c0 5.25 3.4 10.15 8 11.35C16.6 22.15 20 17.25 20 12V6l-8-4z" fill="currentColor" fillOpacity="0.85"/>
              </svg>
        </div>
        <div style={{ color: TXT2, fontFamily: GEIST, fontSize: 13, marginBottom: 6 }}>Loading county data</div>
        <div style={{ color: TXT3, fontSize: 11, fontFamily: MONO }}>CDC · SVI · HRSA · MUA · FQHC</div>
      </div>
    </div>
  )

  if (error || !profile) return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: RED, fontFamily: GEIST, fontSize: 13, marginBottom: 14 }}>{error || 'County not found'}</div>
        <button onClick={() => router.push('/')} style={{ color: PRI, background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.3)', borderRadius: 4, padding: '8px 16px', cursor: 'pointer', fontFamily: GEIST, fontSize: 11, letterSpacing: '0.08em' }}>
          ← Return to Map
        </button>
      </div>
    </div>
  )

  const p  = profile
  const tf = grants?.totalUnclaimed ?? 0
  const mc = grants?.matches?.length ?? 0
  const nm = grants?.nearMisses?.length ?? 0

  const TABS: { key: TabMode; label: string; count?: number }[] = [
    { key: 'grants', label: 'Matched Grants', count: mc },
    { key: 'near',   label: 'Near Misses',    count: nm },
    { key: 'health', label: 'Health Profile' },
  ]

  return (
    <div style={{ flex: 1, minHeight: 0, background: BG, display: 'flex', overflow: 'hidden', fontFamily: SANS, color: TXT, position: 'relative' }}>

      {/* Mobile sidebar backdrop */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9 }} />
      )}

      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
      <aside style={{ width: 256, flexShrink: 0, background: 'var(--s-sidebar)', borderRight: `1px solid ${BDR2}`, display: 'flex', flexDirection: 'column', zIndex: 10, position: isMobile ? 'fixed' : 'relative', top: 0, left: 0, bottom: 0, transform: isMobile ? (sidebarOpen ? 'translateX(0)' : 'translateX(-100%)') : 'none', transition: 'transform 0.25s ease' }}>

        {/* County identity */}
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${BDR2}` }}>
          <div style={{ fontFamily: GEIST, fontSize: 9, color: TXT3, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>Viewing</div>

          <div style={{ fontFamily: GEIST, fontSize: 26, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.02em', color: PRI_TXT, marginBottom: 10 }}>
            {p.countyName}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: TXT2, background: CARDHI, border: `1px solid ${BDR2}`, borderRadius: '2px 0 0 2px', padding: '3px 8px' }}>Mississippi</span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: TXT3, background: CARD, border: `1px solid ${BDR2}`, borderLeft: 'none', borderRadius: '0 2px 2px 0', padding: '3px 8px' }}>{p.fips}</span>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ padding: '12px 8px', borderBottom: `1px solid ${BDR2}` }}>
          <NavLink icon="dashboard" label="Homepage" onClick={() => router.push('/')} />
          <NavLink icon="analytics" label="Grant Intelligence" active={navSection === 'intelligence'} onClick={() => setNavSection('intelligence')} />
          <NavLink icon="map" label="Geographic Analysis" active={navSection === 'geographic'} onClick={() => setNavSection('geographic')} />
          <NavLink icon="bar_chart" label="Data Analysis" active={navSection === 'analysis'} onClick={() => setNavSection('analysis')} />
        </nav>

        {/* Metrics */}
        <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
          <div style={{ paddingLeft: 6, borderLeft: `2px solid ${PRI}` }}>
            <div style={{ fontFamily: GEIST, fontSize: 10, color: TXT3, letterSpacing: '0.02em' }}>Key Metrics</div>
            <div style={{ fontFamily: GEIST, fontSize: 12, fontWeight: 500, color: TXT2, marginTop: 2 }}>{p.countyName} County</div>
          </div>

          {/* Estimated funding */}
          <div style={{ ...glassCard, padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontFamily: GEIST, fontSize: 12, fontWeight: 600, color: TXT2 }}>Est. Funding</span>
              <span style={{ fontFamily: GEIST, fontSize: 11, fontWeight: 600, color: GRN }}>Probable</span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: PRI_TXT, lineHeight: 1, marginBottom: 8 }}>{fmtM(tf)}</div>
            <ProgressBar value={Math.min(100, (tf / 10_000_000) * 100)} color={PRI} />
          </div>

          {/* Metric grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { label: 'HPSA Score', value: p.primaryCareScore ? String(p.primaryCareScore) : 'N/A', color: (p.primaryCareScore ?? 0) >= 17 ? RED : PRI_TXT },
              { label: 'SVI Score',  value: fmtD(p.sviScore),                                        color: p.sviScore > 0.75 ? RED : PRI_TXT },
            ].map(m => (
              <div key={m.label} style={{ ...glassCard, padding: '10px 12px' }}>
                <div style={{ fontFamily: GEIST, fontSize: 12, fontWeight: 600, color: TXT2, marginBottom: 6 }}>{m.label}</div>
                <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Poverty & Uninsured bars */}
          {[
            { label: 'Poverty Rate',   value: p.povertyRate,   alert: p.povertyRate > 25,   barVal: Math.min(100, p.povertyRate),       barColor: p.povertyRate > 25 ? RED : PRI },
            { label: 'Uninsured Rate', value: p.uninsuredRate, alert: p.uninsuredRate > 15, barVal: Math.min(100, p.uninsuredRate * 3), barColor: p.uninsuredRate > 15 ? RED : GRN },
          ].map(r => (
            <div key={r.label} style={{ ...glassCard, padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: GEIST, fontSize: 12, marginBottom: 8 }}>
                <span style={{ color: TXT2, fontWeight: 600 }}>{r.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, color: r.alert ? RED : PRI_TXT, fontWeight: 700 }}>{fmtPct(r.value)}</span>
              </div>
              <ProgressBar value={r.barVal} color={r.barColor} />
            </div>
          ))}

        </div>

        {/* AI Brief button */}
        {grants && mc > 0 && (
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${BDR2}` }}>
            <button onClick={() => setShowBrief(b => !b)}
              style={{ width: '100%', padding: '10px', background: showBrief ? PRI : 'transparent', border: `1px solid ${showBrief ? PRI : BDR2}`, borderRadius: 3, color: showBrief ? '#1a1200' : PRI_TXT, fontFamily: GEIST, fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'all 0.2s' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>bolt</span>
              {showBrief ? 'Close Analysis' : 'AI Analysis'}
            </button>
          </div>
        )}

      </aside>

      {/* ── MAIN ─────────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', zIndex: 1 }}>

        {/* Top header */}
        <header style={{ height: 64, flexShrink: 0, background: SURF, borderBottom: `1px solid ${BDR2}`, display: 'flex', alignItems: 'center', padding: isMobile ? '0 16px' : '0 28px', gap: isMobile ? 12 : 20, position: 'sticky', top: 0, zIndex: 40 }}>
          {/* Hamburger on mobile */}
          {isMobile && (
            <button onClick={() => setSidebarOpen(o => !o)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: TXT2, display: 'flex', alignItems: 'center', padding: 4, flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>menu</span>
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 26, height: 26, background: PRI, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: '#1a1200' }}>GQ</span>
            </div>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: TXT, letterSpacing: '-0.01em', lineHeight: 1.1 }}>GrantIQ</div>
              <div style={{ fontFamily: GEIST, fontSize: 10, color: TXT3, lineHeight: 1 }}>Federal Intelligence</div>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {!isMobile && <CountyPill name={p.countyName} onSelect={f => router.push(`/county/${f}`)} />}

          {/* Urgency stat */}
          {urgentCount > 0 && !isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,180,171,0.08)', border: `1px solid rgba(255,180,171,0.25)`, borderRadius: 4, padding: '5px 12px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: RED }}>local_fire_department</span>
              <span style={{ fontFamily: GEIST, fontSize: 11, color: RED, fontWeight: 700 }}>{urgentCount} Urgent</span>
            </div>
          )}

          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: TXT3, display: 'flex', alignItems: 'center', padding: 4, transition: 'color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = PRI_TXT }}
            onMouseLeave={e => { e.currentTarget.style.color = TXT3 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>notifications</span>
          </button>
          <div ref={settingsRef} style={{ position: 'relative' }}>
            <button onClick={() => setShowSettings(s => !s)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: showSettings ? PRI : TXT3, display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4, transition: 'color 0.15s' }}
              onMouseEnter={e => { if (!showSettings) e.currentTarget.style.color = PRI_TXT }}
              onMouseLeave={e => { if (!showSettings) e.currentTarget.style.color = TXT3 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>settings</span>
            </button>
            {showSettings && (
              <div style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, background: CARD, border: `1px solid ${BDR2}`, borderRadius: 6, padding: 8, zIndex: 200, minWidth: 196, boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
                <div style={{ fontFamily: GEIST, fontSize: 9, color: TXT3, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '4px 8px 8px', borderBottom: `1px solid ${BDR2}`, marginBottom: 6 }}>Appearance</div>
                {([
                  { label: 'Dark Mode',  icon: 'dark_mode',  val: true  },
                  { label: 'Light Mode', icon: 'light_mode', val: false },
                ] as { label: string; icon: string; val: boolean }[]).map(opt => (
                  <button key={opt.label}
                    onClick={() => { setIsDark(opt.val); setShowSettings(false) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', background: isDark === opt.val ? CARDHI : 'transparent', border: 'none', borderRadius: 4, color: isDark === opt.val ? TXT : TXT2, cursor: 'pointer', fontFamily: GEIST, fontSize: 12, fontWeight: isDark === opt.val ? 700 : 400, textAlign: 'left', transition: 'background 0.15s' }}
                    onMouseEnter={e => { if (isDark !== opt.val) e.currentTarget.style.background = CARDHI }}
                    onMouseLeave={e => { if (isDark !== opt.val) e.currentTarget.style.background = 'transparent' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 17, color: isDark === opt.val ? PRI : TXT3 }}>{opt.icon}</span>
                    {opt.label}
                    {isDark === opt.val && <span className="material-symbols-outlined" style={{ fontSize: 14, color: GRN, marginLeft: 'auto' }}>check</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(250,204,21,0.15)', border: `1px solid rgba(250,204,21,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: PRI, fontVariationSettings: "'FILL' 1" }}>account_circle</span>
          </div>
        </header>

        {/* AI Analysis Suite —> full page, same pattern as Data Analysis */}
        {navSection === 'intelligence' && showBrief && grants && (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <div style={{ padding: isMobile ? '20px 16px 64px' : '28px 28px 64px' }}>
              <BriefGenerator fips={p.fips} countyName={p.countyName} grants={grants.matches} nearMisses={grants.nearMisses} profile={p} />
            </div>
          </div>
        )}

        {/* ── Geographic Analysis ── */}
        {navSection === 'geographic' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 28px', borderBottom: `1px solid ${BDR2}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: PRI }}>map</span>
              <span style={{ fontFamily: GEIST, fontSize: 13, fontWeight: 700, color: PRI_TXT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Equity Map</span>
              <span style={{ fontFamily: GEIST, fontSize: 10, color: TXT3, letterSpacing: '0.08em' }}>— SVI, HPSA & health equity across all 82 Mississippi counties</span>
              <span style={{ marginLeft: 'auto', background: 'rgba(78,222,163,0.1)', border: '1px solid rgba(78,222,163,0.3)', color: GRN, borderRadius: 2, padding: '2px 8px', fontSize: 9, fontFamily: GEIST, letterSpacing: '0.1em', fontWeight: 700 }}>LIVE</span>
            </div>
            <EquityMap />
          </div>
        )}

        {/* ── Data Analysis ── */}
        {navSection === 'analysis' && (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <DataAnalysis profile={p} grants={grants} />
          </div>
        )}

        {/* Scrollable content */}
        {navSection === 'intelligence' && !showBrief && <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ padding: isMobile ? '20px 16px 64px' : '28px 28px 64px' }}>

            {/* Section heading */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: PRI }}>analytics</span>
                <span style={{ fontFamily: GEIST, fontSize: 14, fontWeight: 600, color: TXT }}>Grant Matches</span>
                <span style={{ fontFamily: GEIST, fontSize: 12, color: TXT3 }}>{p.countyName} County · {mc} matched</span>
              </div>

              {/* Tabs + controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 2, background: CARD, border: `1px solid ${BDR2}`, borderRadius: 4, padding: 3 }}>
                  {TABS.map(t => (
                    <button key={t.key} onClick={() => setActiveTab(t.key)}
                      style={{ fontFamily: GEIST, fontSize: isMobile ? 11 : 13, padding: isMobile ? '6px 10px' : '6px 14px', background: activeTab === t.key ? CARDHI : 'transparent', border: `1px solid ${activeTab === t.key ? BDR2 : 'transparent'}`, borderRadius: 2, color: activeTab === t.key ? TXT : TXT2, cursor: 'pointer', fontWeight: activeTab === t.key ? 600 : 400, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 7 }}>
                      {isMobile ? (t.key === 'grants' ? 'Grants' : t.key === 'near' ? 'Near Miss' : 'Health') : t.label}
                      {t.count != null && t.count > 0 && (
                        <span style={{ background: activeTab === t.key ? 'rgba(250,204,21,0.15)' : 'rgba(255,255,255,0.07)', color: activeTab === t.key ? PRI : TXT3, borderRadius: 2, padding: '0 6px', fontSize: 10, lineHeight: '18px' }}>{t.count}</span>
                      )}
                    </button>
                  ))}
                </div>
                <div style={{ flex: 1 }} />
                {(activeTab === 'grants' || activeTab === 'near') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <select value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)}
                      style={{ fontFamily: GEIST, fontSize: 12, padding: '7px 12px', background: CARD, border: `1px solid ${BDR2}`, borderRadius: 2, color: TXT2, cursor: 'pointer', outline: 'none' }}>
                      <option value="match">Sort: Score</option>
                      <option value="deadline">Sort: Deadline</option>
                      <option value="award">Sort: Award</option>
                    </select>
                    {urgentCount > 0 && (
                      <button onClick={() => setOnlyUrgent(o => !o)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: GEIST, fontSize: 12, padding: '7px 12px', background: onlyUrgent ? `${RED}18` : 'transparent', border: `1px solid ${onlyUrgent ? RED : `${RED}50`}`, borderRadius: 2, color: RED, cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>local_fire_department</span>
                        Urgent ({urgentCount})
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* MATCHED GRANTS */}
            {activeTab === 'grants' && (
              grantsLoading ? (
                <div style={{ padding: '60px 0', textAlign: 'center' }}>
                  <div style={{ color: TXT2, fontFamily: GEIST, fontSize: 13, marginBottom: 8 }}>Scanning federal programs...</div>
                  <div style={{ color: TXT3, fontSize: 11, fontFamily: GEIST }}>Analyzing eligibility across federal databases</div>
                </div>
              ) : filteredGrants.length > 0 ? (
                <>
                  {filteredGrants.map((g, i) => <GrantCard key={`${g.opportunityId}-${i}`} grant={g} />)}
                  <div style={{ textAlign: 'center', padding: '24px 0 10px' }}>
                    <button style={{ display: 'flex', alignItems: 'center', gap: 6, color: TXT3, fontFamily: GEIST, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'none', border: `1px solid rgba(154,144,120,0.25)`, borderRadius: 2, padding: '8px 20px', cursor: 'pointer', transition: 'color 0.15s', margin: '0 auto' }}
                      onMouseEnter={e => { e.currentTarget.style.color = PRI_TXT }}
                      onMouseLeave={e => { e.currentTarget.style.color = TXT3 }}>
                      Load More Intelligence Records
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>keyboard_double_arrow_down</span>
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ padding: '60px 0', textAlign: 'center' }}>
                  <div style={{ color: TXT3, fontFamily: GEIST, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>No matches for current filters</div>
                  {onlyUrgent && <button onClick={() => setOnlyUrgent(false)} style={{ color: PRI, background: 'none', border: 'none', cursor: 'pointer', fontFamily: GEIST, fontSize: 11 }}>Clear urgent filter</button>}
                </div>
              )
            )}

            {/* NEAR MISSES */}
            {activeTab === 'near' && (
              <>
                <div style={{ padding: '14px 18px', background: 'rgba(250,204,21,0.05)', border: `1px solid rgba(250,204,21,0.2)`, borderRadius: 4, marginBottom: 18 }}>
                  <p style={{ color: TXT2, fontSize: 13, lineHeight: 1.7, margin: 0, fontFamily: SANS }}>
                    These grants have a <strong style={{ color: PRI_TXT }}>single unmet criterion</strong>. Addressing that gap could unlock additional federal funding for {p.countyName} County.
                  </p>
                </div>
                {grants?.nearMisses?.length
                  ? grants.nearMisses.map((g, i) => <GrantCard key={`nm-${g.opportunityId}-${i}`} grant={g} nearMiss />)
                  : <div style={{ padding: '60px 0', textAlign: 'center', color: TXT3, fontFamily: GEIST, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>No near-miss records found</div>}
              </>
            )}

            {/* HEALTH PROFILE */}
            {activeTab === 'health' && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 14 }}>

                {/* Card 1 — Chronic Disease */}
                <div style={{ ...glassCard, padding: '18px 20px' }}>
                  <div style={{ fontFamily: GEIST, fontSize: 10, color: TXT3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${BDR2}`, borderLeft: `2px solid ${PRI}`, paddingLeft: 8 }}>Chronic Disease</div>
                  {([
                    { label: 'Diabetes',            value: p.diabetesRate,       national: 11.6 },
                    { label: 'Hypertension',        value: p.hypertensionRate,   national: 32.5 },
                    { label: 'Obesity',             value: p.obesityRate,        national: 31.9 },
                    { label: 'Heart Disease',       value: p.heartDiseaseRate,   national: 6.0 },
                    { label: 'COPD',                value: p.copdRate,           national: 6.2 },
                    { label: 'Stroke',              value: p.strokeRate,         national: 3.3 },
                    { label: 'Physical Inactivity', value: p.physicalInactivity, national: 25.3 },
                    { label: 'Smoking',             value: p.smokingRate,        national: 14.0 },
                  ]).map(r => <HealthRow key={r.label} label={r.label} value={r.value} national={r.national} />)}
                  <div style={{ marginTop: 8, fontFamily: GEIST, fontSize: 9, color: TXT3 }}>← county · national avg</div>
                </div>

                {/* Card 2 — Behavioral & Social */}
                <div style={{ ...glassCard, padding: '18px 20px' }}>
                  <div style={{ fontFamily: GEIST, fontSize: 10, color: TXT3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${BDR2}`, borderLeft: `2px solid ${PRI}`, paddingLeft: 8 }}>Behavioral & Social</div>
                  {([
                    { label: 'Mental Distress',    value: p.mentalHealthRate,  national: 14.4 },
                    { label: 'Depression',         value: p.depressionRate,    national: 18.4 },
                    { label: 'Disability',         value: p.disabilityRate,    national: 26.0 },
                    { label: 'Food Insecurity',    value: p.foodInsecurity,    national: 10.5 },
                    { label: 'Housing Insecurity', value: p.housingInsecurity },
                    { label: 'Lack Transport',     value: p.lackTransport,     national: 6.0 },
                    { label: 'No Internet',        value: p.noInternet,        national: 18.0 },
                    { label: 'SNAP Recipients',    value: p.foodStampRate,     national: 12.0 },
                  ]).map(r => <HealthRow key={r.label} label={r.label} value={r.value} national={r.national} />)}
                  <div style={{ marginTop: 8, fontFamily: GEIST, fontSize: 9, color: TXT3 }}>← county · national avg</div>
                </div>

                {/* Card 3 — HRSA Designations + FQHC */}
                <div style={{ ...glassCard, padding: '18px 20px' }}>
                  <div style={{ fontFamily: GEIST, fontSize: 10, color: TXT3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${BDR2}`, borderLeft: `2px solid ${PRI}`, paddingLeft: 8 }}>HRSA Designations</div>
                  {([
                    { label: 'Primary Care HPSA',    on: p.primaryCareHPSA,  detail: p.primaryCareHPSA  ? `Score ${p.primaryCareScore}` : 'Not designated' },
                    { label: 'Dental HPSA',          on: p.dentalHPSA,       detail: p.dentalHPSA       ? `Score ${p.dentalScore}` : 'Not designated' },
                    { label: 'Mental Health HPSA',   on: p.mentalHealthHPSA, detail: p.mentalHealthHPSA ? `Score ${p.mentalHealthScore}` : 'Not designated' },
                    { label: 'Medically Underserved', on: p.isMUA,           detail: p.isMUA            ? `MUA Score ${p.muaScore ?? 'N/A'}` : 'Not designated' },
                  ]).map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${BDR}` }}>
                      <div>
                        <div style={{ color: TXT, fontSize: 13, marginBottom: 3, fontWeight: 500, fontFamily: SANS }}>{row.label}</div>
                        <div style={{ color: TXT2, fontSize: 11, fontFamily: GEIST }}>{row.detail}</div>
                      </div>
                      <span style={{ background: row.on ? 'rgba(78,222,163,0.1)' : 'rgba(154,144,120,0.1)', color: row.on ? GRN : TXT3, border: `1px solid ${row.on ? 'rgba(78,222,163,0.3)' : BDR2}`, borderRadius: 99, padding: '3px 12px', fontSize: 11, fontFamily: GEIST, fontWeight: 700, letterSpacing: '0.06em' }}>
                        {row.on ? 'YES' : 'NO'}
                      </span>
                    </div>
                  ))}
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${BDR}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ color: TXT, fontSize: 13, fontWeight: 500, fontFamily: SANS }}>FQHC Sites</span>
                      <span style={{ background: p.hasFQHC ? 'rgba(190,198,224,0.1)' : 'rgba(154,144,120,0.1)', color: p.hasFQHC ? BLU : TXT3, border: `1px solid ${p.hasFQHC ? 'rgba(190,198,224,0.3)' : BDR2}`, borderRadius: 99, padding: '3px 12px', fontSize: 11, fontFamily: GEIST }}>
                        {p.hasFQHC ? `${p.fqhcCount} sites` : 'None'}
                      </span>
                    </div>
                    {p.fqhcSiteNames.slice(0, 3).map((n, i) => (
                      <div key={i} style={{ color: TXT2, fontSize: 11, fontFamily: GEIST, padding: '3px 0', lineHeight: 1.5 }}>· {n.length > 42 ? n.slice(0, 42) + '…' : n}</div>
                    ))}
                    {p.fqhcCount > 3 && <div style={{ color: TXT3, fontSize: 10, fontFamily: GEIST, marginTop: 4 }}>+{p.fqhcCount - 3} more sites</div>}
                  </div>
                </div>

              </div>
            )}

          </div>
        </div>}
      </main>
    </div>
  )
}
