// Fetches and merges all 6 APIs into a single CountyProfile
// All field names verified against real API responses

import { CountyProfile } from '@/types'

// ─── API ENDPOINTS ────────────────────────────────────────────────────────────

const CDC_URL = `https://data.cdc.gov/resource/i46a-9kgh.json?stateabbr=MS&$$app_token=qdrprOoPrcK8qG6biqVZ5zU6M&$limit=100`

const SVI_FIELDS = [
  'FIPS','RPL_THEMES','RPL_THEME1','RPL_THEME2','RPL_THEME3','RPL_THEME4',
  'EP_POV150','EP_UNEMP','EP_HBURD','EP_NOHSDP','EP_UNINSUR',
  'EP_MINRTY','EP_NOVEH','EP_NOINT','EP_DISABL','EP_AGE65','EP_SNGPNT'
].join(',')
const SVI_URL = `https://onemap.cdc.gov/onemapservices/rest/services/SVI/CDC_ATSDR_Social_Vulnerability_Index_2022_USA/FeatureServer/1/query?where=ST_ABBR='MS'&outFields=${SVI_FIELDS}&f=json&resultRecordCount=200`

const HPSA_FIELDS = 'STATE_COUNTY_FIPS_CD,HPSA_SCORE,HPSA_SHORTAGE,HPSA_FTE,HPSA_FORMAL_RATIO,HPSA_ESTIMATED_UNDERSERVED_POP,RURAL_STATUS_DESC,HPSA_TYP_DESC'
const HPSA_WHERE = `STATE_ABBR='MS' AND COMP_TYP_DESC='Single County' AND HPSA_STATUS_DESC='Designated'`
const PC_URL  = `https://gisportal.hrsa.gov/server/rest/services/Shortage/HealthProfessionalShortageAreas_FS/MapServer/11/query?where=${encodeURIComponent(HPSA_WHERE)}&outFields=${HPSA_FIELDS}&returnGeometry=false&f=json`
const DEN_URL = `https://gisportal.hrsa.gov/server/rest/services/Shortage/HealthProfessionalShortageAreas_FS/MapServer/3/query?where=${encodeURIComponent(HPSA_WHERE)}&outFields=${HPSA_FIELDS}&returnGeometry=false&f=json`
const MH_URL  = `https://gisportal.hrsa.gov/server/rest/services/Shortage/HealthProfessionalShortageAreas_FS/MapServer/7/query?where=${encodeURIComponent(HPSA_WHERE)}&outFields=${HPSA_FIELDS}&returnGeometry=false&f=json`

const MUA_URL  = `https://data.hrsa.gov/Muafind/find?state=MS&counties=&id=`
const FQHC_URL = `https://gisportal.hrsa.gov/server/rest/services/HealthCareFacilities/HealthCareFacilities/MapServer/18/query?where=CMN_STATE_ABBR='MS'&outFields=CMN_STATE_COUNTY_FIPS_CD,SITE_NM,RURAL_DESC&returnGeometry=false&f=json`

// ─── MODULE-LEVEL CACHE ───────────────────────────────────────────────────────

type CDCRow = Record<string, string | { type: string; coordinates: [number, number] }>
type HPSARow = Record<string, string | number | null>
type FQHCEntry = { count: number; names: string[]; hasRural: boolean }

let cdcCache:  Record<string, CDCRow>   | null = null
let sviCache:  Record<string, Record<string, number>> | null = null
let pcCache:   Record<string, HPSARow> | null = null
let denCache:  Record<string, HPSARow> | null = null
let mhCache:   Record<string, HPSARow> | null = null
let muaCache:  Record<string, number>  | null = null  // fips → MUA_SCORE
let fqhcCache: Record<string, FQHCEntry> | null = null

const CACHE_OPTS = { next: { revalidate: 86400 } } // 24h cache

// ─── FETCHERS ─────────────────────────────────────────────────────────────────

async function getCDC(): Promise<Record<string, CDCRow>> {
  if (cdcCache) return cdcCache
  try {
    const res = await fetch(CDC_URL, CACHE_OPTS)
    if (!res.ok) throw new Error(`CDC ${res.status}`)
    const rows: CDCRow[] = await res.json()
    cdcCache = Object.fromEntries(rows.map(r => [r.countyfips as string, r]))
    return cdcCache
  } catch (e) {
    console.error('CDC fetch failed:', e)
    return {}
  }
}

async function getSVI(): Promise<Record<string, Record<string, number>>> {
  if (sviCache) return sviCache
  try {
    const res = await fetch(SVI_URL, CACHE_OPTS)
    if (!res.ok) throw new Error(`SVI ${res.status}`)
    const data = await res.json()
    sviCache = {}
    for (const feat of data.features ?? []) {
      const a = feat.attributes
      sviCache[a.FIPS] = a
    }
    return sviCache
  } catch (e) {
    console.error('SVI fetch failed:', e)
    return {}
  }
}

async function getHPSA(url: string): Promise<Record<string, HPSARow>> {
  try {
    const res = await fetch(url, CACHE_OPTS)
    if (!res.ok) throw new Error(`HPSA ${res.status}`)
    const data = await res.json()
    const result: Record<string, HPSARow> = {}
    for (const feat of data.features ?? []) {
      const a = feat.attributes as HPSARow
      const fips = a.STATE_COUNTY_FIPS_CD as string
      // Keep highest score if somehow duplicated
      if (!result[fips] || (a.HPSA_SCORE as number) > (result[fips].HPSA_SCORE as number)) {
        result[fips] = a
      }
    }
    return result
  } catch (e) {
    console.error('HPSA fetch failed:', e)
    return {}
  }
}

async function getMUA(): Promise<Record<string, number>> {
  if (muaCache) return muaCache
  try {
    const res = await fetch(MUA_URL, CACHE_OPTS)
    if (!res.ok) throw new Error(`MUA ${res.status}`)
    const rows: Array<{ Component_GEOID: string; MUA_SCORE: number }> = await res.json()
    muaCache = {}
    for (const r of rows) {
      const g = r.Component_GEOID
      // Only standard 5-digit MS county FIPS — filter out tract-level records
      if (g && g.length === 5 && g.startsWith('28')) {
        // Keep lower score (more underserved) if duplicate
        if (!(g in muaCache) || r.MUA_SCORE < muaCache[g]) {
          muaCache[g] = r.MUA_SCORE
        }
      }
    }
    return muaCache
  } catch (e) {
    console.error('MUA fetch failed:', e)
    return {}
  }
}

async function getFQHC(): Promise<Record<string, FQHCEntry>> {
  if (fqhcCache) return fqhcCache
  try {
    const res = await fetch(FQHC_URL, CACHE_OPTS)
    if (!res.ok) throw new Error(`FQHC ${res.status}`)
    const data = await res.json()
    fqhcCache = {}
    for (const feat of data.features ?? []) {
      const a = feat.attributes
      const fips: string = a.CMN_STATE_COUNTY_FIPS_CD
      if (!fips) continue
      if (!fqhcCache[fips]) fqhcCache[fips] = { count: 0, names: [], hasRural: false }
      fqhcCache[fips].count++
      if (a.SITE_NM) fqhcCache[fips].names.push(a.SITE_NM as string)
      if (a.RURAL_DESC === 'Yes') fqhcCache[fips].hasRural = true
    }
    return fqhcCache
  } catch (e) {
    console.error('FQHC fetch failed:', e)
    return {}
  }
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

export async function getCountyProfile(fips: string): Promise<CountyProfile | null> {
  // All 6 APIs in parallel
  const [cdc, svi, pc, den, mh, mua, fqhc] = await Promise.all([
    getCDC(),
    getSVI(),
    getHPSA(PC_URL).then(r => { pcCache  = r; return r }),
    getHPSA(DEN_URL).then(r => { denCache = r; return r }),
    getHPSA(MH_URL).then(r => { mhCache  = r; return r }),
    getMUA(),
    getFQHC(),
  ])

  const c = cdc[fips]
  if (!c) return null

  const s   = svi[fips]  ?? {}
  const p   = pc[fips]
  const d   = den[fips]
  const m   = mh[fips]
  const mua_score = mua[fips]    // undefined = not designated
  const f   = fqhc[fips]

  // Coordinates: CDC returns [lng, lat] — we flip to lat/lng
  const geo = c.geolocation as { coordinates: [number, number] } | undefined
  const lng = geo?.coordinates?.[0] ?? -89.5
  const lat = geo?.coordinates?.[1] ?? 32.7

  // Rural status: use primary care HPSA → dental → mental health → Unknown
  const ruralRaw = (p?.RURAL_STATUS_DESC ?? d?.RURAL_STATUS_DESC ?? m?.RURAL_STATUS_DESC ?? 'Unknown') as string
  const ruralStatus = ruralRaw as CountyProfile['ruralStatus']

  return {
    // Identity
    fips,
    countyName:  c.countyname as string,
    state:       'Mississippi',
    population:  parseInt(c.totalpopulation as string, 10),
    lat,
    lng,

    // CDC PLACES — ALL are strings, must parseFloat
    uninsuredRate:      parseFloat(c.access2_crudeprev as string),
    diabetesRate:       parseFloat(c.diabetes_crudeprev as string),
    hypertensionRate:   parseFloat(c.bphigh_crudeprev as string),
    obesityRate:        parseFloat(c.obesity_crudeprev as string),
    smokingRate:        parseFloat(c.csmoking_crudeprev as string),
    mentalHealthRate:   parseFloat(c.mhlth_crudeprev as string),
    depressionRate:     parseFloat(c.depression_crudeprev as string),
    copdRate:           parseFloat(c.copd_crudeprev as string),
    strokeRate:         parseFloat(c.stroke_crudeprev as string),
    heartDiseaseRate:   parseFloat(c.chd_crudeprev as string),
    physicalInactivity: parseFloat(c.lpa_crudeprev as string),
    disabilityRate:     parseFloat(c.disability_crudeprev as string),
    foodInsecurity:     parseFloat(c.foodinsecu_crudeprev as string),
    housingInsecurity:  parseFloat(c.housinsecu_crudeprev as string),
    lackTransport:      parseFloat(c.lacktrpt_crudeprev as string),
    foodStampRate:      parseFloat(c.foodstamp_crudeprev as string),
    utilityShutoff:     parseFloat(c.shututility_crudeprev as string),

    // SVI — already floats from API
    sviScore:            (s.RPL_THEMES  ?? 0.5) as number,
    sviSocioeconomic:    (s.RPL_THEME1  ?? 0.5) as number,
    sviHousehold:        (s.RPL_THEME2  ?? 0.5) as number,
    sviMinority:         (s.RPL_THEME3  ?? 0.5) as number,
    sviHousingTransport: (s.RPL_THEME4  ?? 0.5) as number,
    povertyRate:         (s.EP_POV150   ?? 0)   as number,
    unemploymentRate:    (s.EP_UNEMP    ?? 0)   as number,
    housingBurden:       (s.EP_HBURD    ?? 0)   as number,
    noHighSchool:        (s.EP_NOHSDP   ?? 0)   as number,
    minorityRate:        (s.EP_MINRTY   ?? 0)   as number,
    noVehicle:           (s.EP_NOVEH    ?? 0)   as number,
    noInternet:          (s.EP_NOINT    ?? 0)   as number,
    sviDisability:       (s.EP_DISABL   ?? 0)   as number,
    elderlyRate:         (s.EP_AGE65    ?? 0)   as number,
    singleParentRate:    (s.EP_SNGPNT   ?? 0)   as number,

    // HRSA Primary Care — 79/82 counties have this
    primaryCareHPSA:        !!p,
    primaryCareScore:       (p?.HPSA_SCORE                     ?? 0) as number,
    primaryCareShortage:    (p?.HPSA_SHORTAGE                  ?? 0) as number,
    primaryCareFTE:         (p?.HPSA_FTE                       ?? 0) as number,
    primaryCareRatio:       (p?.HPSA_FORMAL_RATIO              ?? null) as string | null,
    primaryCareUnderserved: (p?.HPSA_ESTIMATED_UNDERSERVED_POP ?? 0) as number,
    primaryCareHpsaType:    (p?.HPSA_TYP_DESC                  ?? 'Not Designated') as string,

    // HRSA Dental — 79/82 counties
    dentalHPSA:        !!d,
    dentalScore:       (d?.HPSA_SCORE                     ?? 0) as number,
    dentalShortage:    (d?.HPSA_SHORTAGE                  ?? 0) as number,
    dentalFTE:         (d?.HPSA_FTE                       ?? 0) as number,
    dentalRatio:       (d?.HPSA_FORMAL_RATIO              ?? null) as string | null,
    dentalUnderserved: (d?.HPSA_ESTIMATED_UNDERSERVED_POP ?? 0) as number,

    // HRSA Mental Health — 80/82 counties (different 2 missing vs above)
    mentalHealthHPSA:        !!m,
    mentalHealthScore:       (m?.HPSA_SCORE                     ?? 0) as number,
    mentalHealthShortage:    (m?.HPSA_SHORTAGE                  ?? 0) as number,
    mentalHealthFTE:         (m?.HPSA_FTE                       ?? 0) as number,
    mentalHealthRatio:       (m?.HPSA_FORMAL_RATIO              ?? null) as string | null,
    mentalHealthUnderserved: (m?.HPSA_ESTIMATED_UNDERSERVED_POP ?? 0) as number,

    // Rural status
    ruralStatus,
    isRural: ruralStatus === 'Rural' || ruralStatus === 'Partially Rural',

    // MUA — 76/82 counties designated
    // Score is INVERTED: lower = more underserved (≤62 = designated)
    isMUA:    mua_score !== undefined,
    muaScore: mua_score ?? null,

    // FQHC — 316 sites aggregated across 74 counties (8 counties have zero)
    fqhcCount:     f?.count     ?? 0,
    hasFQHC:       !!f && f.count > 0,
    fqhcSiteNames: f?.names     ?? [],
    fqhcHasRural:  f?.hasRural  ?? false,
  }
}

// ─── GET ALL 82 COUNTIES ─────────────────────────────────────────────────────
// Used by the map page

export async function getAllCountyProfiles(): Promise<CountyProfile[]> {
  const { MS_COUNTIES } = await import('@/types')
  const results = await Promise.all(
    MS_COUNTIES.map(c => getCountyProfile(c.fips))
  )
  return results.filter((p): p is CountyProfile => p !== null)
}