import type { Metadata, Viewport } from 'next'
import { Be_Vietnam_Pro, Bricolage_Grotesque } from 'next/font/google'
import { AppShell } from '@/components/AppShell'
import './globals.css'

const beVietnam = Be_Vietnam_Pro({
  variable: '--font-be-vietnam',
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
})

// Headings, prices and the money block amount (docs/design.md, Type).
const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin', 'vietnamese'],
  weight: ['600', '700', '800'],
})

// The prototype keeps its fake data in the browser (localStorage), so pages render only on the
// client and the server shell has nothing to validate for instant navigation.
export const instant = false

export const metadata: Metadata = {
  title: 'Cơm Lá',
  description: 'Clickable prototype of the office lunch ordering app, with fake data.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1d4a29' },
    { media: '(prefers-color-scheme: dark)', color: '#13301b' },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="vi" className={`${beVietnam.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
