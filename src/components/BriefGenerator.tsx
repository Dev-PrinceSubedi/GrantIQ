'use client'
import { useState } from 'react'
import { GrantMatch, CountyProfile } from '@/types'

const GEIST = "'IBM Plex Sans', Inter, sans-serif"
const BDR2  = 'var(--s-bdr2)'
const CARD  = 'var(--s-card)'
const CARDHI= 'var(--s-cardhi)'
const PRI   = 'var(--s-pri)'
const PRI_TXT = 'var(--s-pri-txt)'
const GRN   = 'var(--s-grn)'
const RED   = 'var(--s-red)'
const TXT   = 'var(--s-txt)'
const TXT2  = 'var(--s-txt2)'
const TXT3  = 'var(--s-txt3)'
const SURF  = 'var(--s-surf)'

type Mode = 'needs' | 'report' | 'strategy' | 'gap' | 'narrative' | 'competitive'

const MODE_PREVIEW: Record<Mode, { sections: string[]; bullets: string[] }> = {
  needs:       { sections: ['Statement of Need', 'Target Population & Geographic Area', 'Proposed Impact & Justification'], bullets: ['Auto-cited stats vs national benchmarks', 'HPSA/MUA designation language throughout', 'HRSA NOFO-matched framing', '550–750 words, paste directly into Grants.gov'] },
  report:      { sections: ['Why Your County Qualifies', 'Key Data Points', 'Designations & What They Unlock', 'Application Priority Order', 'Competitive Position'], bullets: ['Executive summary for county commissioners', 'Competitive scoring vs all 82 MS counties', 'Which programs each designation unlocks'] },
  strategy:    { sections: ['Apply First — Highest Probability', 'Secondary Targets', 'Near-Miss Strategy', 'Deadline Alerts', 'Capacity Recommendation'], bullets: ['Ranked by success probability & eligibility', 'Specific reasoning for each grant priority', 'Realistic workload for a small health dept'] },
  gap:         { sections: ['What Is Missing (Plain English)', 'Effort & Timeline per Gap', 'Step-by-Step Action Plan', 'Is It Worth Pursuing?', 'Alternatives While Closing Gaps'], bullets: ['No jargon — clear gap explanation', 'Realistic timelines (e.g. MUA ≈ 6 months)', 'Process steps for each missing qualification'] },
  narrative:   { sections: ['Community Health Narrative — Paragraph 1', 'Community Health Narrative — Paragraph 2'], bullets: ['Federal reviewer language throughout', 'Every statistic cited (CDC PLACES, SVI, HRSA)', 'SDOH and equity framing', '220–280 words, no filler sentences'] },
  competitive: { sections: ['Overall Competitive Position', 'Strongest Advantages', 'Designation Ranking Context', 'FQHC Infrastructure Analysis', 'Strategic Implications'], bullets: ['Ranked against all 82 Mississippi counties', 'Top-percentile metrics highlighted', 'Neighboring county FQHC context'] },
}

const MODES: { id: Mode; icon: string; title: string; desc: string; needsGrant?: boolean; nearMissOnly?: boolean }[] = [
  { id: 'needs',       icon: 'description',  title: 'Needs Statement',    desc: 'Complete Section 1 with cited statistics & NOFO language', needsGrant: true },
  { id: 'report',      icon: 'summarize',    title: 'Vuln. Report',       desc: 'PDF-ready executive summary + application priority order' },
  { id: 'strategy',    icon: 'psychology',   title: 'Grant Strategy',     desc: 'Priority ranking of all matched grants by success probability' },
  { id: 'gap',         icon: 'troubleshoot', title: 'Gap Analyzer',       desc: 'What is missing for near-miss grants and how to close it', nearMissOnly: true },
  { id: 'narrative',   icon: 'auto_stories', title: 'Data Narrative',     desc: '2-paragraph community health narrative for federal reviewers', needsGrant: true },
  { id: 'competitive', icon: 'leaderboard',  title: 'Competitive Rank',   desc: 'Your county vs all 82 MS counties — where you stand' },
]

interface Props {
  fips: string
  countyName: string
  grants: GrantMatch[]
  nearMisses?: GrantMatch[]
  profile?: CountyProfile | null
}

function renderMarkdown(text: string, loading: boolean) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.8, fontFamily: GEIST }}>
      {text.split('\n').map((line, i) => {
        if (line.startsWith('## '))
          return <div key={i} style={{ color: PRI, fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: i > 0 ? 20 : 0, marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${BDR2}` }}>{line.slice(3)}</div>
        if (line.startsWith('# '))
          return <div key={i} style={{ color: TXT, fontWeight: 800, fontSize: 15, marginBottom: 12 }}>{line.slice(2)}</div>
        if (line.startsWith('- ') || line.startsWith('• '))
          return <div key={i} style={{ color: TXT2, paddingLeft: 14, position: 'relative', marginBottom: 2 }}><span style={{ position: 'absolute', left: 0, color: PRI }}>›</span>{line.slice(2)}</div>
        if (line.match(/^\*\*(.+)\*\*/))
          return <div key={i} style={{ color: TXT, fontWeight: 700, marginBottom: 4 }}>{line.replace(/\*\*/g, '')}</div>
        return <p key={i} style={{ margin: line === '' ? '6px 0' : '0 0 2px', color: TXT2 }}>{line}</p>
      })}
      {loading && <span style={{ display: 'inline-block', width: 7, height: 13, background: PRI, animation: 'pulse-amber 0.8s infinite', marginLeft: 2, verticalAlign: 'text-bottom', borderRadius: 1 }} />}
    </div>
  )
}

export default function BriefGenerator({ fips, countyName, grants, nearMisses = [] }: Props) {
  const [mode,          setMode]          = useState<Mode>('needs')
  const [selectedGrant, setSelectedGrant] = useState(grants[0]?.opportunityId ?? '')
  const [selectedNear,  setSelectedNear]  = useState(nearMisses[0]?.opportunityId ?? '')
  const [applicantName, setApplicantName] = useState(`${countyName} County Health Department`)
  const [output,        setOutput]        = useState('')
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [copied,        setCopied]        = useState(false)

  const activeMode = MODES.find(m => m.id === mode)!

  const run = async () => {
    setLoading(true); setOutput(''); setError(null)
    const grantId = mode === 'gap' ? selectedNear : (activeMode.needsGrant ? selectedGrant : undefined)
    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fips, mode, grantId, applicantName, allGrants: grants, nearMisses }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); setLoading(false); return }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let text = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value)
        setOutput(text)
      }
    } catch { setError('Failed to connect to AI service') }
    finally { setLoading(false) }
  }

  const copy = () => { navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  const grantForMode = mode === 'gap'
    ? nearMisses.find(g => g.opportunityId === selectedNear)
    : grants.find(g => g.opportunityId === selectedGrant)

  return (
    <div style={{ background: CARD, border: `1px solid ${BDR2}`, borderRadius: 6, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${BDR2}`, background: SURF }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: PRI }}>bolt</span>
        <span style={{ fontFamily: GEIST, fontSize: 11, fontWeight: 700, color: PRI_TXT, letterSpacing: '0.1em', textTransform: 'uppercase' }}>AI Analysis Suite</span>
        <span style={{ fontFamily: GEIST, fontSize: 9, color: GRN, background: 'rgba(78,222,163,0.1)', border: '1px solid rgba(78,222,163,0.25)', borderRadius: 2, padding: '2px 7px', letterSpacing: '0.08em', fontWeight: 700 }}>GPT-4o mini</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: GEIST, fontSize: 10, color: TXT3 }}>{countyName} County · {grants.length} matched grants</span>
      </div>

      {/* Mode selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', borderBottom: `1px solid ${BDR2}` }}>
        {MODES.map((m, i) => {
          const active = mode === m.id
          return (
            <button key={m.id} onClick={() => { setMode(m.id); setOutput(''); setError(null) }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px', background: active ? CARDHI : 'transparent', borderRight: i < 5 ? `1px solid ${BDR2}` : 'none', border: 'none', borderBottom: active ? `2px solid ${PRI}` : '2px solid transparent', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = SURF }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: active ? PRI : TXT3 }}>{m.icon}</span>
              <span style={{ fontFamily: GEIST, fontSize: 9, fontWeight: active ? 700 : 400, color: active ? PRI_TXT : TXT3, letterSpacing: '0.06em', textAlign: 'center', lineHeight: 1.3 }}>{m.title}</span>
            </button>
          )
        })}
      </div>

      <div style={{ padding: '14px 16px' }}>

        {/* Mode description */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 15, color: PRI }}>{activeMode.icon}</span>
          <span style={{ fontFamily: GEIST, fontSize: 11, color: TXT2 }}>{activeMode.desc}</span>
        </div>

        {/* Inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: activeMode.needsGrant || activeMode.nearMissOnly ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 12 }}>

          <div>
            <div style={{ fontFamily: GEIST, fontSize: 9, color: TXT3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>Organization</div>
            <input value={applicantName} onChange={e => setApplicantName(e.target.value)}
              style={{ width: '100%', background: SURF, border: `1px solid ${BDR2}`, borderRadius: 4, color: TXT, fontSize: 12, padding: '8px 10px', outline: 'none', fontFamily: GEIST, boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = PRI}
              onBlur={e => e.target.style.borderColor = BDR2} />
          </div>

          {activeMode.needsGrant && grants.length > 0 && (
            <div>
              <div style={{ fontFamily: GEIST, fontSize: 9, color: TXT3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>Target Grant</div>
              <select value={selectedGrant} onChange={e => setSelectedGrant(e.target.value)}
                style={{ width: '100%', background: SURF, border: `1px solid ${BDR2}`, borderRadius: 4, color: TXT, fontSize: 11, padding: '8px 10px', outline: 'none', fontFamily: GEIST, cursor: 'pointer', boxSizing: 'border-box' }}>
                {grants.filter((g, i, a) => a.findIndex(x => x.opportunityId === g.opportunityId) === i).map((g, i) => (
                  <option key={`${g.opportunityId}-${i}`} value={g.opportunityId}>[{g.agencyCode}] {g.title.slice(0, 60)}</option>
                ))}
              </select>
              {grantForMode && <div style={{ fontFamily: GEIST, fontSize: 10, color: TXT3, marginTop: 4 }}>Match score: {Math.round(grantForMode.matchScore)}% · Award up to ${grantForMode.awardCeiling?.toLocaleString()}</div>}
            </div>
          )}

          {activeMode.nearMissOnly && nearMisses.length > 0 && (
            <div>
              <div style={{ fontFamily: GEIST, fontSize: 9, color: TXT3, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>Near-Miss Grant</div>
              <select value={selectedNear} onChange={e => setSelectedNear(e.target.value)}
                style={{ width: '100%', background: SURF, border: `1px solid ${BDR2}`, borderRadius: 4, color: TXT, fontSize: 11, padding: '8px 10px', outline: 'none', fontFamily: GEIST, cursor: 'pointer', boxSizing: 'border-box' }}>
                {nearMisses.filter((g, i, a) => a.findIndex(x => x.opportunityId === g.opportunityId) === i).map((g, i) => (
                  <option key={`${g.opportunityId}-${i}`} value={g.opportunityId}>[{g.agencyCode}] {g.title.slice(0, 60)}</option>
                ))}
              </select>
              {nearMisses.length === 0 && <div style={{ fontFamily: GEIST, fontSize: 10, color: TXT3, marginTop: 4 }}>No near-miss grants available for this county.</div>}
            </div>
          )}

          {activeMode.nearMissOnly && nearMisses.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,180,171,0.08)', border: `1px solid rgba(255,180,171,0.2)`, borderRadius: 4, padding: '8px 12px' }}>
              <span style={{ fontFamily: GEIST, fontSize: 11, color: RED }}>No near-miss grants found for this county.</span>
            </div>
          )}
        </div>

        {/* Run button */}
        <button onClick={run} disabled={loading || (activeMode.nearMissOnly && nearMisses.length === 0)}
          style={{ width: '100%', padding: '10px', background: loading ? CARDHI : PRI, color: loading ? TXT3 : '#231b00', border: 'none', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: GEIST, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s', marginBottom: output || error ? 12 : 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{loading ? 'sync' : 'bolt'}</span>
          {loading ? `Generating ${activeMode.title}...` : `Generate ${activeMode.title}`}
        </button>

        {/* Skeleton preview —> shown when idle */}
        {!output && !error && !loading && (
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* Left — document structure skeleton */}
            <div style={{ background: SURF, border: `1px solid ${BDR2}`, borderRadius: 4, padding: '20px 24px' }}>
              <div style={{ fontFamily: GEIST, fontSize: 9, color: TXT3, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12 }}>Document Structure</div>
              {MODE_PREVIEW[mode].sections.map((section, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 2, height: 12, background: PRI, borderRadius: 99, flexShrink: 0, opacity: 0.5 + i * 0.1 }} />
                    <span style={{ fontFamily: GEIST, fontSize: 10, fontWeight: 700, color: TXT3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{section}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingLeft: 10 }}>
                    {[0.85, 0.65, 0.45].slice(0, i === MODE_PREVIEW[mode].sections.length - 1 ? 2 : 3).map((w, j) => (
                      <div key={j} style={{ height: 7, borderRadius: 3, background: BDR2, opacity: 0.35, width: `${w * 100}%` }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Right — what you'll get */}
            <div style={{ background: SURF, border: `1px solid ${BDR2}`, borderRadius: 4, padding: '20px 24px' }}>
              <div style={{ fontFamily: GEIST, fontSize: 9, color: TXT3, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12 }}>What You'll Get</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {MODE_PREVIEW[mode].bullets.map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 13, color: GRN, flexShrink: 0, marginTop: 1 }}>check_circle</span>
                    <span style={{ fontFamily: GEIST, fontSize: 11, color: TXT2, lineHeight: 1.4 }}>{b}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${BDR2}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 13, color: TXT3 }}>database</span>
                <span style={{ fontFamily: GEIST, fontSize: 9, color: TXT3, lineHeight: 1.5 }}>Powered by real CDC PLACES, SVI 2022, and HRSA data for {countyName} County</span>
              </div>
            </div>

          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(255,180,171,0.08)', border: `1px solid rgba(255,180,171,0.25)`, borderRadius: 4, padding: '10px 14px', color: RED, fontSize: 11, fontFamily: GEIST, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* Output */}
        {output && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontFamily: GEIST, fontSize: 9, color: TXT3, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{activeMode.title} — {countyName} County</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={copy}
                  style={{ background: copied ? 'rgba(78,222,163,0.12)' : CARDHI, border: `1px solid ${copied ? 'rgba(78,222,163,0.3)' : BDR2}`, borderRadius: 3, color: copied ? GRN : TXT2, padding: '4px 12px', cursor: 'pointer', fontSize: 10, fontFamily: GEIST, fontWeight: 700, letterSpacing: '0.06em', transition: 'all 0.2s' }}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div style={{ background: SURF, border: `1px solid ${BDR2}`, borderLeft: `3px solid ${PRI}`, borderRadius: 4, padding: '16px 20px', maxHeight: 420, overflowY: 'auto' }}>
              {renderMarkdown(output, loading)}
            </div>
            <div style={{ marginTop: 6, fontFamily: GEIST, fontSize: 9, color: TXT3 }}>
              Generated using real CDC PLACES, SVI 2022, and HRSA data · {output.split(' ').length} words
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
