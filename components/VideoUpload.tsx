'use client'

import { useState, useRef } from 'react'
import { motion } from 'framer-motion'

interface MediaItem {
  url: string
  publicId: string
  type: 'video' | 'image'
  name: string
  isUploading?: boolean
}

interface VideoUploadProps {
  onUploadComplete: (items: MediaItem[]) => void
}

export default function VideoUpload({ onUploadComplete }: VideoUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({})
  const [uploadedFiles, setUploadedFiles] = useState<MediaItem[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)

    const uploadPromises = Array.from(files).map(async (file) => {
      // Validate file type (video or image)
      const isVideo = file.type.startsWith('video/')
      const isImage = file.type.startsWith('image/')
      
      if (!isVideo && !isImage) {
        throw new Error(`${file.name}: Only video and image files are supported`)
      }

      const fileKey = `${file.name}-${Date.now()}`
      setUploadProgress(prev => ({ ...prev, [fileKey]: 0 }))

      try {
        // Get upload signature from our API
        const timestamp = Math.round(new Date().getTime() / 1000)
        let signatureData: any
        
        try {
          const sigResponse = await fetch('/api/upload/signature', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timestamp, folder: 'vedit' }),
          })
          
          if (!sigResponse.ok) {
            const sigError = await sigResponse.json().catch(() => ({ error: 'Failed to get upload signature' }))
            throw new Error(sigError.error || 'Failed to get upload signature')
          }
          
          signatureData = await sigResponse.json()
        } catch (sigError: any) {
          throw new Error(`Failed to get upload signature: ${sigError?.message || 'Unknown error'}`)
        }

        // Upload directly to Cloudinary from client
        const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/${isVideo ? 'video' : 'image'}/upload`
        
        const formData = new FormData()
        formData.append('file', file)
        formData.append('api_key', signatureData.apiKey)
        formData.append('timestamp', signatureData.timestamp.toString())
        formData.append('signature', signatureData.signature)
        formData.append('folder', 'vedit')

        // Upload with progress tracking
        const xhr = new XMLHttpRequest()
        
        return new Promise<MediaItem>((resolve, reject) => {
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const progress = Math.round((e.loaded / e.total) * 100)
              setUploadProgress(prev => ({ ...prev, [fileKey]: progress }))
            }
          })

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const response = JSON.parse(xhr.responseText)
                if (response.secure_url && response.public_id) {
                  setUploadProgress(prev => ({ ...prev, [fileKey]: 100 }))
                  resolve({
                    url: response.secure_url,
                    publicId: response.public_id,
                    type: isVideo ? 'video' as const : 'image' as const,
                    name: file.name,
                  })
                } else {
                  reject(new Error('Invalid response from Cloudinary'))
                }
              } catch (parseError) {
                reject(new Error('Failed to parse Cloudinary response'))
              }
            } else {
              try {
                const errorResponse = JSON.parse(xhr.responseText)
                reject(new Error(errorResponse.error?.message || `Upload failed with status ${xhr.status}`))
              } catch {
                reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`))
              }
            }
          })

          xhr.addEventListener('error', () => {
            reject(new Error('Network error during upload'))
          })

          xhr.addEventListener('abort', () => {
            reject(new Error('Upload was aborted'))
          })

          xhr.open('POST', cloudinaryUrl)
          xhr.send(formData)
        })
      } catch (error) {
        console.error(`Upload error for ${file.name}:`, error)
        throw error
      }
    })

    try {
      // Show items immediately with loading state (optimistic update)
      const tempItems = Array.from(files).map((file, index) => {
        const isVideo = file.type.startsWith('video/')
        return {
          url: URL.createObjectURL(file), // Create blob URL for immediate preview
          publicId: `temp_${Date.now()}_${index}`,
          type: (isVideo ? 'video' : 'image') as 'video' | 'image',
          name: file.name,
          isUploading: true,
        }
      })
      
      // Immediately show items in UI (optimistic update)
      const tempItemsList = [...uploadedFiles, ...tempItems]
      setUploadedFiles(tempItemsList as any)
      onUploadComplete(tempItemsList as any)

      // Upload files in parallel
      const uploadedItems = await Promise.all(uploadPromises)
      
      // Replace temp items with real uploaded items
      // Remove temp items and add real uploaded items
      const finalItems = uploadedFiles.filter((item: any) => !item.isUploading).concat(uploadedItems)
      setUploadedFiles(finalItems)
      onUploadComplete(finalItems)
      
      console.log(`✅ All uploads complete. ${uploadedItems.length} files uploaded successfully`)
      
      // Clean up blob URLs
      tempItems.forEach(item => {
        if (item.url.startsWith('blob:')) {
          URL.revokeObjectURL(item.url)
        }
      })
    } catch (error: any) {
      console.error('Upload error:', error)
      const errorMessage = error?.message || 'Failed to upload some files. Please try again.'
      alert(`Upload Error: ${errorMessage}`)
      // Remove failed temp items
      setUploadedFiles(uploadedFiles)
      onUploadComplete(uploadedFiles)
    } finally {
      setUploading(false)
      setTimeout(() => setUploadProgress({}), 1000)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const removeFile = (index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index)
    setUploadedFiles(newFiles)
    onUploadComplete(newFiles)
  }

  const totalProgress = Object.values(uploadProgress).reduce((a, b) => a + b, 0)
  const avgProgress = Object.keys(uploadProgress).length > 0 
    ? totalProgress / Object.keys(uploadProgress).length 
    : 0

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full px-6 py-4 rounded-xl bg-gradient-to-r from-vedit-pink via-vedit-purple to-vedit-blue text-white font-semibold hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading ? `Uploading... ${Math.round(avgProgress)}%` : '📁 Choose Files (Multiple)'}
      </motion.button>

      {uploading && (
        <div className="w-full bg-black/30 rounded-full h-2 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${avgProgress}%` }}
            className="h-full bg-gradient-to-r from-vedit-pink to-vedit-blue"
          />
        </div>
      )}

      {uploadedFiles.length > 0 && (
        <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
          <p className="text-sm font-semibold text-white">
            Uploaded ({uploadedFiles.length}):
          </p>
          {uploadedFiles.map((item, index) => (
            <div
              key={item.publicId}
              className={`flex items-center gap-2 p-2 rounded-lg border ${
                item.isUploading 
                  ? 'bg-vedit-purple/20 border-vedit-purple/50' 
                  : 'bg-black/20 border-white/10'
              }`}
            >
              <span className="text-lg">
                {item.isUploading ? '⏳' : (item.type === 'video' ? '🎬' : '🖼️')}
              </span>
              <span className="flex-1 text-xs text-gray-300 truncate">
                {item.name}
                {item.isUploading && <span className="ml-2 text-vedit-purple">(uploading...)</span>}
              </span>
              {!item.isUploading && (
                <button
                  onClick={() => removeFile(index)}
                  className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded"
                  title="Remove"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 p-4 bg-black/20 rounded-xl border border-white/10">
        <p className="text-sm text-gray-300 mb-2">Supported formats:</p>
        <p className="text-xs text-gray-400">Videos: MP4, MOV, AVI, WebM</p>
        <p className="text-xs text-gray-400">Images: JPG, PNG, GIF, WebP</p>
        <p className="text-xs text-gray-400 mt-1">Max size: 500MB per file</p>
        <p className="text-xs text-gray-400 mt-1">You can select multiple files at once</p>
      </div>
    </div>
  )
}
