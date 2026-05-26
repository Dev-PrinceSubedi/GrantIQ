// src/app/api/brief/route.ts
// POST /api/brief — streams AI analysis for all 6 modes

import { NextRequest, NextResponse } from 'next/server'
import { getCountyProfile } from '@/lib/countyData'
import { matchGrants } from '@/lib/matchEngine'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fips, mode = 'needs', grantId, applicantName, allGrants = [], nearMisses = [] } = body

    if (!fips) return NextResponse.json({ error: 'fips is required' }, { status: 400 })

    const profile = await getCountyProfile(fips)
    if (!profile) return NextResponse.json({ error: 'County not found' }, { status: 404 })

    // Use client-provided grants when available; fall back to server-computed for strategy/competitive
    const { matches: serverMatches, nearMisses: serverNearMisses } = matchGrants(profile)
    const matches     = allGrants.length > 0   ? allGrants    : serverMatches
    const allNearMisses = nearMisses.length > 0 ? nearMisses   : serverNearMisses

    let prompt = ''
    const systemPrompt = `You are a federal grant strategist specializing in rural health and underserved community applications for Mississippi county health departments. You write with precision, cite specific data, and give actionable recommendations. Format with markdown headers (##) and bullet points where appropriate.`

    switch (mode) {
      case 'needs': {
        // Look in client-supplied grants first, then server-computed
        const pool = [...allGrants, ...serverMatches, ...serverNearMisses]
        const grant = pool.find((g: Grant) => g.opportunityId === grantId) ?? pool[0]
        if (!grant) return NextResponse.json({ error: 'No grants available for this county' }, { status: 404 })
        prompt = buildNeedsStatement(profile, grant, applicantName)
        break
      }
      case 'report':
        prompt = buildVulnerabilityReport(profile, matches)
        break
      case 'strategy':
        prompt = buildGrantStrategy(profile, matches, allNearMisses)
        break
      case 'gap': {
        const nearGrant = allNearMisses.find((g: Grant) => g.opportunityId === grantId) ?? allNearMisses[0]
        if (!nearGrant) return NextResponse.json({ error: 'No near-miss grant found' }, { status: 404 })
        prompt = buildGapAnalysis(profile, nearGrant)
        break
      }
      case 'narrative': {
        const grant = matches.find((g: Grant) => g.opportunityId === grantId) ?? matches[0]
        prompt = buildDataNarrative(profile, grant, applicantName)
        break
      }
      case 'competitive':
        prompt = buildCompetitiveLandscape(profile, matches)
        break
      default:
        return NextResponse.json({ error: 'Unknown mode' }, { status: 400 })
    }

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1400,
        stream: true,
        temperature: 0.65,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: prompt },
        ],
      }),
    })

    if (!openaiRes.ok) {
      const err = await openaiRes.text()
      console.error('OpenAI error:', err)
      return NextResponse.json({ error: 'OpenAI API failed' }, { status: 500 })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const reader = openaiRes.body!.getReader()
        const decoder = new TextDecoder()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value)
            for (const line of chunk.split('\n').filter(l => l.startsWith('data: '))) {
              const data = line.slice(6)
              if (data === '[DONE]') { controller.close(); return }
              try {
                const text = JSON.parse(data).choices?.[0]?.delta?.content
                if (text) controller.enqueue(encoder.encode(text))
              } catch { /* skip */ }
            }
          }
        } catch (e) { controller.error(e) }
        finally { reader.releaseLock() }
      },
    })

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' },
    })
  } catch (err) {
    console.error('Brief API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── PROMPT BUILDERS ────────────────────────────────────────────────────────────

type Profile = NonNullable<Awaited<ReturnType<typeof getCountyProfile>>>
type Grant   = ReturnType<typeof matchGrants>['matches'][0]

function countyContext(p: Profile) {
  return `COUNTY: ${p.countyName} County, Mississippi (FIPS: ${p.fips})
POPULATION: ${p.population.toLocaleString()} | RURAL STATUS: ${p.ruralStatus}
DESIGNATIONS: ${[
    p.primaryCareHPSA  && `Primary Care HPSA (Score ${p.primaryCareScore})`,
    p.dentalHPSA       && `Dental HPSA (Score ${p.dentalScore})`,
    p.mentalHealthHPSA && `Mental Health HPSA (Score ${p.mentalHealthScore})`,
    p.isMUA            && `MUA (Score ${p.muaScore})`,
    p.isRural          && 'Rural',
  ].filter(Boolean).join(', ') || 'None'}

HEALTH BURDEN (CDC PLACES):
  Diabetes ${p.diabetesRate}% (nat. 11.6%) | Hypertension ${p.hypertensionRate}% (nat. 32.5%) | Obesity ${p.obesityRate}% (nat. 31.9%)
  Uninsured ${p.uninsuredRate}% (nat. 10.2%) | Mental distress ${p.mentalHealthRate}% (nat. 14.4%) | Depression ${p.depressionRate}%
  Food insecurity ${p.foodInsecurity}% (nat. 10.5%) | No internet ${p.noInternet}% | Physical inactivity ${p.physicalInactivity}%

SOCIAL VULNERABILITY (SVI 2022): Overall ${p.sviScore.toFixed(3)} | Poverty ${p.povertyRate}% (nat. 12.5%) | Unemployment ${p.unemploymentRate}% | No vehicle ${p.noVehicle}%

PROVIDER SHORTAGE: Primary care underserved ${p.primaryCareUnderserved.toLocaleString()} | Mental health underserved ${p.mentalHealthUnderserved.toLocaleString()} | FQHCs ${p.fqhcCount}`
}

function buildNeedsStatement(p: Profile, grant: Grant, applicant?: string) {
  return `Write a compelling federal grant needs statement for a Grants.gov application.

APPLICANT: ${applicant || `${p.countyName} County Health Department`}
GRANT: ${grant.title} (${grant.agencyCode}) | Award $${grant.awardFloor?.toLocaleString()}–$${grant.awardCeiling?.toLocaleString()}
MATCH SCORE: ${grant.matchScore}/100

${countyContext(p)}

Write exactly 3 sections:
## Statement of Need
## Target Population and Geographic Area
## Proposed Impact and Justification

Rules: Auto-cite every statistic with "County's X rate of Y% exceeds the national average of Z%" phrasing. Reference HPSA/MUA designations by name. Use HRSA grant application language. 550–750 words total. No placeholders.`
}

function buildVulnerabilityReport(p: Profile, matches: Grant[]) {
  const top3 = matches.slice(0, 3).map(g => `  - ${g.title} (${g.agencyCode}): $${g.awardCeiling?.toLocaleString()}, match ${Math.round(g.matchScore)}%`).join('\n')
  const totalFunding = matches.reduce((s, g) => s + (g.awardCeiling ?? 0), 0)
  return `Generate a PDF-ready executive vulnerability report for a county health department grant coordinator.

${countyContext(p)}

TOP MATCHED GRANTS (${matches.length} total, ~$${(totalFunding / 1_000_000).toFixed(1)}M available):
${top3}

Write these sections:
## Why ${p.countyName} County Qualifies
## Key Data Points (bullet list of the most compelling statistics vs national)
## Federal Designations — What They Unlock
## Recommended Application Priority Order
## Competitive Position

Make it factual, direct, and actionable. This will be presented to county commissioners. 500–700 words.`
}

function buildGrantStrategy(p: Profile, matches: Grant[], nearMisses: Grant[]) {
  const urgent = matches.filter(g => (g.daysUntilClose ?? 999) <= 30)
  const grantList = matches.slice(0, 8).map(g =>
    `  - ${g.title} (${g.agencyCode}): match ${Math.round(g.matchScore)}%, eligibility ${Math.round(g.eligibilityScore)}%, award $${g.awardCeiling?.toLocaleString() ?? 'N/A'}, closes in ${g.daysUntilClose ?? '?'} days`
  ).join('\n')
  const nearList = nearMisses.slice(0, 4).map(g =>
    `  - ${g.title} (${g.agencyCode}): missing [${g.missingCriteria?.map(c => c.label).join(', ')}]`
  ).join('\n')

  return `Act as a grant strategy advisor for a Mississippi county health department. Analyze all matched grants and provide a clear strategic plan.

${countyContext(p)}

MATCHED GRANTS:
${grantList}

NEAR-MISS GRANTS:
${nearList}

URGENT (closing ≤30 days): ${urgent.length > 0 ? urgent.map(g => g.title).join(', ') : 'None'}

Write:
## Apply First — Highest Success Probability (top 3 with reasoning)
## Secondary Targets (next 2–3)
## Near-Miss Strategy (which to pursue and why)
## Deadline Alerts
## Capacity Recommendation (realistic workload for a small health department)

Be specific about WHY each grant is prioritized. Cite match scores and eligibility. 500–650 words.`
}

function buildGapAnalysis(p: Profile, grant: Grant) {
  const missing = grant.missingCriteria ?? []
  const missingList = missing.map(c =>
    `  - ${c.label}: ${c.description} → Fix: ${c.howToClose}`
  ).join('\n')

  return `Analyze exactly what ${p.countyName} County is missing to qualify for this grant and provide a concrete action plan.

${countyContext(p)}

GRANT: ${grant.title} (${grant.agencyCode})
AWARD: $${grant.awardFloor?.toLocaleString()}–$${grant.awardCeiling?.toLocaleString()}
CURRENT MATCH SCORE: ${Math.round(grant.matchScore)}% (near-miss, not fully qualified)

MISSING CRITERIA:
${missingList || '  - Specific criteria not identified — general eligibility gap'}

Write:
## What Is Missing (plain English, no jargon)
## Effort & Timeline to Close Each Gap
## Step-by-Step Action Plan
## Is It Worth Pursuing? (honest assessment)
## Alternative Grants to Consider While Closing Gaps

Be brutally honest about timelines. If getting MUA designation takes 6 months, say so and explain the process. 450–600 words.`
}

function buildDataNarrative(p: Profile, grant?: Grant, applicant?: string) {
  return `Write a compelling 2-paragraph community health narrative for a federal grant application.

APPLICANT: ${applicant || `${p.countyName} County Health Department`}
${grant ? `GRANT FOCUS: ${grant.title} (${grant.agencyCode})` : 'GENERAL PURPOSE: applicable to HRSA/CDC health access grants'}

${countyContext(p)}

Requirements:
- Paragraph 1: Paint a vivid picture of the community's health burden using specific statistics. Make federal reviewers feel the urgency.
- Paragraph 2: Explain why this community deserves funding — designations, historical underinvestment, geographic barriers, what existing resources exist and where they fall short.
- Use language federal health program reviewers expect: "medically underserved," "health professional shortage," "social determinants of health," "evidence-based intervention."
- Every statistic must be cited with source (CDC PLACES, SVI 2022, HRSA).
- No filler phrases. Every sentence earns its place.
- Total: 220–280 words across both paragraphs.

Output only the two paragraphs, no headers.`
}

function buildCompetitiveLandscape(p: Profile, matches: Grant[]) {
  // MS state averages for comparison
  return `Analyze how ${p.countyName} County compares competitively against all 82 Mississippi counties for federal grant eligibility.

${countyContext(p)}

MATCHED GRANTS: ${matches.length} | TOTAL POTENTIAL: $${(matches.reduce((s, g) => s + (g.awardCeiling ?? 0), 0) / 1_000_000).toFixed(1)}M

MISSISSIPPI STATE AVERAGES (for comparison):
  Diabetes 14.3% | Hypertension 39.1% | Obesity 39.7% | Uninsured 12.1% | Mental distress 17.2%
  Poverty 19.6% | Unemployment 4.9% | SVI avg 0.71 | Counties with FQHCs: ~42 of 82
  Primary Care HPSAs: 68 of 82 counties | MUA designated: ~54 of 82

Write:
## Overall Competitive Position
## Strongest Competitive Advantages (metrics where county ranks highest-need)
## Areas of Relative Strength vs MS Average
## FQHC & Infrastructure Context (how existing or absent infrastructure affects eligibility)
## Designation Competitiveness (HPSA score ranking context)
## Strategic Implication: What This Means for Your Applications

Be specific: "Your diabetes rate of X% ranks you in the top Y of Mississippi counties by need." Use directional language. 500–650 words.`
}
