/**
 * Progress Tracking Utilities
 * Track and report progress for long-running operations
 */

export interface ProgressUpdate {
  operation: string
  progress: number // 0-100
  message: string
  stage?: string
  timestamp: number
}

export class ProgressTracker {
  private progress: number = 0
  private message: string = ''
  private stage: string = ''
  private callbacks: Array<(update: ProgressUpdate) => void> = []

  constructor(public operation: string) {}

  /**
   * Subscribe to progress updates
   */
  onUpdate(callback: (update: ProgressUpdate) => void) {
    this.callbacks.push(callback)
    return () => {
      this.callbacks = this.callbacks.filter((cb) => cb !== callback)
    }
  }

  /**
   * Update progress
   */
  update(progress: number, message: string, stage?: string) {
    this.progress = Math.max(0, Math.min(100, progress))
    this.message = message
    this.stage = stage || this.stage

    const update: ProgressUpdate = {
      operation: this.operation,
      progress: this.progress,
      message: this.message,
      stage: this.stage,
      timestamp: Date.now(),
    }

    this.callbacks.forEach((callback) => {
      try {
        callback(update)
      } catch (error) {
        console.error('Progress callback error:', error)
      }
    })
  }

  /**
   * Set stage
   */
  setStage(stage: string, message?: string) {
    this.stage = stage
    if (message) {
      this.message = message
    }
    this.update(this.progress, this.message, this.stage)
  }

  /**
   * Complete
   */
  complete(message: string = 'Completed') {
    this.update(100, message)
  }

  /**
   * Get current progress
   */
  getProgress(): ProgressUpdate {
    return {
      operation: this.operation,
      progress: this.progress,
      message: this.message,
      stage: this.stage,
      timestamp: Date.now(),
    }
  }
}

/**
 * Create progress tracker for video processing
 */
export function createVideoProcessingTracker(videoId: string): ProgressTracker {
  const tracker = new ProgressTracker(`video-processing-${videoId}`)

  // Log progress updates
  tracker.onUpdate((update) => {
    console.log(`[${update.operation}] ${update.progress}% - ${update.message}`)
  })

  return tracker
}

