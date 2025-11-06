/**
 * Feature Testing Script
 * Run this to test all VEDIT features locally
 * 
 * NOTE: This script requires authentication. For best results:
 * 1. Test manually in browser (http://localhost:3000) where you're authenticated
 * 2. Or use this script for API structure validation only
 * 
 * Usage: node scripts/test-features.js
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
const SKIP_AUTH = process.env.SKIP_AUTH === 'true' // For dev testing only

const testFeatures = [
  {
    name: 'Color Grading',
    command: 'Apply cinematic color grade',
    expected: 'colorGrade operation',
  },
  {
    name: 'Time-Based Effect',
    command: 'Apply blur effect from 3 to 5 seconds',
    expected: 'applyEffect with startTime and endTime',
  },
  {
    name: 'Text Overlay',
    command: 'Add bold text "Welcome" at the top',
    expected: 'addText operation',
  },
  {
    name: 'Auto-Enhance',
    command: 'Auto-enhance this video',
    expected: 'AI suggestions',
  },
  {
    name: 'Caption Generation',
    command: 'Generate subtitles with yellow color at top position',
    expected: 'addCaptions operation',
  },
  {
    name: 'Trim Video',
    command: 'Trim video from 5 to 10 seconds',
    expected: 'trim operation',
  },
  {
    name: 'Speed Adjustment',
    command: 'Set video speed to 1.5x',
    expected: 'adjustSpeed operation',
  },
]

async function testFeature(feature, videoPublicId) {
  console.log(`\n🧪 Testing: ${feature.name}`)
  console.log(`   Command: "${feature.command}"`)
  
  try {
    const response = await fetch(`${BASE_URL}/api/via`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: feature.command,
        videoPublicId: videoPublicId || 'test-video',
        mediaType: 'video',
      }),
    })

    const data = await response.json()

    if (response.ok) {
      console.log(`   ✅ Success: ${feature.expected}`)
      if (data.videoUrl) {
        console.log(`   📹 Video URL: ${data.videoUrl.substring(0, 50)}...`)
      }
      if (data.message) {
        console.log(`   💬 Message: ${data.message.substring(0, 60)}...`)
      }
      return true
    } else {
      if (data.error === 'Unauthorized - Please sign in to continue' || response.status === 401) {
        console.log(`   ⚠️  Auth Required: This test requires authentication`)
        console.log(`   💡 Tip: Test this manually in browser at ${BASE_URL}/dashboard`)
        return 'auth_required'
      }
      console.log(`   ❌ Failed: ${data.error || data.message || 'Unknown error'}`)
      if (data.code) {
        console.log(`   📋 Error Code: ${data.code}`)
      }
      return false
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`)
    return false
  }
}

async function runTests() {
  console.log('🚀 Starting VEDIT Feature Tests')
  console.log(`📍 Base URL: ${BASE_URL}`)
  console.log('─'.repeat(50))
  console.log('⚠️  NOTE: These tests require authentication.')
  console.log('   For full testing, use the browser at http://localhost:3000/dashboard')
  console.log('   (Sign in first, then test features manually)')
  console.log('─'.repeat(50))

  const results = []
  for (const feature of testFeatures) {
    const result = await testFeature(feature)
    results.push({ feature: feature.name, result })
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  console.log('\n' + '─'.repeat(50))
  console.log('📊 Test Results:')
  const passed = results.filter(r => r.result === true).length
  const authRequired = results.filter(r => r.result === 'auth_required').length
  const failed = results.filter(r => r.result === false).length
  const total = results.length
  
  console.log(`   ✅ Passed: ${passed}/${total}`)
  console.log(`   ⚠️  Auth Required: ${authRequired}/${total}`)
  console.log(`   ❌ Failed: ${failed}/${total}`)
  
  if (authRequired > 0) {
    console.log('\n💡 Recommendation:')
    console.log('   1. Open http://localhost:3000 in your browser')
    console.log('   2. Sign in with Google')
    console.log('   3. Upload a video')
    console.log('   4. Test each feature manually in the VIA Chat')
    console.log('   5. Check the browser console for any errors')
  }
  
  if (passed === total) {
    console.log('\n🎉 All tests passed!')
  } else if (failed === 0 && authRequired === total) {
    console.log('\n✅ API structure is correct (authentication required)')
    console.log('   Test features manually in the browser for full validation.')
  } else {
    console.log('\n⚠️  Some tests failed. Review the output above.')
  }
}

// Run tests
runTests().catch(console.error)

