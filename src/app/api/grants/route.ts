// src/app/api/grants/route.ts
// GET /api/grants?fips=28049
// Fetches live Grants.gov opportunities + scores each against county profile

import { NextRequest, NextResponse } from 'next/server'
import { getCountyProfile } from '@/lib/countyData'
import { matchGrants, calcTotalUnclaimed } from '@/lib/matchEngine'
import { CountyProfile, GrantMatch, GrantsGovOpportunity } from '@/types'

const GRANTS_GOV_URL = 'https://api.grants.gov/v1/api/search2'

// ─── 12 keyword searches to run in parallel ───────────────────────────────────
const SEARCH_KEYWORDS = [
  'rural health',
  'primary care shortage area',
  'community health center',
  'chronic disease prevention',
  'mental health rural underserved',
  'behavioral health',
  'substance use disorder treatment',
  'oral health dental shortage',
  'maternal child health',
  'social determinants health equity',
  'rural health workforce',
  'medically underserved',
]

// ─── CFDA → eligibility rules ─────────────────────────────────────────────────
// Real CFDA numbers with known eligibility requirements
const CFDA_RULES: Record<string, {
  requiresMUA?: boolean
  requiresRural?: boolean
  requiresPCHPSA?: boolean
  requiresDentalHPSA?: boolean
  requiresMHHPSA?: boolean
  diabetesThreshold?: number
  povertyThreshold?: number
  sviThreshold?: number
  programType: string
}> = {
  '93.224': { requiresMUA: true, requiresPCHPSA: true, programType: 'health_center' },
  '93.887': { requiresMUA: true, programType: 'health_center' },
  '93.527': { requiresMUA: true, programType: 'health_center' },
  '93.912': { requiresRural: true, programType: 'rural_health' },
  '93.913': { requiresRural: true, programType: 'rural_outreach' },
  '93.324': { requiresRural: true, programType: 'rural_health' },
  '93.226': { requiresPCHPSA: true, programType: 'primary_care_workforce' },
  '93.307': { sviThreshold: 0.5, programType: 'health_disparities' },
  '93.211': { requiresDentalHPSA: true, programType: 'oral_health' },
  '93.493': { requiresDentalHPSA: true, programType: 'oral_health' },
  '93.958': { requiresMHHPSA: true, programType: 'mental_health' },
  '93.959': { requiresMHHPSA: true, programType: 'substance_use' },
  '93.243': { requiresMHHPSA: true, programType: 'substance_use' },
  '93.757': { diabetesThreshold: 12.0, programType: 'diabetes' },
  '93.767': { programType: 'chronic_disease' },
  '93.945': { programType: 'chronic_disease' },
  '93.735': { sviThreshold: 0.5, programType: 'health_equity' },
  '93.870': { povertyThreshold: 15, programType: 'maternal_child' },
  '93.994': { povertyThreshold: 15, programType: 'maternal_child' },
  '10.854': { requiresRural: true, programType: 'usda_rural' },
  '10.766': { requiresRural: true, programType: 'usda_rural' },
}

// ─── Title/keyword → eligibility signals ─────────────────────────────────────
const TITLE_SIGNALS: Array<{
  patterns: string[]
  requiresMUA?: boolean
  requiresRural?: boolean
  requiresPCHPSA?: boolean
  requiresDentalHPSA?: boolean
  requiresMHHPSA?: boolean
  sviThreshold?: number
  povertyThreshold?: number
  diabetesThreshold?: number
  needFields: (keyof CountyProfile)[]
  weight: number
}> = [
  {
    patterns: ['health center', 'fqhc', 'federally qualified', 'community health center', 'new access point', 'look-alike'],
    requiresMUA: true,
    needFields: ['primaryCareScore', 'primaryCareUnderserved', 'povertyRate', 'uninsuredRate'],
    weight: 1.0,
  },
  {
    patterns: ['rural health', 'rural outreach', 'rural access', 'frontier', 'critical access'],
    requiresRural: true,
    needFields: ['primaryCareScore', 'povertyRate', 'uninsuredRate', 'noInternet'],
    weight: 1.0,
  },
  {
    patterns: ['primary care', 'shortage area', 'hpsa', 'health professional shortage', 'workforce'],
    requiresPCHPSA: true,
    needFields: ['primaryCareScore', 'primaryCareShortage', 'primaryCareUnderserved', 'uninsuredRate'],
    weight: 0.9,
  },
  {
    patterns: ['dental', 'oral health', 'dentist', 'fluoride'],
    requiresDentalHPSA: true,
    needFields: ['dentalScore', 'dentalShortage', 'dentalUnderserved', 'povertyRate'],
    weight: 0.9,
  },
  {
    patterns: ['mental health', 'behavioral health', 'psychiatric', 'counseling', 'crisis intervention'],
    requiresMHHPSA: true,
    needFields: ['mentalHealthScore', 'mentalHealthRate', 'mentalHealthUnderserved', 'depressionRate'],
    weight: 0.9,
  },
  {
    patterns: ['substance use', 'opioid', 'addiction', 'recovery', 'drug', 'alcohol treatment'],
    requiresMHHPSA: true,
    needFields: ['mentalHealthScore', 'povertyRate', 'unemploymentRate', 'sviScore'],
    weight: 0.85,
  },
  {
    patterns: ['diabetes', 'diabetes prevention', 'diabetes management'],
    diabetesThreshold: 12.0,
    needFields: ['diabetesRate', 'obesityRate', 'physicalInactivity', 'povertyRate'],
    weight: 0.85,
  },
  {
    patterns: ['chronic disease', 'heart disease', 'cardiovascular', 'obesity', 'hypertension', 'tobacco'],
    needFields: ['diabetesRate', 'hypertensionRate', 'obesityRate', 'smokingRate', 'physicalInactivity'],
    weight: 0.8,
  },
  {
    patterns: ['maternal', 'child health', 'infant', 'prenatal', 'perinatal', 'women and children'],
    povertyThreshold: 15,
    needFields: ['povertyRate', 'singleParentRate', 'uninsuredRate', 'foodInsecurity'],
    weight: 0.85,
  },
  {
    patterns: ['social determinants', 'health equity', 'health disparities', 'underserved', 'vulnerable population'],
    sviThreshold: 0.5,
    needFields: ['sviScore', 'povertyRate', 'foodInsecurity', 'noInternet', 'lackTransport'],
    weight: 0.8,
  },
  {
    patterns: ['food insecurity', 'food access', 'nutrition', 'snap', 'wic'],
    needFields: ['foodInsecurity', 'foodStampRate', 'povertyRate', 'sviScore'],
    weight: 0.75,
  },
  {
    patterns: ['telehealth', 'telemedicine', 'broadband', 'internet access', 'digital health'],
    requiresRural: true,
    needFields: ['noInternet', 'lackTransport', 'primaryCareScore', 'povertyRate'],
    weight: 0.8,
  },
  {
    patterns: ['housing', 'homelessness', 'shelter', 'utility', 'energy assistance'],
    sviThreshold: 0.5,
    needFields: ['housingInsecurity', 'utilityShutoff', 'povertyRate', 'sviScore'],
    weight: 0.75,
  },
  {
    patterns: ['aging', 'elderly', 'older adults', 'senior', 'long-term care'],
    needFields: ['elderlyRate', 'disabilityRate', 'povertyRate', 'lackTransport'],
    weight: 0.75,
  },
  {
    patterns: ['disability', 'rehabilitation', 'assistive technology', 'independent living'],
    needFields: ['disabilityRate', 'sviDisability', 'povertyRate', 'noVehicle'],
    weight: 0.75,
  },
]

// ─── Score a live opportunity against a county ────────────────────────────────

function scoreLiveOpportunity(
  opp: GrantsGovOpportunity,
  county: CountyProfile
): { score: number; eligibilityScore: number; needScore: number; isEligible: boolean; signal: typeof TITLE_SIGNALS[0] | null; matchedCriteria: GrantMatch['matchedCriteria']; keyDataPoints: GrantMatch['keyDataPoints'] } | null {

  const titleLower = opp.title.toLowerCase()
  const agencyUpper = (opp.agencyCode || '').toUpperCase()

  // Find the best matching signal from title
  let bestSignal: typeof TITLE_SIGNALS[0] | null = null
  let bestPatternCount = 0

  for (const signal of TITLE_SIGNALS) {
    const matches = signal.patterns.filter(p => titleLower.includes(p)).length
    if (matches > bestPatternCount) {
      bestPatternCount = matches
      bestSignal = signal
    }
  }

  // No signal found — skip this opportunity
  if (!bestSignal || bestPatternCount === 0) return null

  // Get CFDA rules if available
  const cfdaRule = opp.cfdaList
    ? opp.cfdaList.map((c: string) => CFDA_RULES[c]).find(Boolean)
    : null

  // Merge signal + CFDA requirements (CFDA is more authoritative)
  const requiresMUA        = cfdaRule?.requiresMUA        ?? bestSignal.requiresMUA        ?? false
  const requiresRural      = cfdaRule?.requiresRural      ?? bestSignal.requiresRural      ?? false
  const requiresPCHPSA     = cfdaRule?.requiresPCHPSA     ?? bestSignal.requiresPCHPSA     ?? false
  const requiresDentalHPSA = cfdaRule?.requiresDentalHPSA ?? bestSignal.requiresDentalHPSA ?? false
  const requiresMHHPSA     = cfdaRule?.requiresMHHPSA     ?? bestSignal.requiresMHHPSA     ?? false
  const sviThreshold       = cfdaRule?.sviThreshold       ?? bestSignal.sviThreshold
  const povertyThreshold   = cfdaRule?.povertyThreshold   ?? bestSignal.povertyThreshold
  const diabetesThreshold  = cfdaRule?.diabetesThreshold  ?? bestSignal.diabetesThreshold

  // Check hard eligibility gates
  const checks: { label: string; field: string; met: boolean; value: string; threshold: string }[] = []

  if (requiresMUA) {
    checks.push({ label: 'MUA Designation', field: 'isMUA', met: county.isMUA, value: String(county.isMUA), threshold: 'Required' })
  }
  if (requiresRural) {
    checks.push({ label: 'Rural Status', field: 'isRural', met: county.isRural, value: county.ruralStatus, threshold: 'Required' })
  }
  if (requiresPCHPSA) {
    checks.push({ label: 'Primary Care HPSA', field: 'primaryCareHPSA', met: county.primaryCareHPSA, value: String(county.primaryCareHPSA), threshold: 'Required' })
  }
  if (requiresDentalHPSA) {
    checks.push({ label: 'Dental HPSA', field: 'dentalHPSA', met: county.dentalHPSA, value: String(county.dentalHPSA), threshold: 'Required' })
  }
  if (requiresMHHPSA) {
    checks.push({ label: 'Mental Health HPSA', field: 'mentalHealthHPSA', met: county.mentalHealthHPSA, value: String(county.mentalHealthHPSA), threshold: 'Required' })
  }
  if (sviThreshold !== undefined) {
    const met = county.sviScore >= sviThreshold
    checks.push({ label: `SVI ≥${sviThreshold}`, field: 'sviScore', met, value: county.sviScore.toFixed(3), threshold: String(sviThreshold) })
  }
  if (povertyThreshold !== undefined) {
    const met = county.povertyRate >= povertyThreshold
    checks.push({ label: `Poverty ≥${povertyThreshold}%`, field: 'povertyRate', met, value: `${county.povertyRate}%`, threshold: `${povertyThreshold}%` })
  }
  if (diabetesThreshold !== undefined) {
    const met = county.diabetesRate >= diabetesThreshold
    checks.push({ label: `Diabetes ≥${diabetesThreshold}%`, field: 'diabetesRate', met, value: `${county.diabetesRate}%`, threshold: `${diabetesThreshold}%` })
  }

  // If any required check fails → ineligible (but may still show as near miss)
  const failedRequired = checks.filter(c => !c.met)
  const isEligible = failedRequired.length === 0
  const isNearMiss = !isEligible && failedRequired.length === 1

  // Skip if more than 1 required check fails
  if (!isEligible && !isNearMiss) return null

  // Eligibility score
  const eligibilityScore = isEligible
    ? Math.min(100, 60 + (bestPatternCount * 10))
    : 30

  // Need score — how badly does this county need this specific type of grant
  let needTotal = 0
  let needCount = 0
  const THRESHOLDS: Partial<Record<keyof CountyProfile, number>> = {
    primaryCareScore: 14, dentalScore: 14, mentalHealthScore: 14,
    diabetesRate: 11.6, hypertensionRate: 32.5, obesityRate: 31.9,
    mentalHealthRate: 14.4, povertyRate: 12.5, uninsuredRate: 10.2,
    sviScore: 0.5, foodInsecurity: 10.5, noInternet: 18.0,
    physicalInactivity: 25.3, smokingRate: 14.0,
  }

  for (const field of bestSignal.needFields) {
    const val = county[field] as number
    const threshold = THRESHOLDS[field] ?? val
    if (typeof val === 'number' && threshold > 0) {
      needTotal += Math.min(val / threshold, 2.0)
      needCount++
    }
  }
  const needScore = needCount > 0
    ? Math.min(100, Math.round((needTotal / needCount) * 50))
    : 50

  // Overall match score
  const matchScore = isEligible
    ? Math.round((eligibilityScore * 0.35) + (needScore * 0.65) * bestSignal.weight)
    : Math.round(needScore * 0.25)

  // Key data points
  const keyDataPoints: GrantMatch['keyDataPoints'] = bestSignal.needFields
    .slice(0, 4)
    .map(field => {
      const val = county[field] as number
      const natl = THRESHOLDS[field]
      const isCount = ['primaryCareUnderserved','dentalUnderserved','mentalHealthUnderserved','fqhcCount','population'].includes(field as string)
      return {
        field,
        label: field.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()),
        value: isCount ? Math.round(val).toLocaleString() : `${typeof val === 'number' ? val.toFixed(1) : val}${isCount ? '' : '%'}`,
        context: natl && !isCount ? `vs ${natl}% national avg` : '',
      }
    })

  return {
    score: matchScore,
    eligibilityScore,
    needScore,
    isEligible,
    signal: bestSignal,
    matchedCriteria: checks.map(c => ({
      field: c.field,
      label: c.label,
      countyValue: c.value,
      threshold: c.threshold,
      met: c.met,
    })),
    keyDataPoints,
  }
}

// ─── Fetch from Grants.gov ────────────────────────────────────────────────────

async function searchGrantsGov(keyword: string): Promise<GrantsGovOpportunity[]> {
  try {
    const res = await fetch(GRANTS_GOV_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword,
        oppStatuses: 'posted|forecasted',
        rows: 25,
      }),
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const data = await res.json()
    const opps = data?.data?.oppHits ?? []
    return opps.map((o: Record<string, unknown>) => ({
      id:               String(o.id ?? ''),
      number:           String(o.number ?? ''),
      title:            String(o.title ?? ''),
      agencyName:       String(o.agency ?? ''),
      agencyCode:       String(o.agencyCode ?? ''),
      openDate:         String(o.openDate ?? ''),
      closeDate:        String(o.closeDate ?? ''),
      awardCeiling:     Number(o.awardCeiling ?? 0) || null,
      awardFloor:       Number(o.awardFloor ?? 0) || null,
      description:      String(o.synopsis ?? o.description ?? ''),
      eligibilities:    (o.eligibilities as string[]) ?? [],
      fundingCategories:(o.fundingCategories as string[]) ?? [],
      opportunityStatus:String(o.oppStatus ?? 'posted'),
      cfdaList:         (o.cfdaList as string[]) ?? [],
    }))
  } catch { return [] }
}

async function fetchAllGrantsGov(): Promise<GrantsGovOpportunity[]> {
  const results = await Promise.all(SEARCH_KEYWORDS.map(kw => searchGrantsGov(kw)))
  const all = results.flat()
  const seen = new Set<string>()
  return all.filter(o => {
    if (!o.id || seen.has(o.id)) return false
    seen.add(o.id)
    return true
  })
}

function daysUntilClose(closeDate: string | null): number | null {
  if (!closeDate) return null
  // Grants.gov returns MM/DD/YYYY
  const parts = closeDate.split('/')
  if (parts.length !== 3) return null
  const close = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`)
  const diff = Math.ceil((close.getTime() - Date.now()) / 86400000)
  return diff > 0 ? diff : null
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const fips = request.nextUrl.searchParams.get('fips')

  if (!fips || !/^28\d{3}$/.test(fips)) {
    return NextResponse.json(
      { success: false, matches: [], nearMisses: [], totalUnclaimed: 0, error: 'Invalid FIPS' },
      { status: 400 }
    )
  }

  try {
    const [profile, liveOpportunities] = await Promise.all([
      getCountyProfile(fips),
      fetchAllGrantsGov(),
    ])

    if (!profile) {
      return NextResponse.json(
        { success: false, matches: [], nearMisses: [], totalUnclaimed: 0, error: `No data for ${fips}` },
        { status: 404 }
      )
    }

    // Step 1: Run hardcoded match engine (guaranteed quality matches)
    const { matches: hardcodedMatches, nearMisses: hardcodedNearMisses } = matchGrants(profile, liveOpportunities)

    // Step 2: Score ALL live Grants.gov opportunities against county
    const liveMatches: GrantMatch[] = []
    const liveNearMisses: GrantMatch[] = []
    const hardcodedIds = new Set(hardcodedMatches.concat(hardcodedNearMisses).map(m => m.opportunityId))

    for (const opp of liveOpportunities) {
      // Skip if already handled by hardcoded engine
      if (hardcodedIds.has(opp.id)) continue

      const result = scoreLiveOpportunity(opp, profile)
      if (!result) continue
      if (result.score < 20) continue // too low — skip noise

      const match: GrantMatch = {
        opportunityId:     opp.id,
        opportunityNumber: opp.number,
        title:             opp.title,
        agency:            opp.agencyName,
        agencyCode:        opp.agencyCode,
        openDate:          opp.openDate || null,
        closeDate:         opp.closeDate || null,
        daysUntilClose:    daysUntilClose(opp.closeDate || null),
        awardCeiling:      opp.awardCeiling,
        awardFloor:        opp.awardFloor,
        description:       opp.description,
        matchScore:        result.score,
        eligibilityScore:  result.eligibilityScore,
        needScore:         result.needScore,
        isEligible:        result.isEligible,
        matchedCriteria:   result.matchedCriteria,
        missingCriteria:   result.isEligible ? [] : [{
          label: result.matchedCriteria.find(c => !c.met)?.label ?? 'Eligibility requirement',
          description: `${result.matchedCriteria.find(c => !c.met)?.label ?? 'A requirement'} not met`,
          howToClose: 'Contact the program officer for eligibility guidance',
          importance: 'required',
        }],
        isNearMiss:        !result.isEligible,
        keyDataPoints:     result.keyDataPoints,
      }

      if (result.isEligible) {
        liveMatches.push(match)
      } else {
        liveNearMisses.push(match)
      }
    }

    // Merge hardcoded (higher quality) + live results
    // Deduplicate ALL matches by opportunityId before returning
    const seenIds = new Set<string>()

    const allMatches = [
      ...hardcodedMatches,
      ...liveMatches.sort((a, b) => b.matchScore - a.matchScore),
    ].filter(m => {
      if (seenIds.has(m.opportunityId)) return false
      seenIds.add(m.opportunityId)
      return true
    })

    const seenNearIds = new Set<string>(seenIds) // exclude already matched

    const allNearMisses = [
      ...hardcodedNearMisses,
      ...liveNearMisses.sort((a, b) => b.needScore - a.needScore),
    ].filter(m => {
      if (seenNearIds.has(m.opportunityId)) return false
      seenNearIds.add(m.opportunityId)
      return true
    }).slice(0, 15)

    // Cap near misses at 15 to avoid overwhelming the UI
    const totalUnclaimed = calcTotalUnclaimed(allMatches)

    return NextResponse.json({
      success: true,
      matches: allMatches,
      nearMisses: allNearMisses.slice(0, 15),
      totalUnclaimed,
      liveCount: liveMatches.length,
      hardcodedCount: hardcodedMatches.length,
      totalScanned: liveOpportunities.length,
      error: null,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' }
    })

  } catch (err) {
    console.error(`Grants API error for ${fips}:`, err)
    return NextResponse.json(
      { success: false, matches: [], nearMisses: [], totalUnclaimed: 0, error: 'Failed to match grants' },
      { status: 500 }
    )
  }
}