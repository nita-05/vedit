'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import Image from 'next/image'
import VIAChat from '@/components/VIAChat'
import VideoUpload from '@/components/VideoUpload'
import TimelineView from '@/components/TimelineView'
import ActionNavbar from '@/components/ActionNavbar'
import VPortModal from '@/components/VPortModal'
import VIAProfilesModal from '@/components/VIAProfilesModal'
import BrandKitsModal from '@/components/BrandKitsModal'
import PreviewPanel from '@/components/PreviewPanel'
import TemplatesPanel from '@/components/TemplatesPanel'
import AutoEnhancePanel from '@/components/AutoEnhancePanel'

const ReactPlayer = dynamic(() => import('react-player'), { ssr: false })

interface MediaItem {
  url: string
  publicId: string
  type: 'video' | 'image'
  name: string
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [imageError, setImageError] = useState(false)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null)
  const [externalCommand, setExternalCommand] = useState<string>('')
  const [commandToInput, setCommandToInput] = useState<string>('')
  const [isVPortOpen, setIsVPortOpen] = useState(false)
  const [chatHistory, setChatHistory] = useState<any[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [lastBackup, setLastBackup] = useState<Date | null>(null)
  const [videoKey, setVideoKey] = useState(0)
  const [editHistory, setEditHistory] = useState<string[]>([]) // Stack of video URLs for undo
  const [currentTime, setCurrentTime] = useState(0) // Current playback time
  const [duration, setDuration] = useState(0) // Total video duration
  const [isVIAProfilesOpen, setIsVIAProfilesOpen] = useState(false)
  const [isBrandKitsOpen, setIsBrandKitsOpen] = useState(false)
  const [selectedVoiceProfile, setSelectedVoiceProfile] = useState<any>(null)
  const [originalVideoUrl, setOriginalVideoUrl] = useState<string | null>(null) // Track original video URL
  const [lastProcessedUrl, setLastProcessedUrl] = useState<string | null>(null) // Track last processed URL
  const [processingNotification, setProcessingNotification] = useState<{show: boolean, message: string, url: string} | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false)
  const [isAutoEnhanceOpen, setIsAutoEnhanceOpen] = useState(false)
  const [previewOperation, setPreviewOperation] = useState<{operation: string, params: any} | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/')
    }
  }, [status, router])

  // Debug: Log when selectedMedia changes
  useEffect(() => {
    console.log('🎬 Dashboard: selectedMedia changed:', selectedMedia)
    if (selectedMedia) {
      console.log('🎬 Dashboard: selectedMedia URL:', selectedMedia.url)
      // Store original URL ONLY when first selecting a video (not when URL is updated after processing)
      // Only set if originalVideoUrl is null AND this is likely the first load (not a processed URL)
      if (!originalVideoUrl && selectedMedia.url && !selectedMedia.url.includes('_processed') && !selectedMedia.url.includes('e_grayscale') && !selectedMedia.url.includes('e_') && !selectedMedia.url.includes('?_t=') && !selectedMedia.url.includes('?_cb=')) {
        setOriginalVideoUrl(selectedMedia.url)
        console.log('📌 Dashboard: Stored original video URL:', selectedMedia.url)
      } else if (originalVideoUrl && selectedMedia.url === originalVideoUrl) {
        console.log('📌 Dashboard: URL matches original - this is the original video')
      } else if (originalVideoUrl && selectedMedia.url !== originalVideoUrl) {
        console.log('📌 Dashboard: URL is different from original - this is a processed video')
        console.log('📌 Dashboard: Original:', originalVideoUrl)
        console.log('📌 Dashboard: Current:', selectedMedia.url)
      }
    }
  }, [selectedMedia])

  // Force ReactPlayer remount when URL changes significantly (safety net)
  // This catches URL changes that might not trigger onVideoUpdate
  const prevUrlRef = useRef<string | null>(null)
  useEffect(() => {
    if (selectedMedia?.url && selectedMedia.type === 'video') {
      // Extract base URL without query params for comparison
      const baseUrl = selectedMedia.url.split('?')[0]
      const prevBaseUrl = prevUrlRef.current?.split('?')[0]
      
      // If URL changed significantly (not just cache-busting params), increment videoKey
      if (prevBaseUrl && baseUrl !== prevBaseUrl && baseUrl !== originalVideoUrl?.split('?')[0]) {
        console.log('🔄 Dashboard: URL base changed (safety net), forcing ReactPlayer remount')
        console.log('🔄 Dashboard: Old base URL:', prevBaseUrl)
        console.log('🔄 Dashboard: New base URL:', baseUrl)
        setVideoKey(prev => prev + 1)
      }
      
      // Update ref for next comparison
      prevUrlRef.current = selectedMedia.url
    }
  }, [selectedMedia?.url, originalVideoUrl])

  // Auto-backup every 5 minutes
  useEffect(() => {
    const backupInterval = setInterval(async () => {
      try {
        await fetch('/api/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectData: { mediaItems, selectedMedia },
            videoPublicId: selectedMedia?.publicId || '',
            chatHistory,
            brandKit: {},
          }),
        })
        setLastBackup(new Date())
      } catch (error) {
        console.error('Auto-backup failed:', error)
      }
    }, 5 * 60 * 1000) // 5 minutes

    // Recover last session on mount
    const recoverSession = async () => {
      try {
        const response = await fetch('/api/backup')
        const data = await response.json()
        if (data.success && data.lastBackup) {
          // Optionally restore previous session
          console.log('Last session recovered:', data.lastBackup)
        }
      } catch (error) {
        console.error('Session recovery failed:', error)
      }
    }
    recoverSession()

    return () => clearInterval(backupInterval)
  }, [mediaItems, selectedMedia, chatHistory])

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  const handleFeatureClick = (command: string) => {
    // Auto-send mode (for backward compatibility if needed)
    console.log('🎬 Dashboard: handleFeatureClick called with command:', command)
    console.log('🎬 Dashboard: Setting externalCommand to:', command)
    console.log('🎬 Dashboard: Current selectedMedia URL:', selectedMedia?.url)
    setExternalCommand(command)
  }

  const handleFeatureToInput = (command: string) => {
    // Populate chat input mode (default - user can edit before sending)
    console.log('🎬 Dashboard: handleFeatureToInput called with command:', command)
    setCommandToInput(command)
  }

  const handleCommandProcessed = () => {
    console.log('🎬 Dashboard: Command processed, clearing externalCommand')
    setExternalCommand('')
  }

  const handleSave = async () => {
    if (!selectedMedia) {
      alert('Please select a video to save')
      return
    }
    
    setIsSaving(true)
    try {
      // Use the current edited video URL, not the original
      const currentVideoUrl = selectedMedia.url
      const currentPublicId = selectedMedia.publicId
      
      console.log('💾 Saving project with video URL:', currentVideoUrl)
      console.log('💾 Video publicId:', currentPublicId)
      
      const response = await fetch('/api/projects/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectData: {
            mediaItems,
            selectedMedia,
            timestamp: new Date().toISOString()
          },
          videoPublicId: currentPublicId || '',
          videoUrl: currentVideoUrl || '', // ✅ Save the edited video URL
          chatHistory,
          brandKit: {} // TODO: Add brand kit data
        })
      })
      const data = await response.json()
      if (data.success) {
        alert('Project saved successfully!')
        console.log('✅ Project saved with video URL:', data.videoUrl || currentVideoUrl)
      }
    } catch (error) {
      console.error('Save error:', error)
      alert('Failed to save project')
    } finally {
      setIsSaving(false)
    }
  }

  const handleExport = async () => {
    if (!selectedMedia?.url) {
      alert('Please select a video to export')
      return
    }
    
    setIsExporting(true)
    try {
      // Use the current edited video URL, not the original publicId
      const currentVideoUrl = selectedMedia.url
      const currentPublicId = selectedMedia.publicId
      
      console.log('📤 Exporting video with URL:', currentVideoUrl)
      console.log('📤 Video publicId:', currentPublicId)
      
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: currentVideoUrl, // ✅ Export the edited video URL directly
          videoPublicId: currentPublicId || '', // Keep for reference
          format: 'mp4',
          quality: 'high'
        })
      })
      const data = await response.json()
      if (data.success && data.downloadUrl) {
        console.log('✅ Export successful, download URL:', data.downloadUrl)
        window.open(data.downloadUrl, '_blank')
        alert('Video exported successfully!')
      } else {
        throw new Error(data.error || 'Export failed')
      }
    } catch (error) {
      console.error('Export error:', error)
      alert('Failed to export video: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setIsExporting(false)
    }
  }

  const handleDownload = async () => {
    if (!selectedMedia?.url) {
      alert('Please select a video to download')
      return
    }
    
    try {
      // Direct download of the current edited video
      const videoUrl = selectedMedia.url
      console.log('📥 Downloading video:', videoUrl)
      
      // Create a temporary anchor element to trigger download
      const link = document.createElement('a')
      link.href = videoUrl
      link.download = `${selectedMedia.name || 'vedit-video'}.mp4`
      link.target = '_blank'
      
      // Add to DOM, click, and remove
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      console.log('✅ Download initiated')
    } catch (error) {
      console.error('Download error:', error)
      alert('Failed to download video. Please try again.')
    }
  }

  const handleShare = async () => {
    if (!selectedMedia?.url) {
      alert('Please select a video to share')
      return
    }
    
    try {
      const videoUrl = selectedMedia.url
      const videoName = selectedMedia.name || 'My Video'
      
      // Generate shareable link
      const shareUrl = `${window.location.origin}/share/${selectedMedia.publicId || Date.now()}`
      
      // Try to use Web Share API if available (mobile/desktop browsers)
      if (navigator.share) {
        await navigator.share({
          title: `Check out my video: ${videoName}`,
          text: `I created this video with VEDIT!`,
          url: shareUrl,
        })
        console.log('✅ Shared via Web Share API')
      } else {
        // Fallback: Copy to clipboard
        const shareText = `Check out my video: ${videoName}\n${shareUrl}\n\nDirect video link: ${videoUrl}`
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(shareText)
          alert('Share link copied to clipboard! Paste it anywhere to share.')
          console.log('✅ Share link copied to clipboard')
        } else {
          // Fallback for older browsers
          const textArea = document.createElement('textarea')
          textArea.value = shareText
          textArea.style.position = 'fixed'
          textArea.style.opacity = '0'
          document.body.appendChild(textArea)
          textArea.select()
          document.execCommand('copy')
          document.body.removeChild(textArea)
          alert('Share link copied to clipboard! Paste it anywhere to share.')
          console.log('✅ Share link copied to clipboard (fallback)')
        }
      }
    } catch (error) {
      console.error('Share error:', error)
      // If user cancels share, don't show error
      if (error instanceof Error && error.name !== 'AbortError') {
        alert('Failed to share. Please copy the video URL manually.')
      }
    }
  }

  const handlePublish = async (platform: string) => {
    if (!selectedMedia?.url) {
      alert('Please export your video first before publishing')
      return
    }

    try {
      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          videoUrl: selectedMedia.url,
          title: selectedMedia.name || 'My Video',
          description: 'Created with VEDIT',
          videoPublicId: selectedMedia.publicId,
          visibility: 'public',
        })
      })
      const data = await response.json()
      
      if (data.success) {
        alert(data.message || `🎉 Video published to ${platform} successfully!`)
        if (data.publishedUrl) {
          window.open(data.publishedUrl, '_blank')
        }
      } else if (data.requiresAuth && data.oauthUrl) {
        // Prompt user to connect account
        const shouldConnect = confirm(
          `${data.message || `Please connect your ${platform} account to publish.\n\nClick OK to connect now.`}`
        )
        if (shouldConnect) {
          window.open(data.oauthUrl, '_blank', 'width=600,height=700')
          // Note: In production, you'd handle the OAuth callback properly
          alert(`After connecting your ${platform} account, try publishing again.`)
        }
      } else {
        alert(data.error || data.message || `Failed to publish to ${platform}`)
      }
    } catch (error) {
      console.error('Publish error:', error)
      alert(`Failed to publish to ${platform}`)
    }
  }

  return (
    <div className="relative w-full min-h-screen overflow-hidden bg-black">
      {/* Background Gradient Overlays */}
      <div className="fixed inset-0 w-full h-full bg-gradient-to-br from-vedit-purple/10 via-black to-vedit-blue/10 z-[1]"></div>
      <div className="fixed inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 z-[1]"></div>
      
      {/* Floating Glow Effects */}
      <div className="fixed top-20 left-1/4 w-40 h-40 bg-vedit-purple/20 rounded-full blur-3xl animate-float z-[1]"></div>
      <div className="fixed bottom-40 right-1/4 w-32 h-32 bg-vedit-blue/20 rounded-full blur-2xl animate-float z-[1]" style={{ animationDelay: '1s' }}></div>
      <div className="fixed top-1/2 right-1/3 w-24 h-24 bg-vedit-pink/20 rounded-full blur-xl animate-float z-[1]" style={{ animationDelay: '2s' }}></div>

      {/* Action Navbar - Fixed at top */}
      <ActionNavbar 
        onFeatureClick={handleFeatureClick}
        onFeatureToInput={handleFeatureToInput}
        onSave={handleSave}
        onExport={handleExport}
        onDownload={handleDownload}
        onShare={handleShare}
        onPublish={() => setIsVPortOpen(true)}
        onOpenVIAProfiles={() => setIsVIAProfilesOpen(true)}
        onOpenBrandKits={() => setIsBrandKitsOpen(true)}
        onOpenPreview={() => setIsPreviewOpen(true)}
        onOpenTemplates={() => setIsTemplatesOpen(true)}
        onOpenAutoEnhance={() => setIsAutoEnhanceOpen(true)}
      />

      {/* V-Port Modal */}
      <VPortModal
        isOpen={isVPortOpen}
        onClose={() => setIsVPortOpen(false)}
        onPublish={handlePublish}
        videoUrl={selectedMedia?.url}
        videoPublicId={selectedMedia?.publicId}
      />

      {/* VIA Profiles Modal */}
      <VIAProfilesModal
        isOpen={isVIAProfilesOpen}
        onClose={() => setIsVIAProfilesOpen(false)}
        onSelectProfile={(profile) => {
          setSelectedVoiceProfile(profile)
          // Apply voice profile to current video if available
          if (selectedMedia?.publicId) {
            const command = `Generate voiceover with ${profile.voice} voice saying "${profile.name}"`
            setCommandToInput(command)
          }
        }}
      />

      {/* Preview Panel */}
      {isPreviewOpen && previewOperation && (
        <PreviewPanel
          videoPublicId={selectedMedia?.publicId || ''}
          videoUrl={selectedMedia?.url}
          operation={previewOperation.operation}
          params={previewOperation.params}
          onClose={() => {
            setIsPreviewOpen(false)
            setPreviewOperation(null)
          }}
        />
      )}

      {/* Templates Panel */}
      <TemplatesPanel
        isOpen={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
        videoPublicId={selectedMedia?.publicId || ''}
        videoUrl={selectedMedia?.url}
        onApplyTemplate={async (operations) => {
          // Apply template operations sequentially via VIA
          for (const op of operations) {
            const command = `${op.operation === 'colorGrade' ? 'Apply' : op.operation === 'applyEffect' ? 'Apply' : 'Add'} ${op.params.preset || op.params.text || ''} ${op.operation === 'addText' ? 'text' : op.operation === 'colorGrade' ? 'color grade' : 'effect'}`
            setCommandToInput(command)
            // Wait a bit between operations
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        }}
      />

      {/* Auto-Enhance Panel */}
      <AutoEnhancePanel
        isOpen={isAutoEnhanceOpen}
        onClose={() => setIsAutoEnhanceOpen(false)}
        videoPublicId={selectedMedia?.publicId || ''}
        videoUrl={selectedMedia?.url}
        onApplyEnhancements={async (operations) => {
          // Apply enhancements sequentially via VIA
          for (const op of operations) {
            let command = ''
            
            switch (op.operation) {
              case 'colorGrade':
                command = `Apply ${op.params.preset || 'cinematic'} color grade`
                break
              case 'applyEffect':
                command = `Apply ${op.params.preset || 'glow'} effect`
                break
              case 'addMusic':
                command = `Add ${op.params.preset || 'Ambient'} background music`
                break
              case 'addTransition':
                command = `Apply ${op.params.preset || 'Fade'} transition`
                break
              case 'addText':
                command = `Add ${op.params.preset || 'Bold'} text "${op.params.text || 'Welcome'}" at ${op.params.position || 'center'}`
                break
              case 'adjustSpeed':
                command = `Set video speed to ${op.params.speed}x`
                break
              case 'filter':
                if (op.params.type === 'saturation') {
                  const value = op.params.value || 1.0
                  const change = value > 1 ? 'increase' : 'decrease'
                  command = `${change} saturation by ${Math.abs((value - 1) * 100).toFixed(0)}%`
                } else if (op.params.type === 'noise reduction' || op.params.type === 'noise') {
                  command = `Apply noise reduction filter`
                } else {
                  command = `Apply ${op.params.type || 'filter'} filter`
                }
                break
              default:
                command = `Apply ${op.params.preset || 'enhancement'}`
            }
            
            setCommandToInput(command)
            // Wait between operations to allow processing
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }}
      />

      {/* Brand Kits Modal */}
      <BrandKitsModal
        isOpen={isBrandKitsOpen}
        onClose={() => setIsBrandKitsOpen(false)}
        onSelectKit={(kit) => {
          console.log('Brand kit selected:', kit)
        }}
        onApplyKit={async (kit, videoPublicId) => {
          try {
            const response = await fetch('/api/brand-kits/apply', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                brandKitId: kit.id,
                videoPublicId,
                videoUrl: selectedMedia?.url,
              }),
            })
            const data = await response.json()
            if (data.success && data.videoUrl) {
              setSelectedMedia({ ...selectedMedia!, url: data.videoUrl })
              setMediaItems(prev => prev.map(item =>
                item.publicId === videoPublicId ? { ...item, url: data.videoUrl } : item
              ))
              alert(data.message || 'Brand kit applied successfully!')
            }
          } catch (error) {
            console.error('Failed to apply brand kit:', error)
            alert('Failed to apply brand kit')
          }
        }}
        videoPublicId={selectedMedia?.publicId}
      />

      {/* Header - Kept for layout but hidden since navbar handles this */}
      <header className="relative z-20 w-full px-6 py-4 flex items-center justify-between backdrop-blur-md bg-black/20 border-b border-white/10 opacity-0 pointer-events-none">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-vedit-pink to-vedit-blue bg-clip-text text-transparent">
            🎬 VEDIT
          </h1>
          <div className="flex items-center gap-3">
            {session.user?.image && !imageError ? (
              <Image
                src={session.user.image}
                alt={session.user?.name || 'Profile'}
                width={40}
                height={40}
                className="rounded-full border-2 border-vedit-purple/50 shadow-glow object-cover"
                unoptimized
                onError={() => {
                  console.error('Failed to load profile image:', session.user?.image)
                  setImageError(true)
                }}
              />
            ) : (
              <div className="w-10 h-10 rounded-full border-2 border-vedit-purple/50 shadow-glow bg-vedit-purple/50 flex items-center justify-center text-white text-sm font-semibold">
                {session.user?.name?.[0] || 'U'}
              </div>
            )}
            <span className="text-white">
              Welcome, {session.user?.name} 👋
            </span>
          </div>
        </div>
        <button
          onClick={async () => {
            try {
              await signOut({ redirect: false })
              router.push('/')
              router.refresh()
            } catch (error) {
              console.error('Logout error:', error)
              // Fallback: force redirect
              window.location.href = '/'
            }
          }}
          className="px-6 py-2 rounded-xl bg-gradient-to-r from-vedit-pink via-vedit-purple to-vedit-blue text-white font-semibold hover:scale-105 transition-transform duration-300 shadow-glow"
        >
          Logout
        </button>
      </header>

      {/* Main Grid - Adjusted for fixed navbar */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[380px_1fr_380px] gap-6 h-[calc(100vh-120px)] p-6 pt-24">
        
        {/* Loading Indicators */}
        {isSaving && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed top-20 right-6 z-50 bg-black/80 backdrop-blur-xl border border-white/20 rounded-xl px-4 py-3 flex items-center gap-3"
          >
            <div className="w-5 h-5 border-2 border-vedit-purple border-t-transparent rounded-full animate-spin"></div>
            <span className="text-white text-sm">Saving project...</span>
          </motion.div>
        )}
        
        {isExporting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed top-20 right-6 z-50 bg-black/80 backdrop-blur-xl border border-white/20 rounded-xl px-4 py-3 flex items-center gap-3"
          >
            <div className="w-5 h-5 border-2 border-vedit-blue border-t-transparent rounded-full animate-spin"></div>
            <span className="text-white text-sm">Exporting video...</span>
          </motion.div>
        )}
        {/* Left: Media Upload */}
        <aside className="backdrop-blur-xl bg-black/30 border border-white/10 rounded-2xl p-4 overflow-y-auto shadow-glow">
          <h2 className="text-xl font-semibold mb-4 text-white">Upload Media</h2>
          <VideoUpload onUploadComplete={(items) => {
            console.log('📤 Upload complete, received items:', items.length)
            // Filter out temporary uploading items and update immediately
            const validItems = items.filter((item: any) => {
              // Keep items that are either:
              // 1. Not uploading (fully uploaded)
              // 2. Have a valid HTTP URL (not blob URLs that failed)
              return !item.isUploading || (item.url && item.url.startsWith('http'))
            })
            setMediaItems(validItems)
            
            // If there's a new item that just finished uploading, select it
            const newItem = validItems.find((item: any) => 
              !item.isUploading && 
              !mediaItems.find((m: any) => m.publicId === item.publicId) &&
              item.url?.startsWith('http')
            )
            if (newItem && newItem.url?.startsWith('http')) {
              setSelectedMedia(newItem)
              console.log('✅ New media selected:', newItem.name)
            } else if (validItems.length > 0 && !selectedMedia) {
              // Select first item if none selected
              const firstValid = validItems.find((item: any) => item.url?.startsWith('http'))
              if (firstValid) {
                setSelectedMedia(firstValid)
              }
            }
          }} />
          
          {mediaItems.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-3 text-white">Your Media</h3>
              <div className="grid grid-cols-2 gap-2">
                {mediaItems.map((item, index) => (
                  <div
                    key={item.publicId}
                    onClick={() => {
                      if ((item as any).isUploading) return // Don't select uploading items
                      setSelectedMedia(item)
                      setEditHistory([]) // Clear history when switching videos
                    }}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                      (item as any).isUploading
                        ? 'border-vedit-purple/50 opacity-70 cursor-wait'
                        : 'cursor-pointer'
                    } ${
                      selectedMedia?.publicId === item.publicId
                        ? 'border-vedit-purple shadow-glow'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    {(item as any).isUploading && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                        <div className="text-center">
                          <div className="w-8 h-8 border-4 border-vedit-purple border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                          <span className="text-xs text-white">Uploading...</span>
                        </div>
                      </div>
                    )}
                    {item.type === 'video' ? (
                      <video
                        src={item.url}
                        className="w-full h-24 object-cover"
                        muted
                      />
                    ) : (
                      <img
                        src={item.url}
                        alt={item.name}
                        className="w-full h-24 object-cover"
                      />
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-1">
                      <p className="text-xs text-white truncate">{item.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Center: Media Preview & Timeline */}
        <section className="flex flex-col items-center justify-start backdrop-blur-xl bg-black/20 border border-white/10 rounded-2xl p-4 overflow-y-auto shadow-glow">
          <div className="w-full max-w-4xl">
            {selectedMedia ? (
              <>
                <div className="rounded-xl overflow-hidden shadow-2xl mb-4 bg-black relative">
                  {/* Processing notification */}
                  {processingNotification?.show && (
                    <motion.div
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="absolute top-4 right-4 z-50 bg-green-500/90 text-white px-4 py-2 rounded-lg shadow-lg backdrop-blur-sm flex items-center gap-2"
                    >
                      <span>✅</span>
                      <span className="text-sm font-medium">{processingNotification.message}</span>
                      <button
                        onClick={() => setProcessingNotification(null)}
                        className="ml-2 text-white/80 hover:text-white"
                      >
                        ✕
                      </button>
                    </motion.div>
                  )}
                  
                  {/* Video status badge */}
                  {selectedMedia.url !== originalVideoUrl && originalVideoUrl && (
                    <div className="absolute top-4 left-4 z-40 bg-vedit-purple/90 text-white px-3 py-1 rounded-lg shadow-lg backdrop-blur-sm text-xs font-medium">
                      ✏️ Edited
                    </div>
                  )}
                  
                  {selectedMedia.type === 'video' ? (
                    <>
                      <ReactPlayer
                        key={`video-${videoKey}-${selectedMedia.url?.split('?')[0] || ''}`}
                        url={selectedMedia.url ? `${selectedMedia.url}${selectedMedia.url.includes('?') ? '&' : '?'}_cb=${videoKey}&_nocache=1` : ''}
                        controls
                        width="100%"
                        height="auto"
                        playing={false}
                        config={{
                          file: {
                            attributes: {
                              controlsList: 'nodownload',
                              preload: 'metadata', // Load metadata but not full video
                              // Aggressive cache prevention
                              'data-cache': 'no',
                              'data-no-cache': '1',
                              onError: (e: any) => {
                                console.error('🎥 Video element error:', e)
                                console.error('🎥 Current URL:', selectedMedia.url)
                                // Safely log error without circular reference issues
                                try {
                                  const errorInfo = {
                                    message: e?.message || e?.toString() || 'Unknown error',
                                    type: e?.type || 'unknown',
                                    target: e?.target ? {
                                      src: e?.target?.src,
                                      error: e?.target?.error?.code,
                                    } : null,
                                  }
                                  console.error('🎥 Error details:', errorInfo)
                                } catch (logError) {
                                  console.error('🎥 Error (could not serialize):', e?.message || String(e))
                                }
                                // Don't revert - let user see the error
                              },
                              // Force video element to reload
                              onLoadStart: () => {
                                console.log('🔄 Video element load started:', selectedMedia.url)
                              },
                              onLoadedMetadata: (e: any) => {
                                const video = e?.target
                                if (video && video.duration) {
                                  const newDuration = video.duration
                                  console.log('✅ Video metadata loaded:', selectedMedia.url)
                                  console.log('📊 Video duration:', newDuration, 'seconds')
                                  console.log('📊 Video duration formatted:', `${Math.floor(newDuration / 60)}:${Math.floor(newDuration % 60).toString().padStart(2, '0')}`)
                                  // Update duration state
                                  setDuration(newDuration)
                                }
                              },
                              onCanPlay: () => {
                                console.log('✅ Video can play:', selectedMedia.url)
                              },
                              onDurationChange: (e: any) => {
                                const video = e?.target
                                if (video && video.duration) {
                                  const newDuration = video.duration
                                  console.log('⏱️ Duration changed:', newDuration, 'seconds')
                                  setDuration(newDuration)
                                }
                              }
                            },
                            // Force video format
                            forceVideo: true,
                            // Disable caching
                            forceHLS: false,
                            forceDASH: false,
                          }
                        }}
                        onError={(e) => {
                          console.error('🎥 ReactPlayer error:', e)
                          console.error('🎥 Failed URL:', selectedMedia.url)
                          console.error('🎥 Is this original?', selectedMedia.url === originalVideoUrl)
                          // Show error but don't revert to original
                          // The URL is set, just might need time to process
                        }}
                        onReady={() => {
                          console.log('🎥 ReactPlayer ready with URL:', selectedMedia.url)
                          console.log('📊 Dashboard: Is this the original video?', selectedMedia.url === originalVideoUrl)
                          console.log('📊 Dashboard: Original URL:', originalVideoUrl)
                          console.log('📊 Dashboard: Current URL:', selectedMedia.url)
                          console.log('✅ Video loaded successfully - NOT reverting to original')
                          // Verify URL matches what we expect
                          if (selectedMedia.url === originalVideoUrl && lastProcessedUrl) {
                            console.error('⚠️ WARNING: ReactPlayer loaded original URL but we have a processed URL!')
                            console.error('⚠️ Processed URL was:', lastProcessedUrl)
                          }
                        }}
                        onStart={() => {
                          console.log('▶️ Video started playing:', selectedMedia.url)
                          console.log('▶️ Video key:', videoKey)
                        }}
                        onProgress={(state) => setCurrentTime(state.playedSeconds)}
                        onDuration={(dur) => setDuration(dur)}
                      />
                      {/* Undo button */}
                      {editHistory.length > 0 && (
                        <button
                          onClick={() => {
                            console.log('↩️ Undo clicked, history:', editHistory)
                            const previousUrl = editHistory[editHistory.length - 1]
                            const newHistory = editHistory.slice(0, -1)
                            setEditHistory(newHistory)
                            setSelectedMedia({ ...selectedMedia!, url: previousUrl })
                            setMediaItems(prev => prev.map(item =>
                              item.publicId === selectedMedia.publicId ? { ...item, url: previousUrl } : item
                            ))
                            setVideoKey(prev => prev + 1)
                            console.log('↩️ Undo complete, reverted to:', previousUrl)
                          }}
                          className="absolute top-4 right-4 z-10 px-4 py-2 bg-gradient-to-r from-vedit-pink to-vedit-purple text-white font-semibold rounded-xl hover:scale-105 transition-all shadow-glow backdrop-blur-sm"
                          title="Undo last edit"
                        >
                          ↩️ Undo
                        </button>
                      )}
                    </>
                  ) : (
                    <img
                      src={selectedMedia.url}
                      alt={selectedMedia.name}
                      className="w-full h-auto rounded-xl"
                    />
                  )}
                </div>
                <TimelineView 
                  videoPublicId={selectedMedia.type === 'video' ? selectedMedia.publicId : ''}
                  videoUrl={selectedMedia.type === 'video' ? selectedMedia.url : undefined}
                  videoName={selectedMedia.name}
                  currentTime={currentTime}
                  duration={duration}
                  onTrim={async (start, end) => {
                    // Handle trim via VIA command
                    const command = `Trim video from ${start} to ${end} seconds`
                    setCommandToInput(command)
                  }}
                  onDeleteClip={async (clipId) => {
                    // Handle clip deletion via VIA command
                    const command = `Remove clip ${clipId}`
                    setCommandToInput(command)
                  }}
                  onSplitClip={async (time) => {
                    // Handle clip split via VIA command
                    const command = `Split video at ${time} seconds`
                    setCommandToInput(command)
                  }}
                  onMergeClips={async (clipIds, clips) => {
                    // Handle merge - supports clips from same or DIFFERENT videos
                    if (clipIds.length >= 2 && clips && clips.length >= 2) {
                      try {
                        // Extract unique video URLs from selected clips
                        const uniqueVideoUrls = Array.from(new Set(clips.map(clip => clip.videoUrl).filter(Boolean) as string[]))
                        const uniqueVideoPublicIds = Array.from(new Set(clips.map(clip => clip.videoPublicId).filter(Boolean) as string[]))
                        
                        console.log('🔗 Merging selected clips:', {
                          clipCount: clipIds.length,
                          videoCount: uniqueVideoUrls.length,
                          videos: uniqueVideoUrls,
                        })
                        
                        if (uniqueVideoUrls.length >= 2) {
                          // Merging clips from DIFFERENT videos
                          console.log('🔗 Merging clips from different videos')
                          
                          try {
                            const response = await fetch('/api/via', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                prompt: `Merge ${clipIds.length} selected clips from ${uniqueVideoUrls.length} different videos into one video`,
                                videoPublicId: uniqueVideoPublicIds[0] || selectedMedia?.publicId || '',
                                videoUrl: uniqueVideoUrls[0] || selectedMedia?.url || '',
                                mediaType: 'video',
                                allMediaUrls: uniqueVideoUrls, // Pass all video URLs from selected clips
                                selectedClips: clips.map(clip => ({
                                  videoUrl: clip.videoUrl,
                                  videoPublicId: clip.videoPublicId,
                                  start: clip.start,
                                  end: clip.end,
                                  name: clip.name,
                                })),
                              }),
                            })
                            
                            const data = await response.json()
                            
                            if (data.videoUrl) {
                              // Add merged video to media items
                              const mergedItem: MediaItem = {
                                url: data.videoUrl,
                                publicId: `merged_${Date.now()}`,
                                type: 'video',
                                name: `Merged Video (${clipIds.length} clips from ${uniqueVideoUrls.length} videos)`
                              }
                              
                              setMediaItems(prev => [...prev, mergedItem])
                              setSelectedMedia(mergedItem)
                              setVideoKey(prev => prev + 1)
                              alert(`✅ Successfully merged ${clipIds.length} clips from ${uniqueVideoUrls.length} videos!`)
                            } else {
                              throw new Error(data.error || 'Merge failed')
                            }
                          } catch (apiError) {
                            console.error('Direct merge API error:', apiError)
                            // Fallback to VIA command
                            const command = `Merge ${clipIds.length} selected clips from ${uniqueVideoUrls.length} different videos`
                            setCommandToInput(command)
                          }
                        } else if (uniqueVideoUrls.length === 1 && selectedMedia?.url) {
                          // Merging clips from same video - use VIA command
                          console.log('🔗 Merging clips from same video:', clipIds)
                          const command = `Merge ${clipIds.length} selected clips from current video into one video`
                          setCommandToInput(command)
                        } else {
                          // Generic merge command
                          const command = `Merge ${clipIds.length} selected clips into one video`
                          setCommandToInput(command)
                        }
                      } catch (error) {
                        console.error('Merge error:', error)
                        const command = `Merge ${clipIds.length} clips together`
                        setCommandToInput(command)
                      }
                    } else if (clipIds.length >= 2) {
                      // Fallback if clips data not provided
                      const command = `Merge ${clipIds.length} selected clips into one video`
                      setCommandToInput(command)
                    }
                  }}
                />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
                <div className="text-6xl mb-4">🎬</div>
                <p className="text-xl text-gray-300 mb-2">No media uploaded yet</p>
                <p className="text-gray-400">Upload videos or images to get started with AI editing</p>
              </div>
            )}
          </div>
        </section>

        {/* Right: VIA Chat */}
        <aside className="backdrop-blur-xl bg-black/30 border border-white/10 rounded-2xl p-4 overflow-hidden shadow-glow flex flex-col">
          <h2 className="text-xl font-semibold mb-4 text-white">VIA Chat</h2>
          <VIAChat 
            videoPublicId={selectedMedia?.publicId || ''}
            videoUrl={selectedMedia?.url}
            mediaType={selectedMedia?.type || 'video'}
            onVideoUpdate={async (url) => {
              console.log('🎬 Dashboard: onVideoUpdate called with URL:', url)
              console.log('🎬 Dashboard: Current selectedMedia:', selectedMedia)
              
              // Validate URL before updating
              if (!url || !url.startsWith('http')) {
                console.error('❌ Dashboard: Invalid URL received:', url)
                return
              }
              
              // CRITICAL: Check if URL is the original (should not happen for processed videos)
              if (url === originalVideoUrl && originalVideoUrl) {
                console.error('❌ Dashboard: Received original URL instead of processed URL!')
                console.error('❌ Dashboard: This should not happen - API should return processed URL')
                console.error('❌ Dashboard: Original URL:', originalVideoUrl)
                console.error('❌ Dashboard: Received URL:', url)
                // Don't update - this is a fallback that shouldn't happen
                return
              }
              
              if (selectedMedia) {
                // Check if URL actually changed
                const urlChanged = url !== selectedMedia.url
                const isOriginal = url === originalVideoUrl
                
                console.log('📊 Dashboard: URL changed:', urlChanged)
                console.log('📊 Dashboard: Is original video:', isOriginal)
                console.log('📊 Dashboard: Original URL:', originalVideoUrl)
                console.log('📊 Dashboard: Previous URL:', selectedMedia.url)
                console.log('📊 Dashboard: New URL:', url)
                
                // IMPORTANT: Only update if URL is different and valid
                if (!urlChanged) {
                  console.log('⚠️ Dashboard: URL unchanged, skipping update')
                  return
                }
                
                // CRITICAL: Verify this is NOT the original URL
                if (isOriginal) {
                  console.error('❌ Dashboard: Attempted to set original URL as processed URL!')
                  console.error('❌ Dashboard: This indicates API returned wrong URL')
                  return
                }
                
                // Add current URL to history before updating
                if (selectedMedia.url && urlChanged) {
                  setEditHistory(prev => {
                    console.log('📚 Dashboard: Added to history:', selectedMedia.url)
                    console.log('📚 Dashboard: History length will be:', prev.length + 1)
                    return [...prev, selectedMedia.url]
                  })
                }
                
                console.log('🎬 Dashboard: Updating mediaItems array')
                const updated = mediaItems.map(item =>
                  item.publicId === selectedMedia.publicId ? { ...item, url } : item
                )
                console.log('🎬 Dashboard: Old mediaItems length:', mediaItems.length)
                console.log('🎬 Dashboard: New mediaItems length:', updated.length)
                console.log('🎬 Dashboard: Updating selectedMedia URL from:', selectedMedia.url)
                console.log('🎬 Dashboard: To:', url)
                
                // CRITICAL: Update videoKey FIRST to force ReactPlayer to completely unmount
                // This ensures the old video element is destroyed before new one is created
                const newVideoKey = videoKey + 1
                console.log('🔄 Dashboard: Incrementing videoKey from', videoKey, 'to', newVideoKey)
                
                // Update state in the correct order to force ReactPlayer remount
                // First update the URL, then update the key to trigger remount
                setMediaItems(updated)
                setSelectedMedia({ ...selectedMedia, url })
                setLastProcessedUrl(url) // Track last processed URL
                
                // Small delay to ensure state updates propagate
                await new Promise(resolve => setTimeout(resolve, 10))
                
                // Then update videoKey to force ReactPlayer to remount with new URL
                setVideoKey(newVideoKey)
                
                console.log('✅ Dashboard: State updated! Video key:', newVideoKey)
                console.log('✅ Dashboard: New URL set:', url)
                console.log('✅ Dashboard: ReactPlayer will remount with key:', newVideoKey, 'and URL:', url)
                console.log('✅ Dashboard: This will force ReactPlayer to load the NEW video, not cached original')
                console.log('✅ Dashboard: URL verification - Original:', originalVideoUrl?.substring(0, 50))
                console.log('✅ Dashboard: URL verification - New:', url.substring(0, 50))
                console.log('✅ Dashboard: URLs are different:', url !== originalVideoUrl)
                
                // Show notification if video was actually processed
                if (urlChanged && !isOriginal) {
                  setProcessingNotification({
                    show: true,
                    message: '✅ Video processed successfully! Your video has been updated.',
                    url: url
                  })
                  console.log('✅ Dashboard: Video processed! New URL:', url)
                  // Auto-hide notification after 5 seconds
                  setTimeout(() => {
                    setProcessingNotification(prev => prev ? { ...prev, show: false } : null)
                  }, 5000)
                } else if (!urlChanged) {
                  console.log('ℹ️ Dashboard: URL unchanged, no processing occurred')
                }
                
                console.log('🎬 Dashboard: State updated! Video key:', videoKey + 1)
              } else {
                console.warn('⚠️ Dashboard: No selectedMedia to update!')
              }
            }}
            externalCommand={externalCommand}
            commandToInput={commandToInput}
            onCommandProcessed={handleCommandProcessed}
            onInputPopulated={() => setCommandToInput('')}
          />
        </aside>
      </div>
    </div>
  )
}
