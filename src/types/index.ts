
// ─── COUNTY HEALTH PROFILE ────────────────────────────────────────────────────
// Merged output from all 6 APIs for a single county

export interface CountyProfile {
    // Identity
    fips: string           // "28017" — primary key across all datasets
    countyName: string     // "Chickasaw" — from CDC PLACES (no "County" suffix)
    state: string          // "Mississippi"
    population: number     // totalpopulation parsed to int
  
    // Coordinates — from CDC PLACES geolocation
    // NOTE: CDC returns [lng, lat] — we store as lat/lng
    lat: number
    lng: number
  
    // ── CDC PLACES (all parsed from strings to floats) ──────────────────────────
    // Health burden indicators
    uninsuredRate: number         // access2_crudeprev   — % without health insurance
    diabetesRate: number          // diabetes_crudeprev  — % with diabetes
    hypertensionRate: number      // bphigh_crudeprev    — % with high blood pressure
    obesityRate: number           // obesity_crudeprev   — % obese
    smokingRate: number           // csmoking_crudeprev  — % current smokers
    mentalHealthRate: number      // mhlth_crudeprev     — % with frequent mental distress
    depressionRate: number        // depression_crudeprev
    copdRate: number              // copd_crudeprev
    strokeRate: number            // stroke_crudeprev
    heartDiseaseRate: number      // chd_crudeprev
    physicalInactivity: number    // lpa_crudeprev       — % physically inactive
    disabilityRate: number        // disability_crudeprev
  
    // Social determinants — also from CDC PLACES
    foodInsecurity: number        // foodinsecu_crudeprev   — % food insecure
    housingInsecurity: number     // housinsecu_crudeprev   — % housing insecure
    lackTransport: number         // lacktrpt_crudeprev     — % lacking transportation
    foodStampRate: number         // foodstamp_crudeprev    — % on SNAP
    utilityShutoff: number        // shututility_crudeprev  — % at risk of utility shutoff
  
    // ── SVI — CDC ATSDR Social Vulnerability Index 2022 ─────────────────────────
    // Scores: 0 = least vulnerable, 1 = most vulnerable
    // Source field names: RPL_THEMES, RPL_THEME1–4
    sviScore: number              // RPL_THEMES  — overall SVI (0–1)
    sviSocioeconomic: number      // RPL_THEME1  — poverty, unemployment, housing burden, no HS, uninsured
    sviHousehold: number          // RPL_THEME2  — age 65+, under 17, disability, single parent, limited english
    sviMinority: number           // RPL_THEME3  — minority status
    sviHousingTransport: number   // RPL_THEME4  — multi-unit, mobile, crowding, no vehicle, group quarters
  
    // SVI raw percentages (EP_ fields — already floats, no parsing needed)
    povertyRate: number           // EP_POV150   — % below 150% poverty line
    unemploymentRate: number      // EP_UNEMP    — % unemployed
    housingBurden: number         // EP_HBURD    — % spending >30% income on housing
    noHighSchool: number          // EP_NOHSDP   — % without HS diploma
    minorityRate: number          // EP_MINRTY   — % minority population
    noVehicle: number             // EP_NOVEH    — % households with no vehicle
    noInternet: number            // EP_NOINT    — % households with no internet (8.8–64%)
    sviDisability: number         // EP_DISABL
    elderlyRate: number           // EP_AGE65    — % age 65+ (for aging grants)
    singleParentRate: number      // EP_SNGPNT   — % single parent households
  
    // ── HRSA Primary Care HPSA ──────────────────────────────────────────────────
    // 79 of 82 counties designated — missing 3 default to 0
    primaryCareHPSA: boolean      // true if county has HPSA designation
    primaryCareScore: number      // HPSA_SCORE — int 13–23 (higher = worse shortage)
    primaryCareShortage: number   // HPSA_SHORTAGE — FTE providers needed
    primaryCareFTE: number        // HPSA_FTE — current providers
    primaryCareRatio: string | null // HPSA_FORMAL_RATIO — "7027:1" (14 nulls)
    primaryCareUnderserved: number  // HPSA_ESTIMATED_UNDERSERVED_POP
    primaryCareHpsaType: string   // HPSA_TYP_DESC — "Geographic HPSA" etc
  
    // ── HRSA Dental HPSA ────────────────────────────────────────────────────────
    // 79 of 82 counties designated — same 3 missing
    dentalHPSA: boolean
    dentalScore: number           // HPSA_SCORE — int 11–22
    dentalShortage: number        // HPSA_SHORTAGE — FTE dentists needed
    dentalFTE: number             // HPSA_FTE
    dentalRatio: string | null    // HPSA_FORMAL_RATIO — 21 nulls
    dentalUnderserved: number     // HPSA_ESTIMATED_UNDERSERVED_POP
  
    // ── HRSA Mental Health HPSA ─────────────────────────────────────────────────
    // 80 of 82 counties designated — 2 different counties missing
    mentalHealthHPSA: boolean
    mentalHealthScore: number     // HPSA_SCORE — int 13–20
    mentalHealthShortage: number  // HPSA_SHORTAGE — FTE providers needed (up to 23.17)
    mentalHealthFTE: number       // HPSA_FTE
    mentalHealthRatio: string | null // HPSA_FORMAL_RATIO — 23 nulls
    mentalHealthUnderserved: number  // HPSA_ESTIMATED_UNDERSERVED_POP (up to 250,392)
  
    // ── Rural Status ────────────────────────────────────────────────────────────
    // From HRSA HPSA data — "Rural" | "Non-Rural" | "Partially Rural"
    // 73 of 79 designated counties are Rural
    ruralStatus: 'Rural' | 'Non-Rural' | 'Partially Rural' | 'Unknown'
    isRural: boolean              // ruralStatus === 'Rural' || 'Partially Rural'
  
    // ── MUA — Medically Underserved Area ────────────────────────────────────────
    // 76 of 82 counties designated
    // IMPORTANT: MUA score is INVERTED — lower = more underserved (≤62 = designated)
    isMUA: boolean                // true if county in MUA list with 5-digit GEOID
    muaScore: number | null       // MUA_SCORE — float 19.7–62.0 (null if not designated)
  
    // ── FQHC — Federally Qualified Health Centers ───────────────────────────────
    // 316 sites aggregated to 74 counties — 8 counties have zero FQHCs
    fqhcCount: number             // total FQHC sites in county (0–33)
    hasFQHC: boolean              // fqhcCount > 0
    fqhcSiteNames: string[]       // SITE_NM array for display
    fqhcHasRural: boolean         // any site has RURAL_DESC === "Yes"
  }
  
  // ─── GRANT MATCH ─────────────────────────────────────────────────────────────
  // Output of matching engine for one grant against one county
  
  export interface GrantMatch {
    // Grant identity — from Grants.gov API
    opportunityId: string         // unique ID
    opportunityNumber: string     // e.g. "HRSA-25-038"
    title: string
    agency: string                // "HHS-HRSA", "HHS-CDC", "HHS-SAMHSA" etc
    agencyCode: string
    openDate: string | null
    closeDate: string | null
    daysUntilClose: number | null // computed from closeDate
    awardCeiling: number | null   // max award amount
    awardFloor: number | null     // min award amount
    description: string
  
    // Match scoring — computed by matchEngine
    matchScore: number            // 0–100 overall match percentage
    eligibilityScore: number      // 0–100 hard criteria met
    needScore: number             // 0–100 health burden alignment
    isEligible: boolean           // all hard criteria met
  
    // Reasoning — what triggered this match
    matchedCriteria: MatchedCriterion[]  // criteria the county meets
    missingCriteria: MissingCriterion[]  // criteria the county fails (near-miss)
    isNearMiss: boolean           // eligible === false but only 1–2 criteria away
  
    // For brief generation
    keyDataPoints: KeyDataPoint[] // top 5 county stats most relevant to this grant
  }
  
  // A single criterion that was checked
  export interface MatchedCriterion {
    field: string                 // e.g. "primaryCareScore"
    label: string                 // e.g. "HPSA Score"
    countyValue: string           // e.g. "17"
    threshold: string             // e.g. "≥14 required"
    met: boolean
  }
  
  // A criterion the county failed — used for near-miss display
  export interface MissingCriterion {
    label: string                 // e.g. "MUA Designation"
    description: string           // e.g. "County must be designated Medically Underserved"
    howToClose: string            // e.g. "Apply for MUA designation through HRSA"
    importance: 'required' | 'preferred'
  }
  
  // A specific data point to highlight in the brief
  export interface KeyDataPoint {
    label: string                 // e.g. "Diabetes Rate"
    value: string                 // e.g. "18.4%"
    context: string               // e.g. "vs 11.6% national average"
    field: keyof CountyProfile
  }
  
  // ─── GRANTS.GOV API ───────────────────────────────────────────────────────────
  // Raw response from Grants.gov search2 endpoint
  
  export interface GrantsGovOpportunity {
    id: string
    number: string
    title: string
    agencyName: string
    agencyCode: string
    openDate: string
    closeDate: string
    awardCeiling: number | null
    awardFloor: number | null
    description: string
    eligibilities: string[]
    fundingCategories: string[]
    opportunityStatus: string
    cfdaList?: string[]    // CFDA numbers e.g. ["93.224"]
  }
  
  // ─── API RESPONSE SHAPES ──────────────────────────────────────────────────────
  // What each Next.js API route returns
  
  export interface CountyAPIResponse {
    success: boolean
    profile: CountyProfile | null
    error?: string
  }
  
  export interface GrantsAPIResponse {
    success: boolean
    matches: GrantMatch[]
    nearMisses: GrantMatch[]
    totalUnclaimed: number        // sum of awardCeiling for all matched grants
    error?: string
  }
  
  export interface BriefAPIResponse {
    success: boolean
    brief: string                 // streamed markdown narrative
    error?: string
  }
  
  // ─── UI STATE ────────────────────────────────────────────────────────────────
  
  export interface FilterState {
    agency: 'all' | 'HRSA' | 'CDC' | 'SAMHSA' | 'USDA' | 'CMS'
    minAward: number              // 0 = no filter
    maxDaysUntilClose: number     // 999 = no filter
    minMatchScore: number         // 0 = no filter
    showNearMisses: boolean
  }
  
  // For the Mississippi equity map
  export interface CountyMapData {
    fips: string
    countyName: string
    lat: number
    lng: number
    matchCount: number            // number of matched grants
    totalFunding: number          // sum of awardCeilings
    sviScore: number
    primaryCareScore: number
  }
  
  // ─── MS COUNTIES REFERENCE ───────────────────────────────────────────────────
  // All 82 Mississippi counties with FIPS codes
  // Used for county selector autocomplete
  
  export interface MSCounty {
    fips: string
    name: string
  }
  
  export const MS_COUNTIES: MSCounty[] = [
    { fips: '28001', name: 'Adams' },
    { fips: '28003', name: 'Alcorn' },
    { fips: '28005', name: 'Amite' },
    { fips: '28007', name: 'Attala' },
    { fips: '28009', name: 'Benton' },
    { fips: '28011', name: 'Bolivar' },
    { fips: '28013', name: 'Calhoun' },
    { fips: '28015', name: 'Carroll' },
    { fips: '28017', name: 'Chickasaw' },
    { fips: '28019', name: 'Choctaw' },
    { fips: '28021', name: 'Claiborne' },
    { fips: '28023', name: 'Clarke' },
    { fips: '28025', name: 'Clay' },
    { fips: '28027', name: 'Coahoma' },
    { fips: '28029', name: 'Copiah' },
    { fips: '28031', name: 'Covington' },
    { fips: '28033', name: 'DeSoto' },
    { fips: '28035', name: 'Forrest' },
    { fips: '28037', name: 'Franklin' },
    { fips: '28039', name: 'George' },
    { fips: '28041', name: 'Greene' },
    { fips: '28043', name: 'Grenada' },
    { fips: '28045', name: 'Hancock' },
    { fips: '28047', name: 'Harrison' },
    { fips: '28049', name: 'Hinds' },
    { fips: '28051', name: 'Holmes' },
    { fips: '28053', name: 'Humphreys' },
    { fips: '28055', name: 'Issaquena' },
    { fips: '28057', name: 'Itawamba' },
    { fips: '28059', name: 'Jackson' },
    { fips: '28061', name: 'Jasper' },
    { fips: '28063', name: 'Jefferson' },
    { fips: '28065', name: 'Jefferson Davis' },
    { fips: '28067', name: 'Jones' },
    { fips: '28069', name: 'Kemper' },
    { fips: '28071', name: 'Lafayette' },
    { fips: '28073', name: 'Lamar' },
    { fips: '28075', name: 'Lauderdale' },
    { fips: '28077', name: 'Lawrence' },
    { fips: '28079', name: 'Leake' },
    { fips: '28081', name: 'Lee' },
    { fips: '28083', name: 'Leflore' },
    { fips: '28085', name: 'Lincoln' },
    { fips: '28087', name: 'Lowndes' },
    { fips: '28089', name: 'Madison' },
    { fips: '28091', name: 'Marion' },
    { fips: '28093', name: 'Marshall' },
    { fips: '28095', name: 'Monroe' },
    { fips: '28097', name: 'Montgomery' },
    { fips: '28099', name: 'Neshoba' },
    { fips: '28101', name: 'Newton' },
    { fips: '28103', name: 'Noxubee' },
    { fips: '28105', name: 'Oktibbeha' },
    { fips: '28107', name: 'Panola' },
    { fips: '28109', name: 'Pearl River' },
    { fips: '28111', name: 'Perry' },
    { fips: '28113', name: 'Pike' },
    { fips: '28115', name: 'Pontotoc' },
    { fips: '28117', name: 'Prentiss' },
    { fips: '28119', name: 'Quitman' },
    { fips: '28121', name: 'Rankin' },
    { fips: '28123', name: 'Scott' },
    { fips: '28125', name: 'Sharkey' },
    { fips: '28127', name: 'Simpson' },
    { fips: '28129', name: 'Smith' },
    { fips: '28131', name: 'Stone' },
    { fips: '28133', name: 'Sunflower' },
    { fips: '28135', name: 'Tallahatchie' },
    { fips: '28137', name: 'Tate' },
    { fips: '28139', name: 'Tippah' },
    { fips: '28141', name: 'Tishomingo' },
    { fips: '28143', name: 'Tunica' },
    { fips: '28145', name: 'Union' },
    { fips: '28147', name: 'Walthall' },
    { fips: '28149', name: 'Warren' },
    { fips: '28151', name: 'Washington' },
    { fips: '28153', name: 'Wayne' },
    { fips: '28155', name: 'Webster' },
    { fips: '28157', name: 'Wilkinson' },
    { fips: '28159', name: 'Winston' },
    { fips: '28161', name: 'Yalobusha' },
    { fips: '28163', name: 'Yazoo' },
  ]