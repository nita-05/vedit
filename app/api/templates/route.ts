import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { EFFECT_TEMPLATES, getTemplatesByCategory, getTemplateById, getTemplateCategories } from '@/lib/templates'

/**
 * Templates API - Get effect templates and apply them
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const id = searchParams.get('id')

    if (id) {
      // Return specific template
      const template = getTemplateById(id)
      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }
      return NextResponse.json({ success: true, template })
    }

    if (category) {
      // Return templates by category
      const templates = getTemplatesByCategory(category as any)
      return NextResponse.json({ success: true, templates, category })
    }

    // Return all templates with categories
    const categories = getTemplateCategories()
    return NextResponse.json({
      success: true,
      templates: EFFECT_TEMPLATES,
      categories,
    })
  } catch (error: any) {
    console.error('❌ Templates API error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch templates',
        message: error?.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * Apply template to video
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { templateId, videoPublicId, videoUrl } = body

    if (!templateId || !videoPublicId) {
      return NextResponse.json(
        { error: 'Template ID and video public ID are required' },
        { status: 400 }
      )
    }

    const template = getTemplateById(templateId)
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    console.log(`🎨 Applying template "${template.name}" to video ${videoPublicId}`)

    // Process each operation in the template sequentially
    // For now, return the operations for the frontend to process
    // Or we can process them server-side
    
    return NextResponse.json({
      success: true,
      template,
      operations: template.operations,
      message: `Template "${template.name}" will be applied to your video`,
    })
  } catch (error: any) {
    console.error('❌ Apply template error:', error)
    return NextResponse.json(
      {
        error: 'Failed to apply template',
        message: error?.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}

