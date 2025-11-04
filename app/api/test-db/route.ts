import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import mongoose from 'mongoose'

// Test MongoDB connection
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    let mongoUri = process.env.MONGODB_URI
    
    // Clean up the URI (remove quotes, whitespace, etc.)
    if (mongoUri) {
      mongoUri = mongoUri.trim()
      // Remove surrounding quotes if present
      if ((mongoUri.startsWith('"') && mongoUri.endsWith('"')) || 
          (mongoUri.startsWith("'") && mongoUri.endsWith("'"))) {
        mongoUri = mongoUri.slice(1, -1).trim()
      }
      
      // Fix: If value accidentally includes "MONGODB_URI=" prefix (common .env.local mistake)
      if (mongoUri.startsWith('MONGODB_URI=')) {
        mongoUri = mongoUri.replace(/^MONGODB_URI=\s*/, '').trim()
        // Check if there's another MONGODB_URI= inside (duplicate entries)
        if (mongoUri.includes('MONGODB_URI=')) {
          // Extract the actual URI part (everything after the last MONGODB_URI=)
          const parts = mongoUri.split('MONGODB_URI=')
          mongoUri = parts[parts.length - 1].trim()
        }
      }
      
      // Additional cleanup - remove any leading spaces or weird characters
      mongoUri = mongoUri.replace(/^[\s=]+/, '').trim()
    }
    
    const connectionStatus = mongoose.connection.readyState
    
    // Connection states: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    }

    if (!mongoUri) {
      return NextResponse.json({
        success: false,
        error: 'MONGODB_URI not set in environment variables',
        status: 'not_configured',
        tip: 'Add MONGODB_URI to your .env.local file',
      })
    }

    // Validate URI format
    if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      return NextResponse.json({
        success: false,
        error: 'Invalid MongoDB URI format',
        details: `URI must start with "mongodb://" or "mongodb+srv://"`,
        diagnostic: {
          uri_length: mongoUri.length,
          first_30_chars: mongoUri.substring(0, 30),
          has_quotes: mongoUri.startsWith('"') || mongoUri.startsWith("'"),
          starts_with: mongoUri.substring(0, 20),
        },
        troubleshooting: [
          '❌ Make sure MONGODB_URI in .env.local does NOT have quotes around it',
          '❌ Remove any spaces before or after the URI',
          '✅ Format should be: MONGODB_URI=mongodb+srv://...',
          '✅ NO quotes: MONGODB_URI="mongodb+srv://..." is WRONG',
          '✅ NO spaces: MONGODB_URI = mongodb+srv://... is WRONG',
          '🔄 Restart your dev server after changing .env.local (Ctrl+C then npm run dev)'
        ],
        correct_format: 'MONGODB_URI=mongodb+srv://nita_07:Nitatapas2027@cluster0.gkt7fjv.mongodb.net/vedit?retryWrites=true&w=majority&appName=Cluster0'
      }, { status: 400 })
    }

    // Try to connect if not connected
    if (connectionStatus !== 1) {
      try {
        await mongoose.connect(mongoUri, {
          serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        // Provide helpful troubleshooting tips based on error
        let troubleshootingTips = []
        if (errorMessage.includes('authentication failed') || errorMessage.includes('bad auth')) {
          troubleshootingTips = [
            'Verify username and password in your connection string',
            'URL encode special characters in password (@ → %40, # → %23, etc.)',
            'Check if database user exists and has proper permissions in MongoDB Atlas',
            'Verify the database name is correct (should be /vedit in connection string)',
            'Try creating a new database user in MongoDB Atlas Dashboard → Database Access'
          ]
        } else if (errorMessage.includes('timeout')) {
          troubleshootingTips = [
            'Check your IP address is whitelisted in MongoDB Atlas Network Access',
            'Try adding 0.0.0.0/0 to allow all IPs (for development only)',
            'Verify your cluster is running and accessible'
          ]
        } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('DNS')) {
          troubleshootingTips = [
            'Check your cluster hostname is correct',
            'Verify cluster status in MongoDB Atlas dashboard'
          ]
        }
        
        return NextResponse.json({
          success: false,
          error: 'Failed to connect to MongoDB',
          details: errorMessage,
          status: states[connectionStatus] || 'error',
          uri_provided: mongoUri ? 'Yes (hidden for security)' : 'No',
          troubleshooting: troubleshootingTips,
        }, { status: 400 })
      }
    }

    // Test a simple operation
    const testResult = await mongoose.connection.db.admin().ping()

    return NextResponse.json({
      success: true,
      message: '✅ MongoDB Atlas connection successful!',
      connectionStatus: states[connectionStatus] || 'unknown',
      ping: testResult,
      database: mongoose.connection.db.databaseName,
      user: session?.user?.email || 'Not authenticated',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Database test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}

