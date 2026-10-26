import type { Metadata } from 'next'
import { connection } from 'next/server'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Fusion workbench | IDMHYSI systems',
  description: 'Explore the EssenceFusion fixed-vector equations. Edit two vectors and their potentials, compare the result, and export your calculation.',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection()
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
