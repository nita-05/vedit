'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface BrandKit {
  id?: string
  name: string
  logoUrl?: string
  colors: string[]
  fonts: {
    primary?: string
    secondary?: string
  }
  watermark?: string
  preset?: string
}

interface BrandKitsModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectKit: (kit: BrandKit) => void
  onApplyKit: (kit: BrandKit, videoPublicId: string) => void
  videoPublicId?: string
}

export default function BrandKitsModal({ isOpen, onClose, onSelectKit, onApplyKit, videoPublicId }: BrandKitsModalProps) {
  const [brandKits, setBrandKits] = useState<BrandKit[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [editingKit, setEditingKit] = useState<BrandKit | null>(null)
  const [formData, setFormData] = useState<BrandKit>({
    name: '',
    logoUrl: '',
    colors: [],
    fonts: {},
    watermark: '',
    preset: '',
  })
  const [newColor, setNewColor] = useState('#FF0000')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const watermarkInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      fetchBrandKits()
    }
  }, [isOpen])

  const fetchBrandKits = async () => {
    try {
      const response = await fetch('/api/brand-kits')
      const data = await response.json()
      if (data.success) {
        setBrandKits(data.brandKits || [])
      }
    } catch (error) {
      console.error('Failed to fetch brand kits:', error)
    }
  }

  const handleUploadLogo = async (file: File) => {
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      if (data.secure_url) {
        setFormData({ ...formData, logoUrl: data.secure_url })
      }
    } catch (error) {
      console.error('Failed to upload logo:', error)
      alert('Failed to upload logo')
    }
  }

  const handleUploadWatermark = async (file: File) => {
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      if (data.secure_url) {
        setFormData({ ...formData, watermark: data.secure_url })
      }
    } catch (error) {
      console.error('Failed to upload watermark:', error)
      alert('Failed to upload watermark')
    }
  }

  const handleAddColor = () => {
    if (newColor && !formData.colors.includes(newColor)) {
      setFormData({
        ...formData,
        colors: [...formData.colors, newColor],
      })
      setNewColor('#FF0000')
    }
  }

  const handleRemoveColor = (color: string) => {
    setFormData({
      ...formData,
      colors: formData.colors.filter(c => c !== color),
    })
  }

  const handleSave = async () => {
    try {
      const response = await fetch('/api/brand-kits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()
      if (data.success) {
        await fetchBrandKits()
        setIsCreating(false)
        setEditingKit(null)
        setFormData({
          name: '',
          logoUrl: '',
          colors: [],
          fonts: {},
          watermark: '',
          preset: '',
        })
      } else {
        alert(data.error || 'Failed to save brand kit')
      }
    } catch (error) {
      console.error('Failed to save brand kit:', error)
      alert('Failed to save brand kit')
    }
  }

  const handleDelete = async (kitId: string) => {
    if (!confirm('Are you sure you want to delete this brand kit?')) return

    try {
      const response = await fetch(`/api/brand-kits?id=${kitId}`, {
        method: 'DELETE',
      })

      const data = await response.json()
      if (data.success) {
        await fetchBrandKits()
      } else {
        alert(data.error || 'Failed to delete brand kit')
      }
    } catch (error) {
      console.error('Failed to delete brand kit:', error)
      alert('Failed to delete brand kit')
    }
  }

  const handleEdit = (kit: BrandKit) => {
    setEditingKit(kit)
    setFormData(kit)
    setIsCreating(true)
  }

  const handleApply = (kit: BrandKit) => {
    if (videoPublicId) {
      onApplyKit(kit, videoPublicId)
    } else {
      onSelectKit(kit)
    }
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
          className="relative w-full max-w-4xl max-h-[90vh] bg-[rgba(15,15,30,0.95)] backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-vedit-pink to-vedit-blue bg-clip-text text-transparent">
              🎨 Brand Kits
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
                  <label className="block text-sm font-medium text-white mb-2">Brand Kit Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl bg-black/30 border border-white/20 text-white focus:outline-none focus:border-vedit-purple"
                    placeholder="e.g., My Company Brand"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Logo</label>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleUploadLogo(file)
                    }}
                    className="hidden"
                  />
                  <div className="flex items-center gap-4">
                    {formData.logoUrl ? (
                      <div className="relative">
                        <img src={formData.logoUrl} alt="Logo" className="w-24 h-24 object-contain rounded-lg" />
                        <button
                          onClick={() => setFormData({ ...formData, logoUrl: '' })}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full text-white text-xs"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => logoInputRef.current?.click()}
                        className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors"
                      >
                        Upload Logo
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Brand Colors</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="color"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="w-16 h-10 rounded-lg border border-white/20"
                    />
                    <input
                      type="text"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="flex-1 px-4 py-2 rounded-xl bg-black/30 border border-white/20 text-white"
                      placeholder="#FF0000"
                    />
                    <button
                      onClick={handleAddColor}
                      className="px-4 py-2 rounded-xl bg-vedit-purple text-white hover:scale-105 transition-transform"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.colors.map((color, index) => (
                      <div key={index} className="relative group">
                        <div
                          className="w-12 h-12 rounded-lg border-2 border-white/20"
                          style={{ backgroundColor: color }}
                        />
                        <button
                          onClick={() => handleRemoveColor(color)}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Primary Font</label>
                    <input
                      type="text"
                      value={formData.fonts.primary || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        fonts: { ...formData.fonts, primary: e.target.value },
                      })}
                      className="w-full px-4 py-2 rounded-xl bg-black/30 border border-white/20 text-white"
                      placeholder="e.g., Inter, Arial"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Secondary Font</label>
                    <input
                      type="text"
                      value={formData.fonts.secondary || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        fonts: { ...formData.fonts, secondary: e.target.value },
                      })}
                      className="w-full px-4 py-2 rounded-xl bg-black/30 border border-white/20 text-white"
                      placeholder="e.g., Poppins, Roboto"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Watermark</label>
                  <input
                    ref={watermarkInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleUploadWatermark(file)
                    }}
                    className="hidden"
                  />
                  <div className="flex items-center gap-4">
                    {formData.watermark ? (
                      <div className="relative">
                        <img src={formData.watermark} alt="Watermark" className="w-24 h-24 object-contain rounded-lg opacity-50" />
                        <button
                          onClick={() => setFormData({ ...formData, watermark: '' })}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full text-white text-xs"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => watermarkInputRef.current?.click()}
                        className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors"
                      >
                        Upload Watermark
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleSave}
                    className="flex-1 px-4 py-2 rounded-xl bg-gradient-to-r from-vedit-pink to-vedit-purple text-white font-semibold hover:scale-105 transition-transform"
                  >
                    {editingKit ? 'Update' : 'Create'} Brand Kit
                  </button>
                  <button
                    onClick={() => {
                      setIsCreating(false)
                      setEditingKit(null)
                      setFormData({
                        name: '',
                        logoUrl: '',
                        colors: [],
                        fonts: {},
                        watermark: '',
                        preset: '',
                      })
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
                  <p className="text-gray-300">Manage your brand assets and apply them to videos</p>
                  <button
                    onClick={() => setIsCreating(true)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-vedit-pink to-vedit-purple text-white font-semibold hover:scale-105 transition-transform"
                  >
                    + New Brand Kit
                  </button>
                </div>

                {brandKits.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <div className="text-4xl mb-4">🎨</div>
                    <p>No brand kits yet</p>
                    <p className="text-sm mt-2">Create your first brand kit to get started!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {brandKits.map((kit) => (
                      <motion.div
                        key={kit.id}
                        whileHover={{ scale: 1.02 }}
                        className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-vedit-purple/50 transition-all"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="text-lg font-semibold text-white">{kit.name}</h3>
                            {kit.logoUrl && (
                              <img src={kit.logoUrl} alt="Logo" className="w-16 h-16 object-contain mt-2" />
                            )}
                          </div>
                        </div>
                        {kit.colors.length > 0 && (
                          <div className="flex gap-2 mb-3">
                            {kit.colors.map((color, index) => (
                              <div
                                key={index}
                                className="w-8 h-8 rounded border-2 border-white/20"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2 mt-4">
                          {videoPublicId && (
                            <button
                              onClick={() => handleApply(kit)}
                              className="flex-1 px-3 py-2 rounded-lg bg-gradient-to-r from-vedit-purple to-vedit-blue text-white text-sm font-medium hover:scale-105 transition-transform"
                            >
                              Apply
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(kit)}
                            className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm hover:bg-white/20 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => kit.id && handleDelete(kit.id)}
                            className="px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm hover:bg-red-500/30 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </motion.div>
                    ))}
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

