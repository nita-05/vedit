// Database helper for MongoDB Atlas
// Uses Mongoose for MongoDB connection

import mongoose from 'mongoose'

interface ProjectData {
  id?: string
  userId: string // user email
  projectData: any
  videoPublicId: string
  chatHistory: any[]
  brandKit?: any
  videoUrl?: string
  downloadUrl?: string
  shareUrl?: string
  published?: boolean
  createdAt: Date
  updatedAt: Date
}

interface EditHistoryData {
  userId: string
  videoPublicId: string
  editCommand: string
  editResult: any
  timestamp: Date
}

// MongoDB connection state
let isConnected = false

// Connect to MongoDB Atlas
async function connectDB() {
  if (isConnected) {
    return
  }

  const mongoUri = process.env.MONGODB_URI

  if (!mongoUri) {
    console.warn('MONGODB_URI not set, using in-memory storage')
    return { type: 'memory', storage: new Map() }
  }

  try {
    await mongoose.connect(mongoUri)
    isConnected = true
    console.log('✅ Connected to MongoDB Atlas')
  } catch (error) {
    console.error('❌ MongoDB connection error:', error)
    console.warn('Falling back to in-memory storage')
    return { type: 'memory', storage: new Map() }
  }
}

// Mongoose Schemas
const ProjectSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  projectData: { type: mongoose.Schema.Types.Mixed, default: {} },
  videoPublicId: { type: String, default: '' },
  chatHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
  brandKit: { type: mongoose.Schema.Types.Mixed, default: {} },
  videoUrl: { type: String, default: '' },
  downloadUrl: { type: String, default: '' },
  shareUrl: { type: String, default: '' },
  published: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

const EditHistorySchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  videoPublicId: { type: String, required: true },
  editCommand: { type: String, required: true },
  editResult: { type: mongoose.Schema.Types.Mixed, required: true },
  timestamp: { type: Date, default: Date.now },
})

// Models (with check to avoid re-compilation errors)
const ProjectModel = mongoose.models.Project || mongoose.model('Project', ProjectSchema)
const EditHistoryModel = mongoose.models.EditHistory || mongoose.model('EditHistory', EditHistorySchema)

// In-memory storage fallback
const memoryStorage = new Map<string, any>()

export async function saveProject(data: ProjectData): Promise<string> {
  await connectDB()

  if (!isConnected) {
    // Fallback to in-memory
    const id = `project_${Date.now()}`
    memoryStorage.set(id, { ...data, _id: id, id })
    return id
  }

  try {
    const project = new ProjectModel({
      userId: data.userId,
      projectData: data.projectData,
      videoPublicId: data.videoPublicId,
      chatHistory: data.chatHistory,
      brandKit: data.brandKit || {},
      videoUrl: data.videoUrl || '',
      downloadUrl: data.downloadUrl || '',
      shareUrl: data.shareUrl || '',
      published: data.published || false,
      createdAt: data.createdAt || new Date(),
      updatedAt: data.updatedAt || new Date(),
    })

    const savedProject = await project.save()
    return savedProject._id.toString()
  } catch (error) {
    console.error('Error saving project:', error)
    // Fallback to in-memory on error
    const id = `project_${Date.now()}`
    memoryStorage.set(id, { ...data, _id: id, id })
    return id
  }
}

export async function updateProject(
  projectId: string,
  data: Partial<ProjectData>
): Promise<void> {
  await connectDB()

  // Fallback to in-memory if not connected
  if (!isConnected) {
    const existing = memoryStorage.get(projectId)
    if (existing) {
      memoryStorage.set(projectId, { ...existing, ...data, updatedAt: new Date() })
    }
    return
  }

  try {
    await ProjectModel.findByIdAndUpdate(
      projectId,
      {
        ...data,
        updatedAt: new Date(),
      },
      { new: true }
    )
  } catch (error) {
    console.error('Error updating project:', error)
    // Fallback to in-memory on error
    const existing = memoryStorage.get(projectId)
    if (existing) {
      memoryStorage.set(projectId, { ...existing, ...data, updatedAt: new Date() })
    }
  }
}

export async function getProjects(userId: string): Promise<ProjectData[]> {
  await connectDB()

  // Fallback to in-memory if not connected
  if (!isConnected) {
    return Array.from(memoryStorage.values())
      .filter((p: any) => p.userId === userId)
      .sort((a: any, b: any) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ) as ProjectData[]
  }

  try {
    const projects = await ProjectModel.find({ userId })
      .sort({ updatedAt: -1 })
      .lean()

    return projects.map((p: any) => ({
      id: p._id.toString(),
      userId: p.userId,
      projectData: p.projectData,
      videoPublicId: p.videoPublicId,
      chatHistory: p.chatHistory,
      brandKit: p.brandKit,
      videoUrl: p.videoUrl,
      downloadUrl: p.downloadUrl,
      shareUrl: p.shareUrl,
      published: p.published,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }))
  } catch (error) {
    console.error('Error fetching projects:', error)
    // Fallback to in-memory on error
    return Array.from(memoryStorage.values())
      .filter((p: any) => p.userId === userId)
      .sort((a: any, b: any) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ) as ProjectData[]
  }
}

export async function saveEditHistory(
  userId: string,
  videoPublicId: string,
  editCommand: string,
  editResult: any
): Promise<void> {
  await connectDB()

  const editHistory = {
    userId,
    videoPublicId,
    editCommand,
    editResult,
    timestamp: new Date(),
  }

  // Fallback to in-memory if not connected
  if (!isConnected) {
    const key = `edit_${userId}_${Date.now()}`
    memoryStorage.set(key, editHistory)
    return
  }

  try {
    const history = new EditHistoryModel(editHistory)
    await history.save()
  } catch (error) {
    console.error('Error saving edit history:', error)
    // Fallback to in-memory on error
    const key = `edit_${userId}_${Date.now()}`
    memoryStorage.set(key, editHistory)
  }
}

export async function getEditHistory(
  userId: string,
  videoPublicId?: string
): Promise<EditHistoryData[]> {
  await connectDB()

  if (!isConnected) {
    // Fallback to in-memory
    return Array.from(memoryStorage.values())
      .filter((e: any) => {
        if (e.userId !== userId) return false
        if (videoPublicId && e.videoPublicId !== videoPublicId) return false
        return e.editCommand && e.editResult
      })
      .sort((a: any, b: any) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ) as EditHistoryData[]
  }

  try {
    const query: any = { userId }
    if (videoPublicId) {
      query.videoPublicId = videoPublicId
    }

    const history = await EditHistoryModel.find(query)
      .sort({ timestamp: -1 })
      .lean()

    return history.map((h: any) => ({
      userId: h.userId,
      videoPublicId: h.videoPublicId,
      editCommand: h.editCommand,
      editResult: h.editResult,
      timestamp: h.timestamp,
    }))
  } catch (error) {
    console.error('Error fetching edit history:', error)
    throw error
  }
}
