import type { Metadata } from 'next'
import { AppShell } from '@/components/AppShell'
import { ProtoProvider } from '@/proto/ProtoProvider'

// The clickable prototype, kept under /proto until the end of M5 (B23, plan.md section 1.1).
// It keeps its fake data in the browser (localStorage), so pages render only on the client
// and the server shell has nothing to validate for instant navigation.
export const instant = false

export const metadata: Metadata = {
  title: 'Cơm Lá',
  description: 'Clickable prototype of the office lunch ordering app, with fake data.',
}

export default function ProtoLayout({ children }: LayoutProps<'/proto'>) {
  return (
    <ProtoProvider>
      <AppShell>{children}</AppShell>
    </ProtoProvider>
  )
}
