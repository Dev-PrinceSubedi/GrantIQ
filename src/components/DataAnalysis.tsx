'use client'
import { CountyProfile, GrantsAPIResponse } from '@/types'
import { useBreakpoint } from '@/lib/useBreakpoint'

const SURF    = 'var(--s-surf)'
const BDR     = 'var(--s-bdr)'
const BDR2    = 'var(--s-bdr2)'
const PRI     = 'var(--s-pri)'
const PRI_TXT = 'var(--s-pri-txt)'
const GRN     = 'var(--s-grn)'
const RED     = 'var(--s-red)'
const BLU     = 'var(--s-blu)'
const TXT     = 'var(--s-txt)'
const TXT2    = 'var(--s-txt2)'
const TXT3    = 'var(--s-txt3)'
const GEIST   = "'IBM Plex Sans', Inter, sans-serif"
const MONO    = "'IBM Plex Mono', monospace"

function fmtM(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

// Horizontal bar: county value vs national avg marker
function MetricBar({ label, county, national, unit = '%', good = 'low' }: {
  label: string; county: number; national?: number; unit?: string; good?: 'low' | 'high'
}) {
  const diff    = national != null ? county - national : null
  const isHigh  = diff != null && diff > 0
  const bad     = good === 'low' ? isHigh : !isHigh
  const barColor = diff == null ? BLU : bad ? RED : GRN
  const max     = Math.max(county, national ?? 0) * 1.25 || 100
  const countyW = Math.min(100, (county / max) * 100)
  const natW    = national != null ? Math.min(100, (national / max) * 100) : null

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
        <span style={{ fontFamily: GEIST, fontSize: 11, color: TXT2 }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: barColor, lineHeight: 1 }}>{county.toFixed(1)}{unit}</span>
          {national != null && (
            <span style={{ fontFamily: MONO, fontSize: 10, color: TXT3 }}>nat. {national}{unit}</span>
          )}
        </div>
      </div>
      <div style={{ position: 'relative', height: 6, background: SURF, borderRadius: 99 }}>
        <div style={{ height: '100%', width: `${countyW}%`, background: barColor, borderRadius: 99, opacity: 0.9 }} />
        {natW != null && (
          <div style={{ position: 'absolute', top: -3, left: `${natW}%`, width: 2, height: 12, background: TXT3, borderRadius: 99 }} />
        )}
      </div>
      {diff != null && (
        <div style={{ fontFamily: GEIST, fontSize: 10, color: bad ? RED : GRN, marginTop: 4 }}>
          {isHigh ? '▲' : '▼'} {Math.abs(diff).toFixed(1)}% vs national avg
        </div>
      )}
    </div>
  )
}

function Section({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ width: 2, height: 14, background: PRI, borderRadius: 99, flexShrink: 0 }} />
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: PRI }}>{icon}</span>
        <span style={{ fontFamily: GEIST, fontSize: 11, fontWeight: 600, color: TXT2 }}>{label}</span>
        <div style={{ flex: 1, height: 1, background: BDR2, marginLeft: 4 }} />
      </div>
      {children}
    </div>
  )
}

function HPSABlock({ label, active, score, shortage, underserved }: {
  label: string; active: boolean; score: number; shortage: number; underserved: number
}) {
  const scoreColor = score >= 20 ? RED : score >= 17 ? PRI : score >= 14 ? PRI_TXT : TXT3
  const pct = Math.min(100, (score / 25) * 100)
  return (
    <div style={{ background: 'var(--s-card)', borderRadius: 4, padding: '18px 20px', borderLeft: `3px solid ${active ? (score >= 17 ? RED : PRI) : BDR2}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: GEIST, fontSize: 13, fontWeight: 600, color: TXT, marginBottom: 3 }}>{label}</div>
          <div style={{ fontFamily: GEIST, fontSize: 10, color: active ? GRN : TXT3 }}>
            {active ? 'Designated' : 'Not designated'}
          </div>
        </div>
        {active && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 600, color: scoreColor, lineHeight: 1 }}>{score}</div>
            <div style={{ fontFamily: GEIST, fontSize: 10, color: TXT3 }}>/ 25</div>
          </div>
        )}
      </div>
      {active ? (
        <>
          <div style={{ height: 4, background: SURF, borderRadius: 99, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: scoreColor, borderRadius: 99 }} />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { label: 'FTE Shortage', value: shortage.toFixed(1) },
              { label: 'Underserved',  value: underserved.toLocaleString() },
            ].map(r => (
              <div key={r.label}>
                <div style={{ fontFamily: GEIST, fontSize: 10, color: TXT3, marginBottom: 3 }}>{r.label}</div>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 600, color: TXT2 }}>{r.value}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ fontFamily: GEIST, fontSize: 11, color: TXT3 }}>No shortage designation on record.</div>
      )}
    </div>
  )
}

interface Props { profile: CountyProfile; grants: GrantsAPIResponse | null }

export default function DataAnalysis({ profile: p, grants }: Props) {
  const { isMobile, isTablet } = useBreakpoint()
  const mc   = grants?.matches?.length ?? 0
  const tf   = grants?.totalUnclaimed ?? 0
  const risk = p.sviScore >= 0.9 ? { label: 'Critical', color: RED }
             : p.sviScore >= 0.75 ? { label: 'High',     color: PRI }
             : p.sviScore >= 0.5  ? { label: 'Moderate', color: PRI_TXT }
             :                      { label: 'Low',       color: GRN }

  const px = isMobile ? '16px' : '36px'

  return (
    <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, background: 'var(--s-bg)' }}>
      <div style={{ maxWidth: 1080, padding: `0 ${px} 64px` }}>

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <div style={{ padding: '28px 0 24px', borderBottom: `1px solid ${BDR2}`, marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: GEIST, fontSize: isMobile ? 22 : 30, fontWeight: 900, color: PRI_TXT, letterSpacing: '-0.03em', margin: 0, lineHeight: 1 }}>
              {p.countyName} County
            </h1>
            <span style={{ background: `${risk.color}18`, border: `1px solid ${risk.color}55`, color: risk.color, borderRadius: 2, padding: '3px 10px', fontSize: 10, fontFamily: GEIST, fontWeight: 700, letterSpacing: '0.1em' }}>
              {risk.label.toUpperCase()} RISK
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
            <span style={{ fontFamily: GEIST, fontSize: 11, color: TXT3 }}>Mississippi · FIPS {p.fips} · Pop. {p.population.toLocaleString()}</span>
            {p.isMUA            && <span style={{ color: PRI, fontSize: 10, fontFamily: GEIST, fontWeight: 700, borderLeft: `1px solid ${BDR2}`, paddingLeft: 8 }}>MUA</span>}
            {p.primaryCareHPSA  && <span style={{ color: GRN, fontSize: 10, fontFamily: GEIST, fontWeight: 700, borderLeft: `1px solid ${BDR2}`, paddingLeft: 8 }}>Primary HPSA</span>}
            {p.dentalHPSA       && <span style={{ color: GRN, fontSize: 10, fontFamily: GEIST, fontWeight: 700, borderLeft: `1px solid ${BDR2}`, paddingLeft: 8 }}>Dental HPSA</span>}
            {p.mentalHealthHPSA && <span style={{ color: GRN, fontSize: 10, fontFamily: GEIST, fontWeight: 700, borderLeft: `1px solid ${BDR2}`, paddingLeft: 8 }}>Mental HPSA</span>}
            <span style={{ color: TXT3, fontSize: 10, fontFamily: GEIST, borderLeft: `1px solid ${BDR2}`, paddingLeft: 8 }}>{p.ruralStatus}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: isMobile ? '1px' : 0, background: isMobile ? BDR2 : 'transparent' }}>
            {[
              { label: 'Grant Funding', value: fmtM(tf),                                  sub: `${mc} programs`,              color: PRI_TXT },
              { label: 'SVI Score',     value: p.sviScore.toFixed(3),                     sub: risk.label + ' vulnerability', color: risk.color },
              { label: 'Poverty Rate',  value: p.povertyRate.toFixed(1) + '%',            sub: 'Nat. avg 12.5%',              color: p.povertyRate > 20 ? RED : TXT },
              { label: 'Uninsured',     value: p.uninsuredRate.toFixed(1) + '%',          sub: 'Nat. avg 9.2%',               color: p.uninsuredRate > 15 ? RED : TXT },
              { label: 'FQHC Sites',   value: p.hasFQHC ? String(p.fqhcCount) : 'None', sub: p.hasFQHC ? 'Federally qualified' : 'No coverage', color: p.hasFQHC ? BLU : RED },
            ].map((s, i) => (
              <div key={s.label} style={{ padding: '14px 18px', borderLeft: !isMobile && i > 0 ? `1px solid ${BDR2}` : 'none', background: isMobile ? 'var(--s-card)' : 'transparent' }}>
                <div style={{ fontFamily: GEIST, fontSize: 9, color: TXT3, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontFamily: MONO, fontSize: isMobile ? 18 : 22, fontWeight: 600, color: s.color, lineHeight: 1, marginBottom: 4 }}>{s.value}</div>
                <div style={{ fontFamily: GEIST, fontSize: 10, color: TXT3 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 1: Health Burden ───────────────────────────────────── */}
        <Section label="Health Burden" icon="cardiology">
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 0 : '0 48px' }}>
            <div style={{ marginBottom: isMobile ? 28 : 0 }}>
              <div style={{ fontFamily: GEIST, fontSize: 9, color: TXT3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid ${BDR}` }}>Chronic Disease</div>
              <MetricBar label="Diabetes"            county={p.diabetesRate}     national={11.6} />
              <MetricBar label="Hypertension"        county={p.hypertensionRate} national={32.5} />
              <MetricBar label="Obesity"             county={p.obesityRate}      national={31.9} />
              <MetricBar label="Heart Disease"       county={p.heartDiseaseRate} national={6.0}  />
              <MetricBar label="COPD"                county={p.copdRate}         national={6.2}  />
              <MetricBar label="Smoking"             county={p.smokingRate}      national={14.0} />
            </div>
            <div>
              <div style={{ fontFamily: GEIST, fontSize: 9, color: TXT3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid ${BDR}` }}>Behavioral & Social</div>
              <MetricBar label="Mental Distress"    county={p.mentalHealthRate} national={14.4} />
              <MetricBar label="Depression"         county={p.depressionRate}   national={18.4} />
              <MetricBar label="Food Insecurity"    county={p.foodInsecurity}   national={10.5} />
              <MetricBar label="Physical Inactivity" county={p.physicalInactivity} national={25.3} />
              <MetricBar label="No Internet"        county={p.noInternet}       national={18.0} />
              <MetricBar label="Uninsured"          county={p.uninsuredRate}    national={9.2}  />
            </div>
          </div>
          <div style={{ marginTop: 10, fontFamily: GEIST, fontSize: 9, color: TXT3, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 24, height: 4, background: GRN, borderRadius: 99 }} /> Below national avg (better)</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 24, height: 4, background: RED, borderRadius: 99 }} /> Above national avg (worse)</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 2, height: 12, background: TXT3 }} /> National average marker</span>
          </div>
        </Section>

        {/* ── Section 2: HRSA Shortage Designations ─────────────────────── */}
        <Section label="HRSA Shortage Designations" icon="medical_services">
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 16 }}>
            <HPSABlock label="Primary Care"  active={p.primaryCareHPSA}  score={p.primaryCareScore}  shortage={p.primaryCareShortage}  underserved={p.primaryCareUnderserved} />
            <HPSABlock label="Dental"        active={p.dentalHPSA}        score={p.dentalScore}        shortage={p.dentalShortage}        underserved={p.dentalUnderserved} />
            <HPSABlock label="Mental Health" active={p.mentalHealthHPSA}  score={p.mentalHealthScore}  shortage={p.mentalHealthShortage}  underserved={p.mentalHealthUnderserved} />
          </div>
        </Section>

        {/* ── Section 3: Social Vulnerability & Community Access ────────── */}
        <Section label="Social Vulnerability & Community Access" icon="layers">
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 1fr', gap: isMobile ? 0 : 48 }}>

            <div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
                {[
                  { label: 'Socioeconomic',     value: p.sviSocioeconomic },
                  { label: 'Household Comp.',   value: p.sviHousehold },
                  { label: 'Minority Status',   value: p.sviMinority },
                  { label: 'Housing/Transport', value: p.sviHousingTransport },
                ].map(t => {
                  const c = t.value > 0.75 ? RED : t.value > 0.5 ? PRI : t.value > 0.25 ? PRI_TXT : GRN
                  return (
                    <div key={t.label} style={{ background: 'var(--s-card)', borderRadius: 4, padding: '14px 16px' }}>
                      <div style={{ fontFamily: GEIST, fontSize: 9, color: TXT3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>{t.label}</div>
                      <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 600, color: c, lineHeight: 1, marginBottom: 10 }}>{t.value.toFixed(2)}</div>
                      <div style={{ height: 4, background: SURF, borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${t.value * 100}%`, background: c, borderRadius: 99 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 14, borderTop: `1px solid ${BDR2}`, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: GEIST, fontSize: 10, color: TXT3, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>Overall SVI</span>
                <div style={{ flex: 1, minWidth: 80, height: 6, background: SURF, borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${p.sviScore * 100}%`, background: risk.color, borderRadius: 99 }} />
                </div>
                <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, color: risk.color, flexShrink: 0 }}>{p.sviScore.toFixed(3)}</span>
                <span style={{ background: `${risk.color}18`, border: `1px solid ${risk.color}44`, color: risk.color, borderRadius: 2, padding: '2px 8px', fontSize: 9, fontFamily: GEIST, fontWeight: 700, letterSpacing: '0.1em', flexShrink: 0 }}>{risk.label.toUpperCase()}</span>
              </div>
              <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 0 : '0 24px' }}>
                <MetricBar label="Poverty Rate"  county={p.povertyRate}      national={12.5} />
                <MetricBar label="Unemployment"  county={p.unemploymentRate} national={3.7}  />
                <MetricBar label="No Vehicle"    county={p.noVehicle}        national={8.0}  />
              </div>
            </div>

            <div style={{ borderLeft: isMobile ? 'none' : `1px solid ${BDR2}`, borderTop: isMobile ? `1px solid ${BDR2}` : 'none', paddingLeft: isMobile ? 0 : 28, paddingTop: isMobile ? 24 : 0, marginTop: isMobile ? 24 : 0 }}>
              <div style={{ fontFamily: GEIST, fontSize: 9, color: TXT3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>FQHC Sites</div>
              <div style={{ fontFamily: MONO, fontSize: 40, fontWeight: 600, color: p.hasFQHC ? BLU : RED, lineHeight: 1, marginBottom: 12 }}>{p.fqhcCount}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {[
                  { label: 'Has FQHC',       active: p.hasFQHC },
                  { label: 'Rural FQHC',     active: p.fqhcHasRural },
                  { label: 'MUA Designated', active: p.isMUA },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: r.active ? GRN : RED, flexShrink: 0 }} />
                    <span style={{ fontFamily: GEIST, fontSize: 11, color: r.active ? TXT2 : TXT3 }}>{r.label}</span>
                  </div>
                ))}
              </div>
              {p.fqhcSiteNames.slice(0, 3).map((name, i) => (
                <div key={i} style={{ fontFamily: GEIST, fontSize: 10, color: TXT3, padding: '5px 0', borderTop: `1px solid ${BDR}`, lineHeight: 1.4 }}>
                  {name.length > 30 ? name.slice(0, 30) + '…' : name}
                </div>
              ))}
              {p.fqhcCount > 3 && <div style={{ fontFamily: GEIST, fontSize: 10, color: TXT3, marginTop: 6 }}>+{p.fqhcCount - 3} more</div>}
            </div>

          </div>
        </Section>

      </div>
    </div>
  )
}
