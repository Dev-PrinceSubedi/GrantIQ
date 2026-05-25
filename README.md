# GrantIQ  
##Federal Grant Intelligence Platform for Mississippi Counties

**Hackathon 2026 · Round 2 Submission**
**Author:** Subedi, Prince

---

## What This Is

GrantIQ is a web application that helps public health professionals, county health departments, and community health organizations in Mississippi discover and apply for federal grant funding they may be missing.

The problem: most rural counties have serious health needs (high poverty, poor access to care, elevated chronic disease rates) but lack the staff capacity to track dozens of federal grant programs, check eligibility requirements, and write applications. Grant money goes unclaimed not because counties do not qualify, but because no one has time to find it.

GrantIQ solves this by pulling together CDC health data, HRSA shortage designations, Social Vulnerability Index scores, and federal grant listings into a single dashboard, then automatically matching each county to the grants it actually qualifies for.

---

## How to Run It

### Requirements

- Node.js 18 or higher
- An OpenAI API key (for the AI Analysis feature only — the rest of the app works without it)

### Setup

**Step 1 — Install dependencies**

```
npm install
```

**Step 2 — Add your API key**

Create a file called `.env.local` in the root folder of the project and paste this inside:

```
OPENAI_API_KEY=paste_your_key_here
```

Replace `paste_your_key_here` with your actual OpenAI API key. You can get one at platform.openai.com

If you do not have an API key, you can still use the entire application. The only feature that will not work is the AI Analysis button in the sidebar. All grant matching, health data, maps, and charts work without it.

**Step 3 — Start the app**

```
npm run dev
```

Then open your browser and go to: http://localhost:3000

---

## What the App Does

### Landing Page — Interactive Mississippi Map

When you open the app, you see a full-screen map of Mississippi. Every county is colored by its Social Vulnerability Index score — bright red means highest need, green means lower need. Hover over any county to see its SVI score, HPSA designation, and key tags. Click any county to open the full intelligence dashboard for that county.

### County Intelligence Dashboard

The main page has a left sidebar and a tabbed main area. The sidebar shows the county name, FIPS code, estimated unclaimed federal funding, HPSA score, SVI score, poverty rate, and uninsured rate as live indicators.

Navigation links switch between three main sections:

**Grant Intelligence** — the default view with three tabs:

- Matched Grants — federal programs this county currently qualifies for, ranked by match score. Each card shows the agency, award ceiling, eligibility score, community need level, and a days-until-close deadline badge for approaching deadlines.
- Near Misses — grants where the county misses only one requirement. Shows exactly what the gap is and how to close it so the county can take action.
- Health Profile — a three-column card view of chronic disease rates vs national averages, behavioral and social indicators, and HRSA shortage designations.

**Geographic Analysis** — an interactive equity map showing all 82 Mississippi counties colored by SVI score so you can see which regions cluster together in high-need areas.

**Data Analysis** — the deep-dive analytics page with:
- County vs national average bar charts for 12 health metrics with a vertical marker showing the national average
- HRSA shortage designation blocks with HPSA scores, FTE shortage numbers, and underserved population counts
- Social Vulnerability Index breakdown across four themes: socioeconomic status, household composition, minority status, and housing and transportation
- FQHC site count and rural access indicators

**AI Analysis** — click the AI Analysis button in the sidebar to open six analysis modes powered by GPT-4o-mini:

- Needs Statement — writes a fundable needs narrative for a specific grant using real county data
- Report Generator — produces a county health status summary
- Grant Strategy — recommends which grants to pursue first and why
- Gap Analysis — identifies what the county is missing to qualify for more grants
- Narrative Writer — generates application narrative text
- Competitive Analysis — compares this county's positioning against state averages

All AI responses stream in real time so you can read them as they generate.

---

## Technical Architecture

**Framework:** Next.js 16 with App Router  
**Language:** TypeScript  
**Styling:** Inline React styles with CSS custom properties for light and dark theme switching  
**Map:** Leaflet.js with GeoJSON county boundaries loaded from a public dataset  
**AI:** OpenAI gpt-4o-mini via streaming Server-Sent Events  
**Data:** Live API calls to CDC PLACES, CDC SVI, HRSA HPSA, and HRSA FQHC — responses cached server-side for 24 hours

### Key Files

| File | What it does |
|------|-------------|
| src/lib/countyData.ts | Loads and serves the health profile for any of the 82 Mississippi counties |
| src/lib/matchEngine.ts | Scores each county against every grant opportunity and returns ranked matches with matched and missing criteria |
| src/app/api/grants/route.ts | API endpoint that runs the match engine for a given FIPS code |
| src/app/api/county/[fips]/route.ts | API endpoint that returns the full county health profile |
| src/app/api/brief/route.ts | Streaming API endpoint that sends prompts to OpenAI and streams the response back |
| src/app/county/[fips]/page.tsx | The main county dashboard page |
| src/components/DataAnalysis.tsx | The analytics section with bar charts and HRSA blocks |
| src/components/BriefGenerator.tsx | The AI analysis panel |
| src/components/EquityMap.tsx | The geographic equity map |
| src/lib/useBreakpoint.ts | Hook for responsive layout that detects mobile, tablet, and desktop screen sizes |

### How Grant Matching Works

Grant matching runs as two layers merged together:

**Layer 1 — Hardcoded curated grants (matchEngine.ts)**
A set of carefully vetted federal programs with precisely defined eligibility rules — for example, whether the county has an HPSA designation, whether its poverty rate exceeds a threshold, whether it has a Federally Qualified Health Center, and whether it is classified as rural. Each criterion is evaluated and marked as met or not met. The engine produces a 0 to 100 match score weighted by importance. Grants where exactly one criterion is not met become near misses with a plain-language explanation of the gap and specific steps to close it.

**Layer 2 — Live Grants.gov API (grants/route.ts)**
On every page load, the server runs 12 keyword searches against the live Grants.gov API in parallel — terms like "rural health", "primary care shortage area", "mental health rural underserved", and "medically underserved". Each result is scored against the county using CFDA number rules (known eligibility requirements for specific program numbers) and title keyword signals. Results from both layers are merged, deduplicated by opportunity ID, and returned together.

If the Grants.gov API is unavailable, the hardcoded matches still show — the system degrades gracefully. Live results are cached for one hour so repeated loads do not re-query the API.

---

## Features

| Feature | Status |
|---------|--------|
| Interactive county map with SVI coloring | Working |
| Grant matching with ranked scores | Working |
| Near-miss identification with gap explanation | Working |
| Health profile metrics vs national averages | Working |
| HRSA shortage designation display | Working |
| Social Vulnerability Index breakdown | Working |
| Horizontal bar charts with national average markers | Working |
| Days-until-close deadline badges on grant cards | Working |
| County search and selector dropdown | Working |
| Dark mode and light mode toggle | Working |
| Responsive design for mobile, tablet, and desktop | Working |
| AI needs statement generation | Requires OpenAI API key |
| AI grant narrative writing | Requires OpenAI API key |
| AI gap analysis | Requires OpenAI API key |
| AI strategy recommendations | Requires OpenAI API key |
| Streaming AI responses | Requires OpenAI API key |

---

## Data Sources

- CDC PLACES — county-level health outcome estimates for diabetes, obesity, hypertension, smoking, mental health, and more
- CDC Social Vulnerability Index — four-theme vulnerability scores for all US counties
- HRSA Data Warehouse — Health Professional Shortage Area designations and scores, Medically Underserved Area status
- HRSA FQHC Locator — Federally Qualified Health Center site counts and names by county
- USDA Economic Research Service — Rural-Urban Continuum Codes for rural classification
- Federal grant listings — compiled from HRSA, CDC, SAMHSA, USDA Rural Development, NIH, ACF, and CMS program announcements

---

## Known Limitations

- County health data is pulled live from CDC and HRSA APIs and cached for 24 hours. The data reflects the most recent available survey years published by those agencies, which vary by source.
- Grant matching uses a two-layer system: a curated hardcoded set plus live results from the Grants.gov API. The curated set is manually maintained, so very new or niche programs may not have detailed eligibility rules until added.
- The AI features require an OpenAI API key and cost roughly one cent per analysis request.


---

## Potential Future Improvements

- Expand the curated CFDA eligibility rules so more live Grants.gov results get precise scoring instead of keyword-only scoring
- User accounts so health departments can save notes, track applications, and set deadline reminders
- Export to PDF so users can generate a formatted grant brief or county health report in one click
- Role-based access so county staff, grant writers, and administrators see different views of the same data
- Multi-county comparison to benchmark a county against similar counties statewide
- Email alerts when new grants matching a county profile are posted
- Application deadline calendar view
- Integration with state health department reporting systems
# GrantIQ
