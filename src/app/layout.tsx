import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GrantIQ — Federal Grant Intelligence for Mississippi',
  description:
    'Real-time federal grant matching for Mississippi county health departments. Built on CDC, HRSA, and SVI data.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Inter:wght@300..700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      </head>

      <body className="min-h-screen" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        {/* Top system bar */}
        <div
          style={{
            background: 'var(--amber)',
            color: 'var(--navy)',
            fontSize: '10px',
            fontFamily: 'IBM Plex Mono, monospace',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textAlign: 'center',
            padding: '4px 16px',
          }}
        >
          HEALTH RESOURCES & SERVICES INTELLIGENCE SYSTEM
        </div>

        {children}
      </body>
    </html>
  )
}