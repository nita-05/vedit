'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import dynamic from 'next/dynamic'

// Dynamically import VEditor only on client side to avoid SSR issues with FFmpeg.wasm
const VEditor = dynamic(() => import('@/components/VEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen bg-black text-white">
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 border-4 border-vedit-purple border-t-transparent rounded-full animate-spin" />
        <span>Loading editor...</span>
      </div>
    </div>
  ),
})

export default function EditorPage() {
  const { status } = useSession()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && status === 'unauthenticated') {
      router.push('/')
    }
  }, [status, router, mounted])

  if (!mounted || status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-4 border-vedit-purple border-t-transparent rounded-full animate-spin" />
          <span>Loading editor...</span>
        </div>
      </div>
    )
  }

  if (status !== 'authenticated') {
    return null
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <VEditor />
    </div>
  )
}


