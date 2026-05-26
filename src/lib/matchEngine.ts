// Scores each county against each grant opportunity
// Returns ranked GrantMatch[] with full reasoning

import { CountyProfile, GrantMatch, MatchedCriterion, MissingCriterion, KeyDataPoint, GrantsGovOpportunity } from '@/types'

// ─── NATIONAL BENCHMARKS ─────────────────────────────────────────────────────
// Used to show "X% vs Y% national average" in key data points

const NATIONAL_AVG = {
  diabetesRate:     11.6,
  hypertensionRate: 32.5,
  obesityRate:      31.9,
  uninsuredRate:    10.2,
  smokingRate:      14.0,
  mentalHealthRate: 14.4,
  depressionRate:   18.4,
  physicalInactivity: 25.3,
  povertyRate:      12.5,
  noInternet:       18.0,
  foodInsecurity:   10.5,
}

// ─── GRANT DEFINITIONS ───────────────────────────────────────────────────────
// Hard-coded grant programs with real eligibility rules incase of server issues or API changes. Also allows us to show "near miss" grants that are not currently open but could be in the future with some improvements.
// These run FIRST before live Grants.gov results

export interface GrantDefinition {
  id: string
  title: string
  agency: string
  agencyCode: string
  program: string
  description: string
  typicalAwardMin: number
  typicalAwardMax: number
  durationYears: number
  eligibilityRules: EligibilityRule[]
  needIndicators: NeedIndicator[]
  searchKeywords: string[]  // sent to Grants.gov API
}

interface EligibilityRule {
  field: keyof CountyProfile
  operator: 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'truthy'
  value?: number | boolean | string
  label: string
  description: string
  required: boolean  // false = preferred/bonus
}

interface NeedIndicator {
  field: keyof CountyProfile
  weight: number      // 0–1, how much this contributes to need score
  threshold: number   // value above which county is "high need"
  label: string
}

// ─── THE GRANT DATABASE ───────────────────────────────────────────────────────

export const GRANT_DEFINITIONS: GrantDefinition[] = [
  // ── HRSA Rural Health Care Services Outreach ─────────────────────────────
  {
    id: 'hrsa-rural-outreach',
    title: 'Rural Health Care Services Outreach Program',
    agency: 'Health Resources & Services Administration',
    agencyCode: 'HRSA',
    program: 'Federal Office of Rural Health Policy',
    description: 'Funds rural communities to expand access to health care services for underserved populations. Supports new or expanded preventive care, primary care, and enabling services.',
    typicalAwardMin: 150000,
    typicalAwardMax: 750000,
    durationYears: 3,
    eligibilityRules: [
      { field: 'isRural',          operator: 'truthy', label: 'Rural Designation',       description: 'County must be HRSA-designated rural area', required: true },
      { field: 'primaryCareHPSA',  operator: 'truthy', label: 'Primary Care HPSA',       description: 'County should have primary care shortage designation', required: false },
      { field: 'uninsuredRate',    operator: 'gte', value: 15, label: 'Uninsured Rate ≥15%',  description: 'High uninsured population documents need', required: false },
    ],
    needIndicators: [
      { field: 'primaryCareScore',  weight: 0.30, threshold: 14, label: 'HPSA Score' },
      { field: 'uninsuredRate',     weight: 0.25, threshold: 15, label: 'Uninsured Rate' },
      { field: 'povertyRate',       weight: 0.25, threshold: 20, label: 'Poverty Rate' },
      { field: 'sviScore',          weight: 0.20, threshold: 0.75, label: 'SVI Score' },
    ],
    searchKeywords: ['rural health outreach', 'rural health care services'],
  },

  // ── HRSA New Access Point (FQHC Expansion) ───────────────────────────────
  {
    id: 'hrsa-new-access-point',
    title: 'Health Center Program: New Access Point',
    agency: 'Health Resources & Services Administration',
    agencyCode: 'HRSA',
    program: 'Bureau of Primary Health Care',
    description: 'Funds new Federally Qualified Health Centers in communities without existing FQHC services. Highest priority given to Medically Underserved Areas without current health center coverage.',
    typicalAwardMin: 650000,
    typicalAwardMax: 1000000,
    durationYears: 3,
    eligibilityRules: [
      { field: 'isMUA',           operator: 'truthy', label: 'MUA Designation',         description: 'County must be Medically Underserved Area', required: true },
      { field: 'hasFQHC',         operator: 'eq', value: false, label: 'No Existing FQHC', description: 'New Access Point grants target areas without FQHCs', required: false },
      { field: 'primaryCareHPSA', operator: 'truthy', label: 'Primary Care HPSA',       description: 'HPSA designation strengthens application', required: false },
    ],
    needIndicators: [
      { field: 'primaryCareScore',    weight: 0.35, threshold: 14, label: 'HPSA Score' },
      { field: 'primaryCareUnderserved', weight: 0.25, threshold: 5000, label: 'Underserved Population' },
      { field: 'povertyRate',         weight: 0.20, threshold: 20, label: 'Poverty Rate' },
      { field: 'uninsuredRate',       weight: 0.20, threshold: 15, label: 'Uninsured Rate' },
    ],
    searchKeywords: ['health center new access point', 'FQHC expansion', 'federally qualified health center'],
  },

  // ── HRSA Health Center Operations (Existing FQHCs) ───────────────────────
  {
    id: 'hrsa-health-center-ops',
    title: 'Health Center Program: Operational Funding',
    agency: 'Health Resources & Services Administration',
    agencyCode: 'HRSA',
    program: 'Bureau of Primary Health Care',
    description: 'Supports continued operations and expansion of existing Federally Qualified Health Centers serving underserved populations.',
    typicalAwardMin: 500000,
    typicalAwardMax: 5000000,
    durationYears: 1,
    eligibilityRules: [
      { field: 'hasFQHC',  operator: 'truthy', label: 'Existing FQHC',   description: 'County must have an existing FQHC site', required: true },
      { field: 'isMUA',    operator: 'truthy', label: 'MUA Designation', description: 'Medically Underserved Area status required', required: true },
    ],
    needIndicators: [
      { field: 'fqhcCount',      weight: 0.20, threshold: 1,    label: 'FQHC Sites' },
      { field: 'povertyRate',    weight: 0.30, threshold: 20,   label: 'Poverty Rate' },
      { field: 'uninsuredRate',  weight: 0.30, threshold: 15,   label: 'Uninsured Rate' },
      { field: 'sviScore',       weight: 0.20, threshold: 0.75, label: 'SVI Score' },
    ],
    searchKeywords: ['health center operations', 'community health center funding'],
  },

  // ── CDC Chronic Disease Prevention ───────────────────────────────────────
  {
    id: 'cdc-chronic-disease',
    title: 'Chronic Disease Prevention & Health Promotion',
    agency: 'Centers for Disease Control and Prevention',
    agencyCode: 'CDC',
    program: 'National Center for Chronic Disease Prevention',
    description: 'Funds state and local health departments to implement evidence-based interventions for chronic disease prevention including diabetes, heart disease, obesity, and tobacco use.',
    typicalAwardMin: 200000,
    typicalAwardMax: 1500000,
    durationYears: 5,
    eligibilityRules: [
      { field: 'diabetesRate',    operator: 'gte', value: 14.5, label: 'Diabetes Rate ≥14.5%',    description: 'Elevated diabetes burden documents need', required: false },
      { field: 'obesityRate',     operator: 'gte', value: 35,   label: 'Obesity Rate ≥35%',       description: 'High obesity rate demonstrates chronic disease burden', required: false },
      { field: 'hypertensionRate',operator: 'gte', value: 40,   label: 'Hypertension Rate ≥40%',  description: 'High hypertension rate strengthens application', required: false },
    ],
    needIndicators: [
      { field: 'diabetesRate',      weight: 0.25, threshold: 14.5, label: 'Diabetes Rate' },
      { field: 'obesityRate',       weight: 0.25, threshold: 35,   label: 'Obesity Rate' },
      { field: 'hypertensionRate',  weight: 0.20, threshold: 40,   label: 'Hypertension Rate' },
      { field: 'physicalInactivity',weight: 0.15, threshold: 30,   label: 'Physical Inactivity' },
      { field: 'smokingRate',       weight: 0.15, threshold: 18,   label: 'Smoking Rate' },
    ],
    searchKeywords: ['chronic disease prevention', 'diabetes prevention', 'obesity prevention'],
  },

  // ── SAMHSA Mental Health Community Services ───────────────────────────────
  {
    id: 'samhsa-mental-health',
    title: 'Community Mental Health Services Block Grant',
    agency: 'Substance Abuse and Mental Health Services Administration',
    agencyCode: 'SAMHSA',
    program: 'Center for Mental Health Services',
    description: 'Funds community-based mental health services for adults with serious mental illness and children with serious emotional disturbances, prioritizing underserved rural communities.',
    typicalAwardMin: 100000,
    typicalAwardMax: 800000,
    durationYears: 2,
    eligibilityRules: [
      { field: 'mentalHealthHPSA',  operator: 'truthy', label: 'Mental Health HPSA',      description: 'Mental Health shortage designation required', required: true },
      { field: 'mentalHealthRate',  operator: 'gte', value: 15, label: 'Mental Distress ≥15%', description: 'High mental health burden documents need', required: false },
    ],
    needIndicators: [
      { field: 'mentalHealthScore',    weight: 0.35, threshold: 14, label: 'MH HPSA Score' },
      { field: 'mentalHealthRate',     weight: 0.25, threshold: 15, label: 'Mental Distress Rate' },
      { field: 'depressionRate',       weight: 0.20, threshold: 18, label: 'Depression Rate' },
      { field: 'mentalHealthUnderserved', weight: 0.20, threshold: 10000, label: 'Underserved Population' },
    ],
    searchKeywords: ['mental health rural', 'behavioral health community', 'mental health services'],
  },

  // ── SAMHSA Substance Use ──────────────────────────────────────────────────
  {
    id: 'samhsa-substance-use',
    title: 'Substance Use Prevention & Treatment Block Grant',
    agency: 'Substance Abuse and Mental Health Services Administration',
    agencyCode: 'SAMHSA',
    program: 'Center for Substance Abuse Treatment',
    description: 'Supports prevention, treatment, and recovery services for substance use disorders in underserved communities with limited access to behavioral health services.',
    typicalAwardMin: 100000,
    typicalAwardMax: 600000,
    durationYears: 2,
    eligibilityRules: [
      { field: 'mentalHealthHPSA', operator: 'truthy', label: 'Behavioral Health HPSA', description: 'Behavioral health shortage designation required', required: true },
      { field: 'isRural',          operator: 'truthy', label: 'Rural Area',             description: 'Rural communities are priority', required: false },
    ],
    needIndicators: [
      { field: 'mentalHealthScore',  weight: 0.30, threshold: 14,   label: 'MH HPSA Score' },
      { field: 'povertyRate',        weight: 0.25, threshold: 20,   label: 'Poverty Rate' },
      { field: 'sviScore',           weight: 0.25, threshold: 0.75, label: 'SVI Score' },
      { field: 'unemploymentRate',   weight: 0.20, threshold: 6,    label: 'Unemployment Rate' },
    ],
    searchKeywords: ['substance use disorder rural', 'opioid treatment', 'substance abuse prevention'],
  },

  // ── HRSA Rural Health Workforce ───────────────────────────────────────────
  {
    id: 'hrsa-workforce',
    title: 'Rural Health Workforce Development',
    agency: 'Health Resources & Services Administration',
    agencyCode: 'HRSA',
    program: 'National Health Service Corps / Rural Health',
    description: 'Supports recruitment and retention of health professionals in rural and underserved areas through loan repayment, scholarships, and training programs.',
    typicalAwardMin: 50000,
    typicalAwardMax: 500000,
    durationYears: 3,
    eligibilityRules: [
      { field: 'isRural',          operator: 'truthy', label: 'Rural Designation',  description: 'Must be HRSA-designated rural area', required: true },
      { field: 'primaryCareHPSA',  operator: 'truthy', label: 'Primary Care HPSA', description: 'HPSA designation qualifies for NHSC placements', required: true },
    ],
    needIndicators: [
      { field: 'primaryCareScore',   weight: 0.40, threshold: 14, label: 'HPSA Score' },
      { field: 'primaryCareShortage',weight: 0.30, threshold: 2,  label: 'FTE Shortage' },
      { field: 'primaryCareUnderserved', weight: 0.30, threshold: 5000, label: 'Underserved Pop' },
    ],
    searchKeywords: ['rural health workforce', 'health professional shortage', 'NHSC loan repayment'],
  },

  // ── HRSA Oral Health / Dental ──────────────────────────────────────────────
  {
    id: 'hrsa-oral-health',
    title: 'Oral Health Workforce Activities',
    agency: 'Health Resources & Services Administration',
    agencyCode: 'HRSA',
    program: 'Bureau of Health Workforce',
    description: 'Expands access to oral health services in dental HPSAs through workforce development, training, and integration of dental services into primary care settings.',
    typicalAwardMin: 100000,
    typicalAwardMax: 600000,
    durationYears: 3,
    eligibilityRules: [
      { field: 'dentalHPSA',   operator: 'truthy', label: 'Dental HPSA',     description: 'Dental shortage designation required', required: true },
      { field: 'isRural',      operator: 'truthy', label: 'Rural Area',       description: 'Rural dental shortages are priority', required: false },
    ],
    needIndicators: [
      { field: 'dentalScore',      weight: 0.40, threshold: 14, label: 'Dental HPSA Score' },
      { field: 'dentalShortage',   weight: 0.30, threshold: 1,  label: 'Dental FTE Shortage' },
      { field: 'dentalUnderserved',weight: 0.30, threshold: 5000, label: 'Underserved Pop' },
    ],
    searchKeywords: ['oral health dental shortage', 'dental workforce rural', 'oral health access'],
  },

  // ── USDA Rural Health & Safety ────────────────────────────────────────────
  {
    id: 'usda-rural-development',
    title: 'USDA Rural Health and Safety Education',
    agency: 'U.S. Department of Agriculture',
    agencyCode: 'USDA',
    program: 'Rural Development / NIFA',
    description: 'Funds programs that improve health and safety for rural populations, including telehealth, health education, and access to services in agricultural communities.',
    typicalAwardMin: 50000,
    typicalAwardMax: 400000,
    durationYears: 3,
    eligibilityRules: [
      { field: 'isRural',      operator: 'truthy', label: 'Rural Area',       description: 'USDA rural health grants require rural designation', required: true },
      { field: 'noInternet',   operator: 'gte', value: 20, label: 'No Internet ≥20%', description: 'High no-internet rate supports telehealth need', required: false },
    ],
    needIndicators: [
      { field: 'noInternet',      weight: 0.30, threshold: 20,   label: 'No Internet Rate' },
      { field: 'lackTransport',   weight: 0.30, threshold: 10,   label: 'Lack Transport' },
      { field: 'povertyRate',     weight: 0.20, threshold: 20,   label: 'Poverty Rate' },
      { field: 'noVehicle',       weight: 0.20, threshold: 8,    label: 'No Vehicle Rate' },
    ],
    searchKeywords: ['USDA rural health', 'rural development health', 'telehealth rural'],
  },

  // ── CDC Social Determinants of Health ─────────────────────────────────────
  {
    id: 'cdc-sdoh',
    title: 'Social Determinants of Health Program',
    agency: 'Centers for Disease Control and Prevention',
    agencyCode: 'CDC',
    program: 'Office of Minority Health & Health Equity',
    description: 'Addresses upstream social and economic factors driving health disparities through community-based interventions targeting food insecurity, housing instability, and transportation barriers.',
    typicalAwardMin: 150000,
    typicalAwardMax: 1000000,
    durationYears: 3,
    eligibilityRules: [
      { field: 'sviScore',        operator: 'gte', value: 0.75, label: 'SVI Score ≥0.75',       description: 'High social vulnerability required', required: true },
      { field: 'foodInsecurity',  operator: 'gte', value: 20,   label: 'Food Insecurity ≥20%',  description: 'Food insecurity documents SDOH burden', required: false },
    ],
    needIndicators: [
      { field: 'sviScore',          weight: 0.20, threshold: 0.75, label: 'SVI Score' },
      { field: 'foodInsecurity',    weight: 0.20, threshold: 20,   label: 'Food Insecurity' },
      { field: 'housingInsecurity', weight: 0.20, threshold: 15,   label: 'Housing Insecurity' },
      { field: 'noInternet',        weight: 0.20, threshold: 20,   label: 'No Internet' },
      { field: 'lackTransport',     weight: 0.20, threshold: 10,   label: 'Lack Transport' },
    ],
    searchKeywords: ['social determinants health', 'health equity', 'health disparities'],
  },

  // ── HHS Maternal & Child Health ───────────────────────────────────────────
  {
    id: 'hrsa-maternal-child',
    title: 'Maternal & Child Health Block Grant',
    agency: 'Health Resources & Services Administration',
    agencyCode: 'HRSA',
    program: 'Maternal and Child Health Bureau',
    description: 'Improves health of mothers, infants, and children in low-income families with limited access to health services, with priority for rural and high-poverty communities.',
    typicalAwardMin: 100000,
    typicalAwardMax: 800000,
    durationYears: 3,
    eligibilityRules: [
      { field: 'povertyRate',      operator: 'gte', value: 20, label: 'Poverty Rate ≥20%',     description: 'High poverty rate required for MCH priority', required: true },
      { field: 'singleParentRate', operator: 'gte', value: 8,  label: 'Single Parent ≥8%',     description: 'Single parent households document MCH need', required: false },
      { field: 'uninsuredRate',    operator: 'gte', value: 12, label: 'Uninsured Rate ≥12%',   description: 'Uninsured children and mothers document need', required: false },
    ],
    needIndicators: [
      { field: 'povertyRate',      weight: 0.30, threshold: 20, label: 'Poverty Rate' },
      { field: 'singleParentRate', weight: 0.25, threshold: 8,  label: 'Single Parent Rate' },
      { field: 'uninsuredRate',    weight: 0.25, threshold: 12, label: 'Uninsured Rate' },
      { field: 'foodInsecurity',   weight: 0.20, threshold: 20, label: 'Food Insecurity' },
    ],
    searchKeywords: ['maternal child health rural', 'MCH block grant', 'maternal health underserved'],
  },
]

// ─── SCORING ENGINE ───────────────────────────────────────────────────────────

function checkRule(county: CountyProfile, rule: EligibilityRule): boolean {
  const val = county[rule.field]
  switch (rule.operator) {
    case 'truthy': return !!val
    case 'eq':     return val === rule.value
    case 'gt':     return (val as number) >  (rule.value as number)
    case 'gte':    return (val as number) >= (rule.value as number)
    case 'lt':     return (val as number) <  (rule.value as number)
    case 'lte':    return (val as number) <= (rule.value as number)
    default:       return false
  }
}

function scoreNeed(county: CountyProfile, indicators: NeedIndicator[]): number {
  let score = 0
  let totalWeight = 0
  for (const ind of indicators) {
    const val = county[ind.field] as number
    const normalized = Math.min(val / ind.threshold, 1.5) / 1.5  // cap at 150% of threshold
    score += normalized * ind.weight
    totalWeight += ind.weight
  }
  return totalWeight > 0 ? Math.round((score / totalWeight) * 100) : 0
}

function buildKeyDataPoints(county: CountyProfile, grant: GrantDefinition): KeyDataPoint[] {
  const points: KeyDataPoint[] = []

  const addPoint = (field: keyof CountyProfile, label: string, suffix = '%') => {
    const val = county[field] as number
    const nat = NATIONAL_AVG[field as keyof typeof NATIONAL_AVG]
    points.push({
      field,
      label,
      value: `${val.toFixed(1)}${suffix}`,
      context: nat ? `vs ${nat}% national avg` : '',
    })
  }

  // Add the most relevant data points for this grant
  const countFields = ['primaryCareUnderserved','dentalUnderserved','mentalHealthUnderserved','fqhcCount','population']
  for (const ind of grant.needIndicators.slice(0, 5)) {
    const val = county[ind.field]
    if (typeof val === 'number') {
      const suffix = countFields.includes(ind.field as string) ? '' : '%'
      addPoint(ind.field as keyof CountyProfile, ind.label, suffix)
    }
  }

  return points.slice(0, 5)
}

function daysUntilClose(closeDate: string | null): number | null {
  if (!closeDate) return null
  const close = new Date(closeDate)
  const now = new Date()
  const diff = Math.ceil((close.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return diff > 0 ? diff : null
}

// ─── MAIN EXPORT: matchGrants ──────────────────────────────────────────────

export function matchGrants(
  county: CountyProfile,
  liveOpportunities: GrantsGovOpportunity[] = []
): { matches: GrantMatch[]; nearMisses: GrantMatch[] } {

  const matches: GrantMatch[] = []
  const nearMisses: GrantMatch[] = []

  for (const grant of GRANT_DEFINITIONS) {
    const requiredRules   = grant.eligibilityRules.filter(r => r.required)
    const preferredRules  = grant.eligibilityRules.filter(r => !r.required)

    const requiredResults  = requiredRules.map(r => ({ rule: r, met: checkRule(county, r) }))
    const preferredResults = preferredRules.map(r => ({ rule: r, met: checkRule(county, r) }))

    const requiredMet  = requiredResults.every(r => r.met)
    const requiredFailed = requiredResults.filter(r => !r.met)
    const preferredMet = preferredResults.filter(r => r.met).length

    // Near miss: only 1 required rule fails
    const isNearMiss = !requiredMet && requiredFailed.length === 1

    if (!requiredMet && !isNearMiss) continue  // skip — too far from eligible

    const needScore = scoreNeed(county, grant.needIndicators)
    const eligibilityScore = requiredMet
      ? Math.round(50 + (preferredMet / Math.max(preferredRules.length, 1)) * 50)
      : 30  // near miss gets partial eligibility score

    const matchScore = requiredMet
      ? Math.round((eligibilityScore * 0.4) + (needScore * 0.6))
      : Math.round(needScore * 0.3)  // near miss: much lower match score

    // Build matched criteria list
    const matchedCriteria: MatchedCriterion[] = [
      ...requiredResults.map(r => ({
        field: r.rule.field as string,
        label: r.rule.label,
        countyValue: String(county[r.rule.field]),
        threshold: r.rule.value !== undefined ? String(r.rule.value) : 'Required',
        met: r.met,
      })),
      ...preferredResults.map(r => ({
        field: r.rule.field as string,
        label: r.rule.label,
        countyValue: String(county[r.rule.field]),
        threshold: r.rule.value !== undefined ? String(r.rule.value) : 'Preferred',
        met: r.met,
      })),
    ]

    // Build missing criteria for near misses
    const missingCriteria: MissingCriterion[] = requiredFailed.map(r => ({
      label: r.rule.label,
      description: r.rule.description,
      howToClose: getMissingAdvice(r.rule.field as string),
      importance: 'required' as const,
    }))

    // Find live Grants.gov opportunity match
    const liveMatch = liveOpportunities.find(opp =>
      grant.searchKeywords.some(kw =>
        opp.title.toLowerCase().includes(kw.toLowerCase()) ||
        opp.agencyCode?.toLowerCase().includes(grant.agencyCode.toLowerCase())
      )
    )

    const grantMatch: GrantMatch = {
      opportunityId:     liveMatch?.id     ?? grant.id,
      opportunityNumber: liveMatch?.number ?? `${grant.agencyCode}-PROGRAM`,
      title:             liveMatch?.title  ?? grant.title,
      agency:            grant.agency,
      agencyCode:        grant.agencyCode,
      openDate:          liveMatch?.openDate  ?? null,
      closeDate:         liveMatch?.closeDate ?? null,
      daysUntilClose:    daysUntilClose(liveMatch?.closeDate ?? null),
      awardCeiling:      liveMatch?.awardCeiling ?? grant.typicalAwardMax,
      awardFloor:        liveMatch?.awardFloor   ?? grant.typicalAwardMin,
      description:       liveMatch?.description  ?? grant.description,
      matchScore,
      eligibilityScore,
      needScore,
      isEligible:        requiredMet,
      matchedCriteria,
      missingCriteria,
      isNearMiss,
      keyDataPoints:     buildKeyDataPoints(county, grant),
    }

    if (requiredMet) {
      matches.push(grantMatch)
    } else {
      nearMisses.push(grantMatch)
    }
  }

  // Sort by matchScore descending
  matches.sort((a, b) => b.matchScore - a.matchScore)
  nearMisses.sort((a, b) => b.needScore - a.needScore)

  return { matches, nearMisses }
}

// ─── HELPER ───────────────────────────────────────────────────────────────────

function getMissingAdvice(field: string): string {
  const advice: Record<string, string> = {
    isRural:          'Apply for HRSA rural designation through the Rural Health Grants Eligibility Analyzer',
    primaryCareHPSA:  'Request HPSA designation review through HRSA HPSA designation process',
    mentalHealthHPSA: 'Apply for Mental Health HPSA designation through HRSA',
    dentalHPSA:       'Apply for Dental HPSA designation through HRSA',
    isMUA:            'Apply for Medically Underserved Area designation through HRSA',
    hasFQHC:          'Partner with an existing FQHC or apply as new health center applicant',
    sviScore:         'Document social vulnerability through SVI data in application narrative',
    povertyRate:      'Include census poverty data and local economic data in needs statement',
  }
  return advice[field] ?? 'Consult HRSA or CDC program officer for eligibility guidance'
}

// ─── TOTAL UNCLAIMED FUNDING ──────────────────────────────────────────────────

export function calcTotalUnclaimed(matches: GrantMatch[]): number {
  return matches.reduce((sum, m) => sum + (m.awardCeiling ?? 0), 0)
}