'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface VoiceProfile {
  id?: string
  name: string
  voice: string
  speed?: number
  pitch?: number
  volume?: number
  isDefault?: boolean
  isCloned?: boolean
  voiceSampleUrl?: string
  voiceCloneId?: string
}

interface Voice {
  id: string
  name: string
  gender: string
  description: string
}

interface VIAProfilesModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectProfile: (profile: VoiceProfile) => void
}

export default function VIAProfilesModal({ isOpen, onClose, onSelectProfile }: VIAProfilesModalProps) {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([])
  const [availableVoices, setAvailableVoices] = useState<Voice[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [editingProfile, setEditingProfile] = useState<VoiceProfile | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    voice: 'alloy',
    speed: 1.0,
    pitch: 1.0,
    volume: 0.8,
    isDefault: false,
    isCloned: false,
    voiceSampleUrl: '',
  })
  const [uploadingVoiceSample, setUploadingVoiceSample] = useState(false)
  const [voiceSampleFile, setVoiceSampleFile] = useState<File | null>(null)
  const [ttsScript, setTtsScript] = useState('')
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false)
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null)
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)
  const [ttsModel, setTtsModel] = useState<'tts-1' | 'tts-1-hd'>('tts-1-hd') // Default to HD for better quality
  const [ttsError, setTtsError] = useState<string | null>(null)
  const MAX_TEXT_LENGTH = 4096 // OpenAI TTS limit

  useEffect(() => {
    if (isOpen) {
      fetchProfiles()
    }
  }, [isOpen])

  const fetchProfiles = async () => {
    try {
      const response = await fetch('/api/via-profiles')
      const data = await response.json()
      if (data.success) {
        setProfiles(data.profiles || [])
        setAvailableVoices(data.availableVoices || [])
      }
    } catch (error) {
      console.error('Failed to fetch profiles:', error)
    }
  }

  const handleVoiceSampleUpload = async (file: File) => {
    setUploadingVoiceSample(true)
    try {
      const uploadFormData = new FormData()
      uploadFormData.append('voiceSample', file)
      uploadFormData.append('profileName', formData.name || 'Untitled Voice')

      const response = await fetch('/api/voice-clone', {
        method: 'POST',
        body: uploadFormData,
      })

      const data = await response.json()
      if (data.success) {
        setFormData(prev => ({
          ...prev,
          isCloned: true,
          voiceSampleUrl: data.voiceClone.voiceSampleUrl,
          voiceCloneId: data.voiceClone.id,
        }))
        alert('Voice clone created successfully! You can now use this voice.')
      } else {
        alert(data.error || 'Failed to create voice clone')
      }
    } catch (error) {
      console.error('Voice clone error:', error)
      alert('Failed to create voice clone')
    } finally {
      setUploadingVoiceSample(false)
    }
  }

  const handleSave = async () => {
    try {
      const url = editingProfile?.id ? '/api/via-profiles' : '/api/via-profiles'
      const method = editingProfile?.id ? 'POST' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          profileId: editingProfile?.id,
        }),
      })

      const data = await response.json()
      if (data.success) {
        await fetchProfiles()
        setIsCreating(false)
        setEditingProfile(null)
        setFormData({
          name: '',
          voice: 'alloy',
          speed: 1.0,
          pitch: 1.0,
          volume: 0.8,
          isDefault: false,
          isCloned: false,
          voiceSampleUrl: '',
        })
        setVoiceSampleFile(null)
      } else {
        alert(data.error || 'Failed to save profile')
      }
    } catch (error) {
      console.error('Failed to save profile:', error)
      alert('Failed to save profile')
    }
  }

  const handleDelete = async (profileId: string) => {
    if (!confirm('Are you sure you want to delete this profile?')) return

    try {
      const response = await fetch(`/api/via-profiles?id=${profileId}`, {
        method: 'DELETE',
      })

      const data = await response.json()
      if (data.success) {
        await fetchProfiles()
      } else {
        alert(data.error || 'Failed to delete profile')
      }
    } catch (error) {
      console.error('Failed to delete profile:', error)
      alert('Failed to delete profile')
    }
  }

  const handleEdit = (profile: VoiceProfile) => {
    setEditingProfile(profile)
    setFormData({
      name: profile.name,
      voice: profile.voice,
      speed: profile.speed || 1.0,
      pitch: profile.pitch || 1.0,
      volume: profile.volume || 0.8,
      isDefault: profile.isDefault || false,
      isCloned: profile.isCloned || false,
      voiceSampleUrl: profile.voiceSampleUrl || '',
    })
    setIsCreating(true)
  }

  const handleSelect = (profile: VoiceProfile) => {
    onSelectProfile(profile)
    onClose()
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-4xl max-h-[90vh] bg-[rgba(15,15,30,0.95)] backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-vedit-pink to-vedit-blue bg-clip-text text-transparent">
              🎙️ VIA Voice Profiles
            </h2>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors text-2xl"
            >
              ×
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {isCreating ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Profile Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl bg-black/30 border border-white/20 text-white focus:outline-none focus:border-vedit-purple"
                    placeholder="e.g., Professional Narration"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    🤖 AI Voice Options
                  </label>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {availableVoices.map((voice) => (
                      <button
                        key={voice.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, voice: voice.id })}
                        className={`px-4 py-3 rounded-xl border-2 transition-all text-left ${
                          formData.voice === voice.id
                            ? 'bg-gradient-to-r from-vedit-purple to-vedit-blue border-vedit-purple text-white shadow-lg shadow-vedit-purple/50'
                            : 'bg-black/30 border-white/20 text-white hover:border-vedit-purple/50 hover:bg-black/50'
                        }`}
                      >
                        <div className="font-semibold text-sm">{voice.name}</div>
                        <div className="text-xs opacity-80 mt-1">{voice.gender} • {voice.description}</div>
                      </button>
                    ))}
                  </div>
                  {/* Hidden select for form compatibility */}
                  <select
                    value={formData.voice}
                    onChange={(e) => setFormData({ ...formData, voice: e.target.value })}
                    className="sr-only"
                    aria-hidden="true"
                    tabIndex={-1}
                  >
                    {availableVoices.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name} ({voice.gender}) - {voice.description}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-2">
                    💡 Select an AI voice from OpenAI TTS. All voices support natural speech generation with customizable speed.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Speed (0.25-4.0)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.25"
                      max="4.0"
                      value={formData.speed}
                      onChange={(e) => setFormData({ ...formData, speed: parseFloat(e.target.value) || 1.0 })}
                      className="w-full px-4 py-2 rounded-xl bg-black/30 border border-white/20 text-white focus:outline-none focus:border-vedit-purple"
                    />
                    <p className="text-xs text-gray-400 mt-1">OpenAI TTS supports 0.25x to 4.0x speed</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Pitch</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      max="2.0"
                      value={formData.pitch}
                      onChange={(e) => setFormData({ ...formData, pitch: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 rounded-xl bg-black/30 border border-white/20 text-white focus:outline-none focus:border-vedit-purple"
                      disabled
                    />
                    <p className="text-xs text-gray-500 mt-1">Note: OpenAI TTS doesn't support pitch</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Volume</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      value={formData.volume}
                      onChange={(e) => setFormData({ ...formData, volume: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 rounded-xl bg-black/30 border border-white/20 text-white focus:outline-none focus:border-vedit-purple"
                      disabled
                    />
                    <p className="text-xs text-gray-500 mt-1">Note: OpenAI TTS doesn't support volume</p>
                  </div>
                </div>

                {/* Voice Cloning Section */}
                <div className="p-4 bg-vedit-purple/10 border border-vedit-purple/30 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-white">🎤 Voice Cloning</label>
                    <span className={`text-xs px-2 py-1 rounded ${
                      formData.isCloned ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {formData.isCloned ? 'Cloned Voice' : 'Standard Voice'}
                    </span>
                  </div>
                  
                  {!formData.isCloned ? (
                    <div>
                      <label className="block text-xs text-gray-300 mb-2">
                        Upload a voice sample (audio file, 30-60 seconds recommended)
                      </label>
                      <input
                        type="file"
                        accept="audio/*,video/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            setVoiceSampleFile(file)
                            handleVoiceSampleUpload(file)
                          }
                        }}
                        disabled={uploadingVoiceSample}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-black/30 border border-white/10 text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-vedit-purple/20 file:text-white hover:file:bg-vedit-purple/30 disabled:opacity-50"
                      />
                      {uploadingVoiceSample && (
                        <p className="text-xs text-gray-400 mt-2">⏳ Creating voice clone...</p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        💡 Upload a clear audio sample to create an AI-generated voice clone
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-green-400">✓ Voice clone created successfully!</p>
                      {formData.voiceSampleUrl && (
                        <audio controls src={formData.voiceSampleUrl} className="w-full h-8" />
                      )}
                      <button
                        onClick={() => {
                          setFormData(prev => ({ ...prev, isCloned: false, voiceSampleUrl: '', voiceCloneId: undefined }))
                          setVoiceSampleFile(null)
                        }}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove voice clone
                      </button>
                    </div>
                  )}
                </div>

                {/* Text-to-Speech Section */}
                <div className="p-4 bg-vedit-blue/10 border border-vedit-blue/30 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-white">🎤 Generate Voice Over (OpenAI TTS)</label>
                  </div>
                  
                  {/* Model Selection */}
                  <div className="mb-3 flex items-center gap-3">
                    <label className="text-xs text-gray-300">Model:</label>
                    <select
                      value={ttsModel}
                      onChange={(e) => setTtsModel(e.target.value as 'tts-1' | 'tts-1-hd')}
                      className="px-2 py-1 rounded-lg bg-black/30 border border-white/10 text-white text-xs focus:outline-none focus:border-vedit-blue"
                    >
                      <option value="tts-1">tts-1 (Faster)</option>
                      <option value="tts-1-hd">tts-1-hd (Better Quality)</option>
                    </select>
                    <span className="text-xs text-gray-400">
                      Speed: {formData.speed}x (0.25-4.0)
                    </span>
                  </div>
                  
                  <textarea
                    value={ttsScript}
                    onChange={(e) => {
                      setTtsScript(e.target.value)
                      setTtsError(null) // Clear error on input
                    }}
                    placeholder="Enter text to generate voiceover using OpenAI TTS..."
                    className={`w-full px-3 py-2 rounded-lg bg-black/30 border ${
                      ttsScript.length > MAX_TEXT_LENGTH 
                        ? 'border-red-500/50' 
                        : 'border-white/10'
                    } text-white text-sm focus:outline-none focus:border-vedit-blue mb-2 resize-none`}
                    rows={3}
                    maxLength={MAX_TEXT_LENGTH + 100} // Allow slight overflow for warning
                  />
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs ${
                      ttsScript.length > MAX_TEXT_LENGTH 
                        ? 'text-red-400' 
                        : ttsScript.length > MAX_TEXT_LENGTH * 0.9
                        ? 'text-yellow-400'
                        : 'text-gray-400'
                    }`}>
                      {ttsScript.length} / {MAX_TEXT_LENGTH} characters
                      {ttsScript.length > MAX_TEXT_LENGTH && ' (Exceeds limit!)'}
                    </span>
                    {ttsError && (
                      <span className="text-xs text-red-400">{ttsError}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (!ttsScript.trim()) {
                          alert('Please enter text to generate voiceover')
                          return
                        }
                        // Validate text length before sending
                        if (ttsScript.length > MAX_TEXT_LENGTH) {
                          setTtsError(`Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters. Please shorten your text.`)
                          return
                        }

                        setIsGeneratingVoice(true)
                        setTtsError(null)
                        setGeneratedAudioUrl(null) // Clear previous audio
                        
                        try {
                          // Use OpenAI TTS API for high-quality voice generation
                          console.log('🎤 Generating voice with OpenAI TTS...', {
                            text: ttsScript.substring(0, 50) + '...',
                            voice: formData.voice,
                            speed: formData.speed,
                            model: ttsModel,
                            length: ttsScript.length,
                          })

                          // Retry logic for transient errors
                          let retries = 2
                          let lastError: any = null
                          
                          while (retries >= 0) {
                            try {
                              const response = await fetch('/api/tts', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  text: ttsScript,
                                  voice: formData.voice, // OpenAI voice: alloy, echo, fable, onyx, nova, shimmer
                                  model: ttsModel, // User-selected model: tts-1 or tts-1-hd
                                  speed: Math.max(0.25, Math.min(4.0, formData.speed)), // Clamp to OpenAI's range (0.25-4.0)
                                }),
                              })

                              const data = await response.json()
                              
                              if (data.success && data.audioUrl) {
                                console.log('✅ Voice generated successfully:', data.audioUrl)
                                setGeneratedAudioUrl(data.audioUrl)
                                const audio = new Audio(data.audioUrl)
                                setAudioElement(audio)
                                
                                // Show warning if using fallback storage
                                if (data.warning) {
                                  console.warn('⚠️', data.warning)
                                }
                                break // Success, exit retry loop
                              } else {
                                throw new Error(data.error || data.details || 'Failed to generate voice')
                              }
                            } catch (fetchError: any) {
                              lastError = fetchError
                              // Only retry on network errors or 5xx errors
                              if (retries > 0 && (
                                fetchError.message?.includes('fetch') || 
                                fetchError.message?.includes('network') ||
                                fetchError.status >= 500
                              )) {
                                console.log(`⚠️ Retry attempt ${3 - retries}...`)
                                await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1s before retry
                                retries--
                              } else {
                                throw fetchError
                              }
                            }
                          }
                          
                          if (lastError && !generatedAudioUrl) {
                            throw lastError
                          }
                        } catch (error: any) {
                          console.error('❌ TTS error:', error)
                          const errorMessage = error?.message || error?.error || 'Failed to generate voice. Please check your OpenAI API key and try again.'
                          setTtsError(errorMessage)
                          
                          // Show alert for critical errors
                          if (error?.status === 401 || error?.status === 429) {
                            alert(errorMessage)
                          }
                        } finally {
                          setIsGeneratingVoice(false)
                        }
                      }}
                      disabled={isGeneratingVoice || !ttsScript.trim() || ttsScript.length > MAX_TEXT_LENGTH}
                      className="flex-1 px-3 py-2 rounded-lg bg-gradient-to-r from-vedit-blue to-vedit-purple text-white text-sm font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isGeneratingVoice ? (
                        <span className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Generating...
                        </span>
                      ) : (
                        '🎤 Generate Voice'
                      )}
                    </button>
                    {generatedAudioUrl && audioElement && (
                      <>
                        <button
                          onClick={() => {
                            if (audioElement.paused) {
                              audioElement.play()
                            } else {
                              audioElement.pause()
                            }
                          }}
                          className="px-3 py-2 rounded-lg bg-green-500/20 border border-green-500/50 text-green-400 text-sm hover:bg-green-500/30 transition-colors"
                        >
                          ▶️ Play
                        </button>
                        <button
                          onClick={async () => {
                            if (!generatedAudioUrl) return
                            try {
                              // Download from Cloudinary URL
                              const response = await fetch(generatedAudioUrl)
                              const blob = await response.blob()
                              const url = window.URL.createObjectURL(blob)
                              const link = document.createElement('a')
                              link.href = url
                              link.download = `voiceover_${Date.now()}.mp3`
                              document.body.appendChild(link)
                              link.click()
                              document.body.removeChild(link)
                              window.URL.revokeObjectURL(url)
                            } catch (error) {
                              console.error('Download error:', error)
                              // Fallback: open in new tab
                              window.open(generatedAudioUrl, '_blank')
                            }
                          }}
                          className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm hover:bg-white/20 transition-colors"
                        >
                          ⬇️ Download
                        </button>
                      </>
                    )}
                  </div>
                  {isGeneratingVoice && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                      <div className="w-4 h-4 border-2 border-vedit-blue border-t-transparent rounded-full animate-spin"></div>
                      <span>Generating voiceover...</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isDefault"
                    checked={formData.isDefault}
                    onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                    className="w-4 h-4 rounded border-white/20"
                  />
                  <label htmlFor="isDefault" className="text-sm text-white">
                    Set as default profile
                  </label>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleSave}
                    className="flex-1 px-4 py-2 rounded-xl bg-gradient-to-r from-vedit-pink to-vedit-purple text-white font-semibold hover:scale-105 transition-transform"
                  >
                    {editingProfile ? 'Update' : 'Create'} Profile
                  </button>
                  <button
                    onClick={() => {
                      setIsCreating(false)
                      setEditingProfile(null)
                      setFormData({
                        name: '',
                        voice: 'alloy',
                        speed: 1.0,
                        pitch: 1.0,
                        volume: 0.8,
                        isDefault: false,
                        isCloned: false,
                        voiceSampleUrl: '',
                      })
                      setVoiceSampleFile(null)
                    }}
                    className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-4">
                  <p className="text-gray-300">Manage your voice profiles for AI voiceovers</p>
                  <button
                    onClick={() => setIsCreating(true)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-vedit-pink to-vedit-purple text-white font-semibold hover:scale-105 transition-transform"
                  >
                    + New Profile
                  </button>
                </div>

                {profiles.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <div className="text-4xl mb-4">🎙️</div>
                    <p>No voice profiles yet</p>
                    <p className="text-sm mt-2">Create your first profile to get started!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {profiles.map((profile) => {
                      const voiceInfo = availableVoices.find(v => v.id === profile.voice)
                      return (
                        <motion.div
                          key={profile.id}
                          whileHover={{ scale: 1.02 }}
                          className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-vedit-purple/50 transition-all"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="text-lg font-semibold text-white">
                                {profile.name}
                                {profile.isDefault && (
                                  <span className="ml-2 text-xs bg-vedit-purple/20 text-vedit-purple px-2 py-1 rounded">
                                    Default
                                  </span>
                                )}
                              </h3>
                              <p className="text-sm text-gray-400 mt-1">
                                {voiceInfo?.name} ({voiceInfo?.gender})
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-4">
                            <button
                              onClick={() => handleSelect(profile)}
                              className="flex-1 px-3 py-2 rounded-lg bg-gradient-to-r from-vedit-purple to-vedit-blue text-white text-sm font-medium hover:scale-105 transition-transform"
                            >
                              Use
                            </button>
                            <button
                              onClick={() => handleEdit(profile)}
                              className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm hover:bg-white/20 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => profile.id && handleDelete(profile.id)}
                              className="px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm hover:bg-red-500/30 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

