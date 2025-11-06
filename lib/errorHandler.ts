/**
 * Error Handling Utilities
 * Centralized error handling and logging
 */

export class VeditError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message)
    this.name = 'VeditError'
  }
}

export class ValidationError extends VeditError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details)
    this.name = 'ValidationError'
  }
}

export class ProcessingError extends VeditError {
  constructor(message: string, details?: any) {
    super(message, 'PROCESSING_ERROR', 500, details)
    this.name = 'ProcessingError'
  }
}

export class NotFoundError extends VeditError {
  constructor(message: string = 'Resource not found', details?: any) {
    super(message, 'NOT_FOUND', 404, details)
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends VeditError {
  constructor(message: string = 'Unauthorized', details?: any) {
    super(message, 'UNAUTHORIZED', 401, details)
    this.name = 'UnauthorizedError'
  }
}

/**
 * Format error for API response
 */
export function formatErrorResponse(error: unknown): {
  error: string
  code?: string
  message: string
  details?: any
} {
  if (error instanceof VeditError) {
    return {
      error: error.message,
      code: error.code,
      message: error.message,
      details: error.details,
    }
  }

  if (error instanceof Error) {
    return {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'An error occurred' : error.message,
      details: process.env.NODE_ENV === 'development' ? { stack: error.stack } : undefined,
    }
  }

  return {
    error: 'Unknown error',
    code: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred',
  }
}

/**
 * Log error with context
 */
export function logError(error: unknown, context?: Record<string, any>) {
  const timestamp = new Date().toISOString()
  const errorInfo = error instanceof Error ? {
    name: error.name,
    message: error.message,
    stack: error.stack,
  } : { error: String(error) }

  console.error(`[${timestamp}] ERROR:`, {
    ...errorInfo,
    ...context,
  })

  // In production, you might want to send this to an error tracking service
  // if (process.env.NODE_ENV === 'production') {
  //   // Send to Sentry, LogRocket, etc.
  // }
}

/**
 * Handle API errors consistently
 */
export function handleApiError(error: unknown, context?: Record<string, any>): {
  status: number
  body: any
} {
  logError(error, context)

  if (error instanceof VeditError) {
    return {
      status: error.statusCode,
      body: formatErrorResponse(error),
    }
  }

  return {
    status: 500,
    body: formatErrorResponse(error),
  }
}

/**
 * Retry utility for async operations
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      if (attempt < maxRetries) {
        console.log(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        delay *= 2 // Exponential backoff
      }
    }
  }

  throw lastError || new Error('Operation failed after retries')
}
