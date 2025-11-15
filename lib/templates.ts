/**
 * Effect Templates Library
 * Pre-made effect combinations for one-click professional looks
 */

export interface EffectTemplate {
  id: string
  name: string
  description: string
  category: 'cinematic' | 'vlog' | 'product' | 'social' | 'corporate' | 'creative'
  thumbnail?: string
  operations: Array<{
    operation: string
    params: any
  }>
  previewUrl?: string
}

export const EFFECT_TEMPLATES: EffectTemplate[] = [
  {
    id: 'cinematic-intro',
    name: 'Cinematic Intro',
    description: 'Professional cinematic opening with dramatic color grading and bold title',
    category: 'cinematic',
    operations: [
      {
        operation: 'colorGrade',
        params: { preset: 'cinematic' },
      },
      {
        operation: 'addText',
        params: {
          text: 'WELCOME',
          preset: 'Bold',
          position: 'center',
          fontSize: 72,
          fontColor: 'white',
        },
      },
      {
        operation: 'applyEffect',
        params: { preset: 'dreamy glow', intensity: 0.7 },
      },
    ],
  },
  {
    id: 'vlog-style',
    name: 'Vlog Style',
    description: 'Bright, vibrant look perfect for vlogs and lifestyle content',
    category: 'vlog',
    operations: [
      {
        operation: 'colorGrade',
        params: { preset: 'golden hour' },
      },
      {
        operation: 'applyEffect',
        params: { preset: 'soft focus', intensity: 0.3 },
      },
    ],
  },
  {
    id: 'product-showcase',
    name: 'Product Showcase',
    description: 'Clean, professional look with subtle effects for product videos',
    category: 'product',
    operations: [
      {
        operation: 'colorGrade',
        params: { preset: 'studio tone' },
      },
      // Removed sharpen effect - FFmpeg not available on Vercel, keeping only color grade for reliability
    ],
  },
  {
    id: 'social-media-ready',
    name: 'Social Media Ready',
    description: 'Vibrant, eye-catching style optimized for social platforms',
    category: 'social',
    operations: [
      {
        operation: 'colorGrade',
        params: { preset: 'vibrant' },
      },
      {
        operation: 'applyEffect',
        params: { preset: 'glow', intensity: 0.6 },
      },
    ],
  },
  {
    id: 'corporate-professional',
    name: 'Corporate Professional',
    description: 'Clean, professional look for business and corporate content',
    category: 'corporate',
    operations: [
      {
        operation: 'colorGrade',
        params: { preset: 'natural tone' },
      },
      {
        operation: 'applyEffect',
        params: { preset: 'sharpen', intensity: 0.4 },
      },
    ],
  },
  {
    id: 'retro-vintage',
    name: 'Retro Vintage',
    description: 'Classic vintage look with film grain and warm tones',
    category: 'creative',
    operations: [
      {
        operation: 'colorGrade',
        params: { preset: 'vintage' },
      },
      {
        operation: 'applyEffect',
        params: { preset: 'film grain', intensity: 0.8 },
      },
      {
        operation: 'applyEffect',
        params: { preset: 'old film', intensity: 0.6 },
      },
    ],
  },
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Neon',
    description: 'Futuristic neon aesthetic with high contrast and vibrant colors',
    category: 'creative',
    operations: [
      {
        operation: 'colorGrade',
        params: { preset: 'cyberpunk' },
      },
      // Removed glow and neon effects - FFmpeg not available on Vercel, keeping only color grade for reliability
    ],
  },
  {
    id: 'cinematic-trailer',
    name: 'Cinematic Trailer',
    description: 'Epic cinematic look with dramatic color grading and effects',
    category: 'cinematic',
    operations: [
      {
        operation: 'colorGrade',
        params: { preset: 'cinematic' },
      },
      {
        operation: 'colorGrade',
        params: { preset: 'high contrast' },
      },
      {
        operation: 'applyEffect',
        params: { preset: 'dreamy glow', intensity: 0.8 },
      },
    ],
  },
  {
    id: 'minimal-clean',
    name: 'Minimal Clean',
    description: 'Clean, minimal aesthetic with subtle enhancements',
    category: 'product',
    operations: [
      {
        operation: 'colorGrade',
        params: { preset: 'natural tone' },
      },
      {
        operation: 'applyEffect',
        params: { preset: 'soft focus', intensity: 0.2 },
      },
    ],
  },
  {
    id: 'dramatic-noir',
    name: 'Dramatic Noir',
    description: 'Classic black and white with high contrast',
    category: 'cinematic',
    operations: [
      {
        operation: 'colorGrade',
        params: { preset: 'noir' },
      },
      {
        operation: 'applyEffect',
        params: { preset: 'high contrast', intensity: 0.9 },
      },
    ],
  },
]

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: EffectTemplate['category']): EffectTemplate[] {
  return EFFECT_TEMPLATES.filter(template => template.category === category)
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): EffectTemplate | undefined {
  return EFFECT_TEMPLATES.find(template => template.id === id)
}

/**
 * Get all categories
 */
export function getTemplateCategories(): EffectTemplate['category'][] {
  return Array.from(new Set(EFFECT_TEMPLATES.map(t => t.category)))
}

