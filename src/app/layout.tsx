import type { Metadata, Viewport } from 'next'
import { Be_Vietnam_Pro, Bricolage_Grotesque } from 'next/font/google'
import './globals.css'

// The root layout holds only the fonts and <html lang> (B23); each area has its own shell:
// the prototype under /proto (src/app/proto/layout.tsx), the real app from M1-2.

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

export const metadata: Metadata = {
  title: 'Cơm Lá',
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
      <body className="min-h-full">{children}</body>
    </html>
  )
}
