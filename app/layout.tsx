import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'VEDIT - The AI Video Editing Platform',
  description: 'AI-powered editing for creators, startups, and brands. Edit, manage, and publish your videos in seconds.',
  keywords: ['video editing', 'AI video editor', 'video automation', 'VIA chatbot', 'video publishing', 'AI video', 'video creator'],
  authors: [{ name: 'Nita Bariki' }],
  creator: 'Nita Bariki',
  publisher: 'VEDIT',
  openGraph: {
    title: 'VEDIT - The AI Video Editing Platform',
    description: 'AI-powered editing for creators, startups, and brands. Edit, manage, and publish your videos in seconds.',
    url: 'https://vedit-theta.vercel.app',
    siteName: 'VEDIT',
    type: 'website',
    images: [
      {
        url: '/og-image.png', // Add your OG image
        width: 1200,
        height: 630,
        alt: 'VEDIT - AI Video Editing Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VEDIT - The AI Video Editing Platform',
    description: 'AI-powered editing for creators, startups, and brands.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
