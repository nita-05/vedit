'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { EffectTemplate, getTemplateCategories } from '@/lib/templates'

interface TemplatesPanelProps {
  isOpen: boolean
  onClose: () => void
  videoPublicId: string
  videoUrl?: string
  onApplyTemplate: (operations: Array<{ operation: string; params: any }>) => void
}

export default function TemplatesPanel({
  isOpen,
  onClose,
  videoPublicId,
  videoUrl,
  onApplyTemplate,
}: TemplatesPanelProps) {
  const [templates, setTemplates] = useState<EffectTemplate[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      // Reset applying state when panel closes
      setApplyingTemplateId(null)
      return
    }

    const fetchTemplates = async () => {
      try {
        const response = await fetch('/api/templates')
        const data = await response.json()

        if (data.success) {
          setTemplates(data.templates || [])
          setCategories(data.categories || [])
        }
      } catch (error) {
        console.error('Failed to fetch templates:', error)
      }
    }

    fetchTemplates()
  }, [isOpen])

  const handleApplyTemplate = async (template: EffectTemplate) => {
    if (!videoPublicId) {
      alert('Please upload a video first')
      return
    }

    if (!videoUrl) {
      alert('Video is not ready. Please wait for video to load.')
      return
    }

    // Prevent multiple clicks
    if (applyingTemplateId !== null) {
      return
    }

    // Set loading state for this specific template only
    console.log('🎨 Setting applying state for template:', template.id)
    setApplyingTemplateId(template.id)
    
    try {
      // Apply template operations (now uses batch processing for speed)
      await onApplyTemplate(template.operations)
      
      // Wait a bit for the video to update, then close panel
      setTimeout(() => {
        setApplyingTemplateId(null)
        onClose()
      }, 1000)
    } catch (error: any) {
      console.error('Failed to apply template:', error)
      alert(`Failed to apply template: ${error?.message || 'Unknown error'}. Please try again.`)
      setApplyingTemplateId(null)
    }
  }

  const filteredTemplates = selectedCategory
    ? templates.filter((t) => t.category === selectedCategory)
    : templates

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
        className="bg-black/90 border border-white/20 rounded-2xl p-6 max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">🎨 Effect Templates</h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors text-2xl"
          >
            ✕
          </button>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-4 py-2 rounded-xl transition-all ${
              selectedCategory === null
                ? 'bg-gradient-to-r from-vedit-pink to-vedit-purple text-white'
                : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-xl transition-all capitalize ${
                selectedCategory === category
                  ? 'bg-gradient-to-r from-vedit-pink to-vedit-purple text-white'
                  : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Templates Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => (
            <motion.div
              key={template.id}
              whileHover={{ scale: 1.02 }}
              className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-vedit-purple/50 transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-semibold text-white">{template.name}</h3>
                <span className="text-xs px-2 py-1 bg-vedit-purple/20 text-vedit-purple rounded-full capitalize">
                  {template.category}
                </span>
              </div>
              <p className="text-sm text-white/60 mb-4">{template.description}</p>
              <div className="flex items-center gap-2 text-xs text-white/40 mb-4">
                <span>{template.operations.length} effects</span>
              </div>
              <button
                onClick={() => {
                  console.log('🔘 Button clicked for template:', template.id, 'Current applying:', applyingTemplateId)
                  handleApplyTemplate(template)
                }}
                disabled={(applyingTemplateId !== null && applyingTemplateId !== template.id) || !videoPublicId}
                className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-vedit-purple to-vedit-blue text-white font-semibold hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {applyingTemplateId === template.id ? 'Applying...' : 'Apply Template'}
              </button>
            </motion.div>
          ))}
        </div>

        {filteredTemplates.length === 0 && (
          <div className="text-center py-12 text-white/60">
            <p>No templates found in this category.</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

