/**
 * Rate Limiting Utilities
 * Simple in-memory rate limiter (for production, use Redis or Vercel Edge Config)
 */

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

const store: RateLimitStore = {}

/**
 * Simple rate limiter
 * @param identifier - Unique identifier (user ID, IP, etc.)
 * @param maxRequests - Maximum requests allowed
 * @param windowMs - Time window in milliseconds
 */
export function checkRateLimit(
  identifier: string,
  maxRequests: number = 10,
  windowMs: number = 60000 // 1 minute
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now()
  const record = store[identifier]

  // Clean up old records periodically
  if (Object.keys(store).length > 10000) {
    Object.keys(store).forEach((key) => {
      if (store[key].resetTime < now) {
        delete store[key]
      }
    })
  }

  if (!record || record.resetTime < now) {
    // New window or expired window
    store[identifier] = {
      count: 1,
      resetTime: now + windowMs,
    }
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: now + windowMs,
    }
  }

  if (record.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime,
    }
  }

  record.count++
  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetTime: record.resetTime,
  }
}

/**
 * Rate limit middleware for API routes
 */
export function createRateLimiter(
  maxRequests: number = 10,
  windowMs: number = 60000
) {
  return (req: Request): { allowed: boolean; headers?: HeadersInit } => {
    // Get identifier from request (IP or user ID)
    const identifier = 
      req.headers.get('x-user-id') || 
      req.headers.get('x-forwarded-for')?.split(',')[0] || 
      'anonymous'

    const result = checkRateLimit(identifier, maxRequests, windowMs)

    if (!result.allowed) {
      return {
        allowed: false,
        headers: {
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': result.resetTime.toString(),
          'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
        },
      }
    }

    return {
      allowed: true,
      headers: {
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.resetTime.toString(),
      },
    }
  }
}
