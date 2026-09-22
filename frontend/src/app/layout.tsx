import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { DEV_BYPASS_AUTH } from '@/lib/auth/devBypass'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'HIMADRI — Antarctic Station Digital Twin',
  description:
    'HIMADRI is a digital twin and remote-management platform for Maitri and Bharati, India’s two Antarctic research stations, built for Smart India Hackathon 2026 (PS 26060, ISRO/NCPOR).',
  keywords: ['digital twin', 'Antarctica', 'Maitri', 'Bharati', 'NCPOR', 'ISRO', 'HIMADRI'],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const body = (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans bg-brand-bg text-white antialiased">
        <DashboardLayout>{children}</DashboardLayout>
      </body>
    </html>
  )

  // Local-dev-only: NEXT_PUBLIC_DEV_BYPASS_AUTH=true skips ClerkProvider
  // entirely — it throws without a configured publishableKey, so this app
  // can't render at all without it unless Clerk is fully out of the tree.
  // See src/lib/auth/devBypass.ts.
  if (DEV_BYPASS_AUTH) return body

  return (
    <ClerkProvider
      appearance={{
        // Clerk's default (light) base theme fits the app's ice-blue light
        // theme; `variables`/`elements` below re-skin it to match exactly.
        variables: {
          colorPrimary: '#1868A0',
          colorBackground: '#D9E9F2',
          colorInput: '#E7F1F8',
          colorInputForeground: '#16283A',
          colorForeground: '#16283A',
          colorMutedForeground: 'rgba(22,40,58,0.5)',
          colorNeutral: '#16283A',
          colorDanger: '#B23A2E',
          colorSuccess: '#1F9E6D',
          colorWarning: '#B8720F',
          borderRadius: '8px',
          fontFamily: 'Inter, system-ui, sans-serif',
        },
        elements: {
          card: 'bg-brand-surface-3 border border-brand-border shadow-none',
          headerTitle: 'font-mono text-white',
          headerSubtitle: 'text-white/50',
          socialButtonsBlockButton: 'border border-brand-border bg-brand-surface-2 hover:bg-brand-surface-3',
          dividerLine: 'bg-brand-border',
          dividerText: 'text-white/30',
          formFieldLabel: 'text-white/60',
          formFieldInput: 'bg-brand-bg border border-brand-border focus:border-cyan',
          formButtonPrimary:
            'bg-cyan text-brand-bg font-semibold hover:bg-cyan/90 shadow-cyan-glow normal-case',
          footerActionLink: 'text-cyan hover:text-cyan/80',
          identityPreviewEditButton: 'text-cyan',
        },
      }}
    >
      {body}
    </ClerkProvider>
  )
}
