'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'

interface VPortModalProps {
  isOpen: boolean
  onClose: () => void
  onPublish: (platform: string) => void
  videoUrl?: string
  videoPublicId?: string
}

const platforms = [
  { id: 'youtube', name: 'YouTube', icon: '▶️', color: 'from-red-500 to-red-700' },
  { id: 'tiktok', name: 'TikTok', icon: '🎵', color: 'from-black to-gray-900' },
  { id: 'instagram', name: 'Instagram', icon: '📷', color: 'from-purple-500 via-pink-500 to-orange-500' },
  { id: 'linkedin', name: 'LinkedIn', icon: '💼', color: 'from-blue-600 to-blue-800' },
  { id: 'twitter', name: 'X (Twitter)', icon: '🐦', color: 'from-black to-gray-800' },
]

export default function VPortModal({ isOpen, onClose, onPublish, videoUrl, videoPublicId }: VPortModalProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const [scheduleMode, setScheduleMode] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduledPosts, setScheduledPosts] = useState<any[]>([])

  const handlePublish = async (platformId: string) => {
    setSelectedPlatform(platformId)
    setIsPublishing(true)
    
    try {
      if (scheduleMode && scheduleDate && scheduleTime) {
        // Schedule the post
        const scheduledDateTime = new Date(`${scheduleDate}T${scheduleTime}`)
        const response = await fetch('/api/publish/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: platformId,
            videoUrl,
            videoPublicId,
            scheduledAt: scheduledDateTime.toISOString(),
          }),
        })
        const data = await response.json()
        if (data.success) {
          alert(`Post scheduled for ${platforms.find(p => p.id === platformId)?.name} on ${scheduleDate} at ${scheduleTime}`)
          setScheduledPosts(prev => [...prev, data.scheduledPost])
          setScheduleDate('')
          setScheduleTime('')
          setScheduleMode(false)
        }
      } else {
        // Publish immediately
        await onPublish(platformId)
      }
      
      // Close modal after successful publish/schedule
      setTimeout(() => {
        setIsPublishing(false)
        setSelectedPlatform(null)
        if (!scheduleMode) onClose()
      }, 2000)
    } catch (error) {
      console.error('Publish error:', error)
      setIsPublishing(false)
      setSelectedPlatform(null)
      alert('Failed to publish/schedule. Please try again.')
    }
  }

  useEffect(() => {
    if (isOpen && scheduleMode) {
      // Fetch scheduled posts
      fetch('/api/publish/schedule')
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setScheduledPosts(data.scheduledPosts || [])
          }
        })
        .catch(err => console.error('Failed to fetch scheduled posts:', err))
    }
  }, [isOpen, scheduleMode])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/70 backdrop-blur-md"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative z-10 w-full max-w-2xl backdrop-blur-xl bg-[rgba(15,15,30,0.95)] border border-white/20 rounded-2xl shadow-2xl p-6 sm:p-8"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-vedit-pink via-vedit-purple to-vedit-blue bg-clip-text text-transparent">
                🚀 V-Port Publishing
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                {scheduleMode ? 'Schedule your video for automated publishing' : 'Publish your video to social media platforms'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setScheduleMode(!scheduleMode)
                  setSelectedPlatform(null)
                }}
                className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                  scheduleMode 
                    ? 'bg-vedit-purple/30 border border-vedit-purple text-white' 
                    : 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10'
                }`}
              >
                {scheduleMode ? '⏰ Schedule Mode' : '📅 Schedule'}
              </button>
              <button
                onClick={onClose}
                className="text-white/60 hover:text-white transition-colors text-2xl"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Schedule Mode Toggle */}
          {scheduleMode && (
            <div className="mb-6 p-4 bg-vedit-purple/10 border border-vedit-purple/30 rounded-xl">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Schedule Date</label>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white focus:border-vedit-purple focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Schedule Time</label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white focus:border-vedit-purple focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Platform Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {platforms.map((platform) => (
              <motion.button
                key={platform.id}
                whileHover={{ scale: 1.05, y: -4 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handlePublish(platform.id)}
                disabled={isPublishing}
                className={`relative p-4 rounded-xl border-2 transition-all duration-300 ${
                  selectedPlatform === platform.id
                    ? 'border-vedit-purple shadow-glow bg-white/10'
                    : 'border-white/10 hover:border-white/30 bg-white/5'
                } ${isPublishing && selectedPlatform !== platform.id ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`text-3xl mb-2 bg-gradient-to-r ${platform.color} bg-clip-text text-transparent`}>
                  {platform.icon}
                </div>
                <div className="text-white font-semibold">{platform.name}</div>
                {selectedPlatform === platform.id && isPublishing && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl"
                  >
                    <div className="flex gap-2">
                      <div className="w-2 h-2 bg-vedit-blue rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-vedit-purple rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-vedit-pink rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  </motion.div>
                )}
              </motion.button>
            ))}
          </div>

          {/* Info Section */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-sm text-gray-300">
              {videoUrl ? (
                <>
                  <span className="text-vedit-purple">✓</span> Video ready for publishing
                </>
              ) : (
                <>
                  <span className="text-yellow-400">⚠</span> Please export your video first before publishing
                </>
              )}
            </p>
          </div>

          {/* Cinematic Progress Animation */}
          {isPublishing && selectedPlatform && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 bg-gradient-to-r from-vedit-pink/20 via-vedit-purple/20 to-vedit-blue/20 border border-vedit-purple/50 rounded-xl"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="relative w-12 h-12">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    className="w-12 h-12 border-4 border-vedit-purple/30 border-t-vedit-purple rounded-full"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl">
                      {platforms.find(p => p.id === selectedPlatform)?.icon}
                    </span>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-white font-semibold mb-1">
                    Publishing to {platforms.find(p => p.id === selectedPlatform)?.name}...
                  </p>
                  <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 3, ease: 'easeInOut' }}
                      className="h-full bg-gradient-to-r from-vedit-pink via-vedit-purple to-vedit-blue"
                    />
                  </div>
                </div>
              </div>
              <p className="text-gray-300 text-xs mt-2">
                {scheduleMode 
                  ? `Scheduling post for ${scheduleDate} at ${scheduleTime}...`
                  : `Rendering via FFmpeg → Uploading to Cloudinary → Publishing to ${platforms.find(p => p.id === selectedPlatform)?.name}...`
                }
              </p>
            </motion.div>
          )}

          {/* Scheduled Posts List */}
          {scheduleMode && scheduledPosts.length > 0 && (
            <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded-xl">
              <h3 className="text-white font-semibold mb-3">📅 Scheduled Posts</h3>
              <div className="space-y-2">
                {scheduledPosts.map((post: any) => (
                  <div key={post.id} className="flex items-center justify-between p-2 bg-black/30 rounded">
                    <div>
                      <p className="text-sm text-white">{platforms.find(p => p.id === post.platform)?.name}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(post.scheduledAt).toLocaleString()}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      new Date(post.scheduledAt) > new Date() 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {new Date(post.scheduledAt) > new Date() ? 'Scheduled' : 'Published'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

