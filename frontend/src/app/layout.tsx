import type { Metadata } from 'next'
import { Inter, JetBrains_Mono, Fraunces } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { DEV_BYPASS_AUTH } from '@/lib/auth/devBypass'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['opsz'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'HIMADRI — Station Command & Digital Twin',
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
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${fraunces.variable}`}>
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
          colorPrimary: '#3A3AB8',
          colorBackground: '#ECE6D8',
          colorInput: '#F3EFE6',
          colorInputForeground: '#1C1F33',
          colorForeground: '#1C1F33',
          colorMutedForeground: 'rgba(28,31,51,0.5)',
          colorNeutral: '#1C1F33',
          colorDanger: '#C23B3B',
          colorSuccess: '#0F8A6A',
          colorWarning: '#D4820A',
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
