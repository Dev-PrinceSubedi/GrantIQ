import { NextRequest, NextResponse } from 'next/server'
import { getCountyProfile } from '@/lib/countyData'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fips: string }> }
) {
  const { fips } = await params

  if (!fips || !/^28\d{3}$/.test(fips)) {
    return NextResponse.json(
      { success: false, profile: null, error: `Invalid FIPS: ${fips}` },
      { status: 400 }
    )
  }

  try {
    const profile = await getCountyProfile(fips)
    if (!profile) {
      return NextResponse.json(
        { success: false, profile: null, error: `No data found for FIPS ${fips}` },
        { status: 404 }
      )
    }
    return NextResponse.json({ success: true, profile, error: null })
  } catch (err) {
    console.error(`County API error for ${fips}:`, err)
    return NextResponse.json(
      { success: false, profile: null, error: 'Failed to fetch county data' },
      { status: 500 }
    )
  }
}
