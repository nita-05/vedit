'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface AutoEnhancePanelProps {
  isOpen: boolean
  onClose: () => void
  videoPublicId: string
  videoUrl?: string
  onApplyEnhancements: (operations: Array<{ operation: string; params: any }>) => void
}

export default function AutoEnhancePanel({
  isOpen,
  onClose,
  videoPublicId,
  videoUrl,
  onApplyEnhancements,
}: AutoEnhancePanelProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [suggestions, setSuggestions] = useState<any>(null)
  const [isApplying, setIsApplying] = useState(false)
  const [autoApply, setAutoApply] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setSuggestions(null)
      setIsAnalyzing(false)
      setIsApplying(false)
    }
  }, [isOpen])

  const handleAnalyze = async () => {
    if (!videoPublicId) {
      alert('Please upload a video first')
      return
    }

    setIsAnalyzing(true)
    setSuggestions(null)

    try {
      const response = await fetch('/api/auto-enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPublicId,
          autoApply,
        }),
      })

      if (!response.ok) {
        throw new Error('Analysis request failed')
      }

      const data = await response.json()

      if (data.success) {
        setSuggestions(data)

        if (autoApply && data.operations?.length) {
          setIsApplying(true)
          try {
            await onApplyEnhancements(data.operations)
            onClose()
          } catch (error) {
            console.error('Failed to auto-apply enhancements:', error)
            alert('Enhancements were analyzed but failed to apply automatically. Please try again.')
          } finally {
            setIsApplying(false)
          }
        }
      } else {
        alert(data.error || 'Analysis failed')
      }
    } catch (error: any) {
      console.error('Auto-enhance error:', error)
      alert('Failed to analyze video')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleApply = async () => {
    if (!suggestions?.operations) return

    setIsApplying(true)
    try {
      onApplyEnhancements(suggestions.operations)
      onClose()
    } catch (error) {
      console.error('Failed to apply enhancements:', error)
      alert('Failed to apply enhancements')
    } finally {
      setIsApplying(false)
    }
  }

  if (!isOpen) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-black/90 border border-white/20 rounded-2xl p-6 max-w-2xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">🤖 Smart Auto-Enhance</h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors text-2xl"
          >
            ✕
          </button>
        </div>

        {!suggestions && (
          <div className="text-center py-8">
            <p className="text-white/60 mb-6">
              AI will analyze your video and suggest the best enhancements automatically.
            </p>
            <label className="flex items-center justify-center gap-3 text-sm text-white/70 mb-6">
              <input
                type="checkbox"
                checked={autoApply}
                onChange={(e) => setAutoApply(e.target.checked)}
                className="h-4 w-4 rounded border-white/40 bg-transparent text-vedit-blue focus:ring-vedit-blue"
              />
              Auto-apply enhancements after analysis
            </label>
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || isApplying || !videoPublicId}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-vedit-purple to-vedit-blue text-white font-semibold hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAnalyzing ? (
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Analyzing...
                </span>
              ) : isApplying ? (
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Applying...
                </span>
              ) : (
                '🔍 Analyze Video'
              )}
            </button>
          </div>
        )}

        {suggestions && (
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-lg font-semibold text-white mb-2">✨ AI Suggestions</h3>
              <p className="text-sm text-white/60 mb-4">{suggestions.suggestions?.reasoning}</p>

              {/* Video Metadata */}
              {suggestions.videoMetadata && (
                <div className="mb-4 p-2 bg-black/30 rounded-lg text-xs text-white/50">
                  <div className="grid grid-cols-2 gap-2">
                    <div>Duration: {suggestions.videoMetadata.duration}s</div>
                    <div>Resolution: {suggestions.videoMetadata.resolution}</div>
                    <div>Format: {suggestions.videoMetadata.format}</div>
                    <div>Size: {suggestions.videoMetadata.sizeMB}MB</div>
                  </div>
                </div>
              )}

              {/* Color Grade */}
              {suggestions.suggestions?.colorGrade && (
                <div className="mb-3">
                  <span className="text-xs text-white/40">🎨 Color Grade:</span>
                  <span className="ml-2 text-white capitalize font-medium">{suggestions.suggestions.colorGrade}</span>
                </div>
              )}

              {/* Noise Reduction */}
              {suggestions.suggestions?.noiseReduction?.needed && (
                <div className="mb-3">
                  <span className="text-xs text-white/40">🔇 Noise Reduction:</span>
                  <span className="ml-2 text-white capitalize font-medium">
                    {suggestions.suggestions.noiseReduction.intensity || 'medium'} intensity
                  </span>
                </div>
              )}

              {/* Saturation Adjustment */}
              {suggestions.suggestions?.saturation?.needed && (
                <div className="mb-3">
                  <span className="text-xs text-white/40">🌈 Saturation:</span>
                  <span className="ml-2 text-white capitalize font-medium">
                    {suggestions.suggestions.saturation.adjustment || 'increase'} 
                    {(suggestions.suggestions.saturation.amount && suggestions.suggestions.saturation.amount > 0) && 
                      ` by ${(suggestions.suggestions.saturation.amount * 100).toFixed(0)}%`
                    }
                  </span>
                </div>
              )}

              {/* Effects */}
              {suggestions.suggestions?.effects && suggestions.suggestions.effects.length > 0 && (
                <div className="mb-3">
                  <span className="text-xs text-white/40">✨ Effects:</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {suggestions.suggestions.effects.map((effect: string, idx: number) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-vedit-purple/20 text-vedit-purple rounded text-xs capitalize"
                      >
                        {effect}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Music */}
              {suggestions.suggestions?.music && (
                <div className="mb-3">
                  <span className="text-xs text-white/40">🎵 Music:</span>
                  <span className="ml-2 text-white capitalize font-medium">{suggestions.suggestions.music}</span>
                </div>
              )}

              {/* Transitions */}
              {suggestions.suggestions?.transitions && suggestions.suggestions.transitions.length > 0 && (
                <div className="mb-3">
                  <span className="text-xs text-white/40">🎬 Transitions:</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {suggestions.suggestions.transitions.map((transition: string, idx: number) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-vedit-blue/20 text-vedit-blue rounded text-xs capitalize"
                      >
                        {transition}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Text Overlay */}
              {suggestions.suggestions?.text && suggestions.suggestions.text.needed && (
                <div className="mb-3">
                  <span className="text-xs text-white/40">📝 Text Overlay:</span>
                  <div className="mt-1 text-sm text-white">
                    <span className="font-medium">"{suggestions.suggestions.text.suggestion || 'Welcome'}"</span>
                    <span className="ml-2 text-white/60 text-xs">
                      ({suggestions.suggestions.text.style || 'Bold'} style, {suggestions.suggestions.text.position || 'center'})
                    </span>
                  </div>
                </div>
              )}

              {/* Speed Adjustment */}
              {suggestions.suggestions?.speed && suggestions.suggestions.speed !== 1.0 && (
                <div className="mb-3">
                  <span className="text-xs text-white/40">⚡ Speed:</span>
                  <span className="ml-2 text-white font-medium">
                    {suggestions.suggestions.speed}x 
                    {suggestions.suggestions.speed > 1 ? ' (Faster)' : ' (Slower)'}
                  </span>
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-white/10 text-xs text-white/40">
                <span className="font-medium text-white/60">
                  {suggestions.operations?.length || 0} enhancement{suggestions.operations?.length !== 1 ? 's' : ''} will be applied
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleApply}
                disabled={isApplying || isAnalyzing}
                className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-vedit-pink to-vedit-purple text-white font-semibold hover:scale-105 transition-transform disabled:opacity-50"
              >
                {isApplying ? 'Applying...' : '✅ Apply Enhancements'}
              </button>
              <button
                onClick={() => {
                  setSuggestions(null)
                  handleAnalyze()
                }}
                disabled={isAnalyzing || isApplying}
                className="px-4 py-3 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-50"
              >
                🔄 Re-analyze
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

