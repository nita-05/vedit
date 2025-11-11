'use client'

import { motion } from 'framer-motion'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function LandingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/dashboard')
    }
  }, [status, router])

  const features = [
    {
      icon: '✨',
      title: 'VIA (AI Chatbot)',
      description: 'Edit with natural prompts or voice',
    },
    {
      icon: '🎞️',
      title: 'V-Editor',
      description: 'Auto-timeline editing, trimming, merging',
    },
    {
      icon: '🚀',
      title: 'V-Port',
      description: 'Auto-publish to YouTube, Instagram, TikTok, LinkedIn, X',
    },
    {
      icon: '🗣️',
      title: 'VIA Profiles',
      description: 'Generate real AI voiceovers',
    },
  ]

  return (
    <div className="relative w-full min-h-screen overflow-hidden">
      {/* Background Layer */}
      <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-vedit-purple/20 via-black to-vedit-blue/20 animate-pulse"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70"></div>

      {/* Navbar */}
      <nav className="relative z-20 w-full px-6 py-4 flex items-center justify-between backdrop-blur-md bg-black/20 border-b border-white/10">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="text-2xl font-bold bg-gradient-to-r from-vedit-pink to-vedit-blue bg-clip-text text-transparent"
        >
          🎬 VEDIT
        </motion.div>
        <motion.button
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          onClick={async () => {
            try {
              const result = await signIn('google', { 
                callbackUrl: '/dashboard',
                redirect: true 
              })
              if (result?.error) {
                console.error('Sign in error:', result.error)
                alert('Failed to sign in. Please try again.')
              }
            } catch (error) {
              console.error('Sign in error:', error)
              alert('Failed to sign in. Please check your internet connection and try again.')
            }
          }}
          className="px-6 py-2 rounded-xl bg-gradient-to-r from-vedit-pink via-vedit-purple to-vedit-blue text-white font-semibold hover:scale-105 transition-transform duration-300 shadow-glow cursor-pointer"
        >
          Sign in
        </motion.button>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-80px)] text-center text-white px-6 py-12">
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 bg-gradient-to-r from-vedit-pink via-vedit-purple to-vedit-blue bg-clip-text text-transparent"
        >
          Edit with your voice or words.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="text-xl md:text-2xl mb-8 max-w-3xl text-gray-200"
        >
          The most cinematic AI video editor powered by VIA
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4 }}
          className="text-lg md:text-xl mb-12 max-w-2xl text-gray-300"
        >
          AI-powered editing for creators, startups, and brands. Edit, manage, and publish your videos in seconds.
        </motion.p>
        
        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.6 }}
          className="flex flex-col sm:flex-row gap-4 mb-12"
        >
          <motion.button
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={async () => {
              try {
                const result = await signIn('google', { 
                  callbackUrl: '/dashboard',
                  redirect: true 
                })
                if (result?.error) {
                  console.error('Sign in error:', result.error)
                  alert('Failed to sign in. Please try again.')
                }
              } catch (error) {
                console.error('Sign in error:', error)
                alert('Failed to sign in. Please check your internet connection and try again.')
              }
            }}
            className="px-8 py-4 rounded-xl bg-gradient-to-r from-vedit-pink via-vedit-purple to-vedit-blue text-white font-semibold text-lg hover:shadow-glow transition-all duration-300 shadow-glow animate-pulseGlow flex items-center gap-2 cursor-pointer"
          >
            <span>🔐</span> Start Editing
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push('/dashboard')}
            className="px-8 py-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white font-semibold text-lg hover:bg-white/20 transition-all duration-300 flex items-center gap-2"
          >
            <span>▶️</span> Watch Demo
          </motion.button>
        </motion.div>

        {/* Feature Grid */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.8 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-20 w-full max-w-6xl px-6"
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1 + index * 0.1 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-glow hover:shadow-glow-strong transition-all duration-300"
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold mb-2 text-white">{feature.title}</h3>
              <p className="text-gray-300 text-sm">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </main>

      {/* Animated Sections */}
      <section id="demo-section" className="relative z-10 w-full max-w-7xl mx-auto px-6 py-20">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {[
            {
              icon: '🧠',
              title: 'VIA',
              description: 'AI Assistant powered by GPT-5. Edit with natural language or voice commands.',
              color: 'from-vedit-pink to-vedit-purple'
            },
            {
              icon: '🎞️',
              title: 'Scene Detection',
              description: 'Automatically detect scenes and create smooth transitions.',
              color: 'from-vedit-purple to-vedit-blue'
            },
            {
              icon: '🎬',
              title: 'AI Trailer Generator',
              description: 'Auto-create cinematic 15-30s trailers with best shots and music.',
              color: 'from-vedit-blue to-vedit-pink'
            },
            {
              icon: '🚀',
              title: 'V-Port Publish',
              description: 'Export and publish directly to YouTube, TikTok, LinkedIn, X.',
              color: 'from-vedit-pink via-vedit-purple to-vedit-blue'
            }
          ].map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-glow hover:shadow-glow-strong transition-all duration-300"
            >
              <div className={`text-5xl mb-4 bg-gradient-to-r ${feature.color} bg-clip-text text-transparent`}>
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold mb-2 text-white">{feature.title}</h3>
              <p className="text-gray-300 text-sm leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 w-full py-6 text-center border-t border-white/10">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.5 }}
          className="text-sm text-gray-400"
        >
          © 2025 VEDIT – Powered by AI
        </motion.p>
      </footer>

      {/* Floating Glow Effects */}
      <div className="absolute top-20 left-1/4 w-20 h-20 bg-vedit-purple/30 rounded-full blur-2xl animate-float"></div>
      <div className="absolute bottom-40 right-1/4 w-16 h-16 bg-vedit-blue/30 rounded-full blur-xl animate-float" style={{ animationDelay: '1s' }}></div>
      <div className="absolute top-1/2 right-1/3 w-12 h-12 bg-vedit-pink/30 rounded-full blur-lg animate-float" style={{ animationDelay: '2s' }}></div>
    </div>
  )
}
