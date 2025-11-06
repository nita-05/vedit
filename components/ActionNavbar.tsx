'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'

interface ActionNavbarProps {
  onFeatureClick: (command: string) => void // For auto-sending (backward compatibility)
  onFeatureToInput?: (command: string) => void // For populating chat input (new)
  onSave?: () => void
  onExport?: () => void
  onDownload?: () => void // Download current edited video
  onShare?: () => void // Share current edited video
  onPublish?: () => void
  onOpenVIAProfiles?: () => void // Open VIA Profiles modal
  onOpenBrandKits?: () => void // Open Brand Kits modal
  onOpenPreview?: () => void // Open Preview panel
  onOpenTemplates?: () => void // Open Templates panel
  onOpenAutoEnhance?: () => void // Open Auto-Enhance panel
}

const textPresets = [
  'Minimal', 'Bold', 'Cinematic', 'Retro', 'Handwritten', 'Neon Glow', 
  'Typewriter', 'Glitch', 'Subtitle', 'Lower Third', 'Gradient', 'Fade-In Title',
  '3D Text', 'Caption Overlay', 'Shadowed', 'Animated Quote', 'Headline',
  'Modern Sans', 'Serif Classic', 'Story Caption', 'Kinetic Title', 'News Banner',
  'Outline Text', 'Glow Edge', 'Floating Text'
]

const effectPresets = [
  'Blur', 'Glow', 'VHS', 'Motion', 'Film Grain', 'Lens Flare',
  'Bokeh', 'Light Leak', 'Pixelate', 'Distortion', 'Chromatic Aberration',
  'Shake', 'Sparkle', 'Shadow Pulse', 'Dreamy Glow', 'Glitch Flicker',
  'Zoom-In Pulse', 'Soft Focus', 'Old Film', 'Dust Overlay', 'Light Rays',
  'Mirror', 'Tilt Shift', 'Fisheye', 'Bloom'
]

const transitionPresets = [
  'Fade', 'Slide', 'Wipe', 'Zoom', 'Cross Dissolve', 'Blur In/Out',
  'Spin', 'Morph Cut', 'Split Reveal', 'Flash', 'Zoom Blur', 'Cube Rotate',
  '3D Flip', 'Warp', 'Ripple', 'Glitch Transition', 'Luma Fade',
  'Light Sweep', 'Stretch Pull', 'Film Roll', 'Page Turn', 'Diagonal Wipe',
  'Motion Blur Transition', 'Cinematic Cut'
]

const musicPresets = [
  'Ambient', 'Upbeat', 'Emotional', 'Action', 'Chill', 'Techno',
  'Cinematic Epic', 'Lo-Fi', 'Trap Beat', 'Corporate', 'Pop', 'Hip-Hop',
  'Retro Synth', 'Acoustic', 'Inspirational', 'Piano Mood', 'Dark Tension',
  'Happy Vibe', 'Travel Theme', 'Dramatic Rise', 'Fast Cut Beat', 'EDM Drop',
  'Dream Pop', 'Sad Violin', 'Percussive Hit', 'Calm Nature Ambience'
]

const colorPresets = [
  'Warm', 'Cool', 'Vintage', 'Moody', 'Teal-Orange', 'Noir',
  'Sepia', 'Dreamy', 'Pastel', 'Vibrant', 'Muted', 'Cyberpunk',
  'Neon', 'Golden Hour', 'High Contrast', 'Washed Film', 'Studio Tone',
  'Soft Skin', 'Shadow Boost', 'Natural Tone', 'Bright Punch', 'Black & White',
  'Orange Tint', 'Monochrome', 'Cinematic LUT', 'Sunset Glow'
]

const brandKitPresets = [
  'Saved Brand Presets', 'Custom Font Sets', 'Logo Overlay', 'Watermark',
  'Brand Colors', 'Outro Template', 'Title Template', 'Intro Animation',
  'Font Pairing', 'Theme Presets', 'Typography Sets', 'Default Layouts',
  'Auto Caption Style', 'Font Color Presets', 'Saved LUTs', 'Signature Animation',
  'Motion Logo', 'Auto Outro Builder', 'Font Harmony Set', 'Voice Style Sync'
]

const features = [
  { 
    icon: '🅣', 
    label: 'Text', 
    presets: textPresets,
    commandPrefix: 'Apply'
  },
  { 
    icon: '✨', 
    label: 'Effects', 
    presets: effectPresets,
    commandPrefix: 'Apply'
  },
  { 
    icon: '🎬', 
    label: 'Transitions', 
    presets: transitionPresets,
    commandPrefix: 'Apply'
  },
  { 
    icon: '🎧', 
    label: 'Music', 
    presets: musicPresets,
    commandPrefix: 'Add'
  },
  { 
    icon: '🎨', 
    label: 'Color', 
    presets: colorPresets,
    commandPrefix: 'Apply'
  },
]

export default function ActionNavbar({ onFeatureClick, onFeatureToInput, onSave, onExport, onDownload, onShare, onPublish, onOpenVIAProfiles, onOpenBrandKits, onOpenPreview, onOpenTemplates, onOpenAutoEnhance }: ActionNavbarProps) {
  const { data: session } = useSession()
  const router = useRouter()
  const [imageError, setImageError] = useState(false)
  const [activePanel, setActivePanel] = useState<string | null>(null)
  const [panelPosition, setPanelPosition] = useState<{ [key: string]: { left: number; top: number } }>({})
  const panelRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({})
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement | null>(null)

  // Update panel position when active panel changes
  useEffect(() => {
    if (activePanel) {
      const button = buttonRefs.current[activePanel]
      if (button) {
        const rect = button.getBoundingClientRect()
        const viewportHeight = window.innerHeight
        const spaceBelow = viewportHeight - rect.bottom - 16
        const spaceAbove = rect.top - 16
        
        // Determine best position: below by default, above if not enough space
        let panelTop = rect.bottom + 8
        
        // Try to fit below first
        if (spaceBelow < 400 && spaceAbove > spaceBelow) {
          // Not enough space below, try above
          panelTop = rect.top - 400 - 8
          // If still doesn't fit, use available space
          if (panelTop < 0) {
            panelTop = 16
          }
        }
        
        setPanelPosition({
          [activePanel]: {
            left: rect.left,
            top: panelTop,
          },
        })
      }
    }
  }, [activePanel])

  // Update position on scroll/resize
  useEffect(() => {
    const updatePosition = () => {
      if (activePanel) {
        const button = buttonRefs.current[activePanel]
        if (button) {
          const rect = button.getBoundingClientRect()
          const viewportHeight = window.innerHeight
          const spaceBelow = viewportHeight - rect.bottom - 16
          const spaceAbove = rect.top - 16
          
          // Determine best position: below by default, above if not enough space
          let panelTop = rect.bottom + 8
          
          // Try to fit below first
          if (spaceBelow < 400 && spaceAbove > spaceBelow) {
            // Not enough space below, try above
            panelTop = rect.top - 400 - 8
            // If still doesn't fit, use available space
            if (panelTop < 0) {
              panelTop = 16
            }
          }
          
          setPanelPosition({
            [activePanel]: {
              left: rect.left,
              top: panelTop,
            },
          })
        }
      }
    }

    if (activePanel) {
      window.addEventListener('scroll', updatePosition, true)
      window.addEventListener('resize', updatePosition)
      updatePosition()
      return () => {
        window.removeEventListener('scroll', updatePosition, true)
        window.removeEventListener('resize', updatePosition)
      }
    }
  }, [activePanel])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (activePanel) {
        const activeRef = panelRefs.current[activePanel]
        if (activeRef && !activeRef.contains(event.target as Node)) {
          const button = buttonRefs.current[activePanel]
          if (button && !button.contains(event.target as Node)) {
            setActivePanel(null)
          }
        }
      }
      
      // Close more menu if clicking outside
      if (isMoreMenuOpen && moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setIsMoreMenuOpen(false)
      }
    }

    if (activePanel || isMoreMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [activePanel, isMoreMenuOpen])

  const handlePresetClick = (feature: typeof features[0], preset: string) => {
    // Generate natural language commands that VIA Assistant can understand
    let command = ''
    
    switch (feature.label) {
      case 'Text':
        command = `Apply ${preset} text style to the video`
        break
      case 'Effects':
        command = `Add ${preset} effect to the video`
        break
      case 'Transitions':
        command = `Apply ${preset} transition between clips`
        break
      case 'Music':
        command = `Add ${preset} background music to the video`
        break
      case 'Color':
        command = `Apply ${preset} color grading to the video`
        break
      default:
        command = `${feature.commandPrefix} ${preset} ${feature.label.toLowerCase()} to the video`
    }
    
    // Populate input field for user to review/edit before sending
    if (onFeatureToInput) {
      console.log('📢 ActionNavbar: Populating input with command:', command)
      onFeatureToInput(command)
    }
    
    setActivePanel(null)
  }

  const togglePanel = (featureLabel: string) => {
    // If clicking the same button, toggle the panel
    // If clicking a different button, open that panel
    if (activePanel === featureLabel) {
      setActivePanel(null)
    } else {
      setActivePanel(featureLabel)
    }
  }

  const handleFeatureButtonClick = (feature: typeof features[0]) => {
    // Generate a command that triggers interactive questions
    let command = ''
    
    switch (feature.label) {
      case 'Text':
        command = 'I want to add text - please ask me what text content, style, position, size, and other options I want'
        break
      case 'Effects':
        command = 'I want to add an effect - please ask me which effect, intensity, and where to apply it'
        break
      case 'Transitions':
        command = 'I want to add a transition - please ask me which transition type, duration, and when to apply it'
        break
      case 'Music':
        command = 'I want to add music - please ask me which music style, volume level, and timing options'
        break
      case 'Color':
        command = 'I want to apply color grading - please ask me which color style and intensity I prefer'
        break
      default:
        command = `I want to apply ${feature.label.toLowerCase()} - please ask me for options`
    }
    
    // Populate input field so user can edit and specify details
    if (onFeatureToInput) {
      console.log('📢 ActionNavbar: Feature button clicked, populating input with:', command)
      onFeatureToInput(command)
    }
    
    // Also open the panel to show presets as an alternative
    setActivePanel(activePanel === feature.label ? null : feature.label)
  }

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 px-2 sm:px-4 py-2 sm:py-3 backdrop-blur-[12px] bg-[rgba(15,15,30,0.6)] border-b border-white/8">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Feature Tabs */}
          <div className="flex-1 flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide min-w-0">
            {features.map((feature, index) => (
              <div key={feature.label} className="relative">
                <motion.button
                  ref={(el) => {
                    if (el) buttonRefs.current[feature.label] = el
                  }}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleFeatureButtonClick(feature)}
                  className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl transition-all duration-300 group relative whitespace-nowrap flex-shrink-0 ${
                    activePanel === feature.label
                      ? 'bg-white/15 border border-vedit-purple/50 shadow-glow'
                      : 'bg-white/5 hover:bg-white/10 border border-white/10 hover:border-vedit-purple/30'
                  }`}
                >
                  <span className="text-lg sm:text-xl">{feature.icon}</span>
                  <span className="text-xs sm:text-sm text-white font-medium whitespace-nowrap">
                    {feature.label}
                  </span>
                  {activePanel === feature.label && (
                    <motion.div
                      initial={{ rotate: 0 }}
                      animate={{ rotate: 180 }}
                      className="text-white"
                    >
                      ▼
                    </motion.div>
                  )}
                  {/* Glow effect */}
                  <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 bg-gradient-to-r from-vedit-pink/20 via-vedit-purple/20 to-vedit-blue/20 blur-sm transition-opacity duration-300 -z-10" />
                </motion.button>

                {/* Subpanel */}
                <AnimatePresence>
                  {activePanel === feature.label && panelPosition[feature.label] && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="fixed min-w-[280px] backdrop-blur-xl bg-[rgba(15,15,30,0.95)] border border-white/20 rounded-xl shadow-2xl p-4 z-[100] overflow-y-auto"
                      style={{
                        left: `${panelPosition[feature.label].left}px`,
                        top: `${panelPosition[feature.label].top}px`,
                        maxHeight: 'calc(100vh - 120px)',
                      }}
                      ref={(el) => {
                        if (el) panelRefs.current[feature.label] = el
                      }}
                    >
                      <div className="grid grid-cols-2 gap-2">
                        {feature.presets.map((preset) => (
                          <motion.button
                            key={preset}
                            whileHover={{ scale: 1.05, x: 4 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handlePresetClick(feature, preset)}
                            className="px-3 py-2 text-left text-sm text-white/90 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-vedit-purple/50 rounded-lg transition-all duration-200"
                          >
                            {preset}
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

          {/* Right: V-Port Actions & User Info */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-1 sm:gap-2 flex-shrink-0"
          >
            {/* Primary Actions - Always Visible */}
            <div className="hidden md:flex items-center gap-1 sm:gap-1.5">
              {/* Essential Features - Compact */}
              {onOpenTemplates && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onOpenTemplates}
                  className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-vedit-purple/50 text-white text-xs font-medium transition-all duration-200"
                  title="Effect Templates"
                >
                  🎨
                </motion.button>
              )}
              {onOpenAutoEnhance && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onOpenAutoEnhance}
                  className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-vedit-pink/50 text-white text-xs font-medium transition-all duration-200"
                  title="Smart Auto-Enhance"
                >
                  🤖
                </motion.button>
              )}
              
              {/* Project Actions */}
              <div className="h-5 w-px bg-white/10 mx-0.5" />
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onSave}
                className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-vedit-blue/50 text-white text-xs font-medium transition-all duration-200"
                title="Save Project"
              >
                💾
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onExport}
                className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-vedit-purple/50 text-white text-xs font-medium transition-all duration-200"
                title="Export Video"
              >
                📤
              </motion.button>
              
              {/* More Menu Button */}
              <div className="relative" ref={moreMenuRef}>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                  className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-vedit-purple/50 text-white text-xs font-medium transition-all duration-200"
                  title="More Options"
                >
                  ⋮
                </motion.button>
                
                {/* More Menu Dropdown */}
                <AnimatePresence>
                  {isMoreMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      className="absolute right-0 top-full mt-2 w-48 backdrop-blur-xl bg-[rgba(15,15,30,0.95)] border border-white/20 rounded-xl shadow-2xl p-2 z-[100]"
                    >
                      {onOpenPreview && (
                        <button
                          onClick={() => {
                            onOpenPreview()
                            setIsMoreMenuOpen(false)
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200 flex items-center gap-2"
                        >
                          👁️ Preview
                        </button>
                      )}
                      {onOpenVIAProfiles && (
                        <button
                          onClick={() => {
                            onOpenVIAProfiles()
                            setIsMoreMenuOpen(false)
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200 flex items-center gap-2"
                        >
                          🎙️ Profiles
                        </button>
                      )}
                      {onOpenBrandKits && (
                        <button
                          onClick={() => {
                            onOpenBrandKits()
                            setIsMoreMenuOpen(false)
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200 flex items-center gap-2"
                        >
                          🎨 Brands
                        </button>
                      )}
                      {onDownload && (
                        <button
                          onClick={() => {
                            onDownload()
                            setIsMoreMenuOpen(false)
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200 flex items-center gap-2"
                        >
                          ⬇️ Download
                        </button>
                      )}
                      {onShare && (
                        <button
                          onClick={() => {
                            onShare()
                            setIsMoreMenuOpen(false)
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200 flex items-center gap-2"
                        >
                          🔗 Share
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onPublish}
                className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-gradient-to-r from-vedit-pink/80 via-vedit-purple/80 to-vedit-blue/80 hover:from-vedit-pink hover:via-vedit-purple hover:to-vedit-blue text-white text-xs font-semibold transition-all duration-200 shadow-glow"
                title="Publish to Social Media"
              >
                <span className="hidden sm:inline">🚀 Publish</span>
                <span className="sm:hidden">🚀</span>
              </motion.button>
            </div>

            {/* Mobile V-Port Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onPublish}
              className="md:hidden px-3 py-2 rounded-lg bg-gradient-to-r from-vedit-pink/80 via-vedit-purple/80 to-vedit-blue/80 text-white text-xs font-semibold shadow-glow"
            >
              🚀
            </motion.button>

            {/* User Info */}
            <div className="hidden lg:flex items-center gap-2">
              {session?.user?.image && !imageError ? (
                <Image
                  src={session.user.image}
                  alt={session.user?.name || 'Profile'}
                  width={32}
                  height={32}
                  className="rounded-full border-2 border-vedit-purple/50 shadow-glow object-cover"
                  unoptimized
                  onError={() => {
                    console.error('Failed to load profile image:', session.user?.image)
                    setImageError(true)
                  }}
                />
              ) : (
                <div className="w-8 h-8 rounded-full border-2 border-vedit-purple/50 shadow-glow bg-vedit-purple/50 flex items-center justify-center text-white text-xs font-semibold">
                  {session?.user?.name?.[0] || 'U'}
                </div>
              )}
              <span className="text-sm text-white font-medium">
                {session?.user?.name?.split(' ')[0] || 'User'} 👋
              </span>
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
              className="px-3 sm:px-4 py-2 rounded-lg bg-gradient-to-r from-vedit-pink via-vedit-purple to-vedit-blue text-white text-xs sm:text-sm font-semibold hover:scale-105 transition-transform duration-300 shadow-glow"
            >
              <span className="hidden sm:inline">Logout</span>
              <span className="sm:hidden">Out</span>
            </button>
          </motion.div>
        </div>
      </nav>

      {/* Backdrop overlay when panel is open */}
      <AnimatePresence>
        {activePanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActivePanel(null)}
            className="fixed inset-0 z-[90] bg-black/20"
            style={{ pointerEvents: 'auto' }}
          />
        )}
      </AnimatePresence>
    </>
  )
}