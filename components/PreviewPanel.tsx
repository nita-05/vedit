'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import ReactPlayer from 'react-player'

interface PreviewPanelProps {
  videoPublicId: string
  videoUrl?: string
  operation?: string
  params?: any
  onClose: () => void
}

export default function PreviewPanel({ videoPublicId, videoUrl, operation, params, onClose }: PreviewPanelProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!videoPublicId || !operation) return

    const generatePreview = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicId: videoPublicId,
            operation,
            params,
            resourceType: 'video',
          }),
        })

        const data = await response.json()

        if (data.success && data.previewUrl) {
          setPreviewUrl(data.previewUrl)
        } else {
          setError(data.error || 'Failed to generate preview')
        }
      } catch (err: any) {
        setError(err.message || 'Preview generation failed')
      } finally {
        setIsLoading(false)
      }
    }

    generatePreview()
  }, [videoPublicId, operation, params])

  if (!operation) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        className="bg-black/90 border border-white/20 rounded-2xl p-6 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-white">✨ Real-Time Preview</h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors text-2xl"
          >
            ✕
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-vedit-purple border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-white">Generating preview...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-red-300">
            <p className="font-semibold">Error</p>
            <p>{error}</p>
          </div>
        )}

        {previewUrl && !isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Before */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Before</h3>
              <div className="rounded-xl overflow-hidden bg-black">
                {videoUrl && (
                  <ReactPlayer
                    url={videoUrl}
                    controls
                    width="100%"
                    height="auto"
                    playing={false}
                  />
                )}
              </div>
            </div>

            {/* After */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">After</h3>
              <div className="rounded-xl overflow-hidden bg-black">
                <ReactPlayer
                  url={previewUrl}
                  controls
                  width="100%"
                  height="auto"
                  playing={false}
                />
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

