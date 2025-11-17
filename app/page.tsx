'use client'

import { motion } from 'framer-motion'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Image from 'next/image'

export default function LandingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/dashboard')
    }
  }, [status, router])

  useEffect(() => {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('vedit-theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
      document.documentElement.classList.toggle('light', savedTheme === 'light')
    }

    // Handle scroll for navbar
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
    localStorage.setItem('vedit-theme', newTheme)
    document.documentElement.classList.toggle('light', newTheme === 'light')
  }

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

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
    <div className="relative w-full min-h-screen overflow-hidden bg-black">
      {/* Background Layer */}
      <div className="fixed inset-0 w-full h-full bg-gradient-to-br from-vedit-purple/20 via-black to-vedit-blue/20 animate-pulse"></div>
      <div className="fixed inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70"></div>

      {/* Fixed Navbar */}
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className={`fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between backdrop-blur-md transition-all duration-300 ${
          scrolled
            ? 'bg-black/80 border-b border-white/20 shadow-lg'
            : 'bg-black/20 border-b border-white/10'
        }`}
      >
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="flex items-center cursor-pointer"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          {/* V Logo - part of the word */}
          <div className="relative w-12 h-12 sm:w-14 sm:h-14 overflow-hidden rounded-xl border border-white/10 bg-black/30 shadow-lg flex items-center justify-center -mr-2">
            <Image
              src="/assets/v-logo.jpg"
              alt="V"
              fill
              className="object-cover"
              priority
            />
          </div>
          {/* EDIT Text - connected to V to form VEDIT */}
          <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-pink-500 via-purple-500 to-sky-400 bg-clip-text text-transparent">
            EDIT
          </h1>
        </motion.div>
        
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={() => scrollToSection('hero')}
              className="text-white/80 hover:text-white transition-colors text-sm font-medium"
            >
              Home
            </button>
            <button
              onClick={() => scrollToSection('features')}
              className="text-white/80 hover:text-white transition-colors text-sm font-medium"
            >
              Features
            </button>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 transition-all"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          {/* Sign In Button */}
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
            className="px-4 sm:px-6 py-2 sm:py-3 rounded-xl bg-gradient-to-r from-vedit-pink via-vedit-purple to-vedit-blue text-white font-semibold text-sm sm:text-base hover:scale-105 transition-transform duration-300 shadow-glow cursor-pointer"
          >
            Sign In
          </motion.button>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <main id="hero" className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center text-white px-4 sm:px-6 py-20 sm:py-24 pt-24 sm:pt-28">
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-4 sm:mb-6 bg-gradient-to-r from-vedit-pink via-vedit-purple to-vedit-blue bg-clip-text text-transparent"
        >
          Edit with your voice or words.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="text-lg sm:text-xl md:text-2xl mb-6 sm:mb-8 max-w-3xl text-gray-200"
        >
          The most cinematic AI video editor powered by VIA
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4 }}
          className="text-base sm:text-lg md:text-xl mb-8 sm:mb-12 max-w-2xl text-gray-300"
        >
          AI-powered editing for creators, startups, and brands. Edit, manage, and publish your videos in seconds.
        </motion.p>
        
        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.6 }}
          className="flex flex-col sm:flex-row gap-4 mb-12 sm:mb-16"
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
            className="px-6 sm:px-8 py-3 sm:py-4 rounded-2xl bg-gradient-to-r from-vedit-pink via-vedit-purple to-vedit-blue text-white font-semibold text-base sm:text-lg hover:shadow-glow transition-all duration-300 shadow-glow animate-pulseGlow flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>🔐</span> Start Editing
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => scrollToSection('demo')}
            className="px-6 sm:px-8 py-3 sm:py-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white font-semibold text-base sm:text-lg hover:bg-white/20 transition-all duration-300 flex items-center justify-center gap-2"
          >
            <span>▶️</span> Watch Demo
          </motion.button>
        </motion.div>

        {/* Feature Grid */}
        <motion.div
          id="features"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.8 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-12 sm:mt-20 w-full max-w-6xl px-4 sm:px-6"
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1 + index * 0.1 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-4 sm:p-6 shadow-glow hover:shadow-glow-strong transition-all duration-300"
            >
              <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">{feature.icon}</div>
              <h3 className="text-lg sm:text-xl font-semibold mb-2 text-white">{feature.title}</h3>
              <p className="text-gray-300 text-xs sm:text-sm">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </main>

      {/* Demo Video Section */}
      <section id="demo" className="relative z-10 w-full max-w-[95vw] mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-8 sm:mb-12"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-vedit-pink via-vedit-purple to-vedit-blue bg-clip-text text-transparent">
            Watch Demo
          </h2>
          <p className="text-gray-300 text-base sm:text-lg max-w-2xl mx-auto">
            See VEDIT in action - AI-powered video editing with natural language commands
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative w-full mx-auto rounded-3xl overflow-hidden backdrop-blur-xl bg-black/80 border border-white/20 shadow-2xl"
        >
          {/* Mock Full Dashboard UI */}
          <div className="relative">
            {/* Action Navbar */}
            <div className="sticky top-0 z-50 px-4 py-3 backdrop-blur-md bg-[rgba(15,15,30,0.95)] border-b border-white/10">
              <div className="flex items-center justify-between gap-2 overflow-x-auto">
                {/* Feature Tabs */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {['🅣 Text', '✨ Effects', '🎬 Transitions', '🎧 Music', '🎨 Color'].map((feature, idx) => (
                    <div key={idx} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-medium whitespace-nowrap">
                      {feature}
                    </div>
                  ))}
                </div>
                {/* Action Buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs">🎨</div>
                  <div className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs">🤖</div>
                  <div className="h-5 w-px bg-white/10 mx-1" />
                  <div className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs">💾</div>
                  <div className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs">📤</div>
                  <div className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-vedit-pink/80 via-vedit-purple/80 to-vedit-blue/80 text-white text-xs font-semibold shadow-glow">
                    🚀 Publish
                  </div>
                </div>
              </div>
            </div>

            {/* Main Dashboard Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_320px] gap-4 p-4 min-h-[600px]">
              {/* Left: Media Upload */}
              <aside className="backdrop-blur-xl bg-black/30 border border-white/10 rounded-2xl p-4 overflow-hidden">
                <h3 className="text-lg font-semibold mb-4 text-white">Upload Media</h3>
                <div className="space-y-3">
                  <div className="rounded-lg border-2 border-dashed border-white/20 p-6 text-center">
                    <div className="text-3xl mb-2">📤</div>
                    <p className="text-xs text-gray-400">Drop files here</p>
                  </div>
                  <div className="space-y-2">
                    <div className="rounded-lg border border-white/10 bg-white/5 p-2 flex items-center gap-2">
                      <div className="w-12 h-8 bg-gradient-to-br from-vedit-purple/30 to-vedit-blue/30 rounded" />
                      <div className="flex-1">
                        <p className="text-xs text-white font-medium">video_sample.mp4</p>
                        <p className="text-[10px] text-gray-400">4:10 • 1080p</p>
                      </div>
                    </div>
                  </div>
                </div>
              </aside>

              {/* Center: Video Preview & Timeline */}
              <section className="flex flex-col gap-4 backdrop-blur-xl bg-black/20 border border-white/10 rounded-2xl p-4 overflow-hidden">
                {/* Video Preview */}
                <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-white/10 bg-black">
                  <div className="absolute inset-0 bg-gradient-to-br from-vedit-purple/20 via-black/60 to-vedit-blue/20 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-5xl mb-3">🎥</div>
                      <p className="text-white/60 text-sm">Video Preview</p>
                    </div>
                  </div>
                  {/* Video Controls */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                        <span className="text-white text-sm">▶️</span>
                      </div>
                      <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-vedit-purple to-vedit-blue rounded-full" style={{ width: '35%' }} />
                      </div>
                      <span className="text-white/80 text-xs">1:24 / 4:10</span>
                    </div>
                  </div>
                  {/* Edited Badge */}
                  <div className="absolute top-3 left-3 bg-vedit-purple/90 text-white px-2 py-1 rounded-lg text-xs font-medium">
                    ✏️ Edited
                  </div>
                </div>

                {/* Timeline */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>Multi-Track Timeline</span>
                    <span>1:24 / 4:10</span>
                  </div>
                  <div className="space-y-2">
                    {/* Video Track */}
                    <div className="flex gap-2">
                      <div className="w-24 flex-shrink-0 flex flex-col items-center gap-1 p-2 bg-white/5 rounded border border-white/10">
                        <span className="text-xs text-white font-medium">Video Track 1</span>
                        <span className="text-[10px] text-gray-400">video</span>
                      </div>
                      <div className="flex-1 relative h-12 bg-white/5 rounded border border-white/10 overflow-hidden">
                        <div className="absolute inset-0 flex">
                          {[0, 1, 2, 3, 4].map((i) => (
                            <div key={i} className="absolute top-0 bottom-0 w-px bg-white/10" style={{ left: `${i * 20}%` }} />
                          ))}
                        </div>
                        <div className="absolute left-0 top-0 bottom-0 w-[30%] bg-vedit-blue/30 border-r-2 border-vedit-blue/50 rounded-l flex items-center justify-center">
                          <span className="text-[10px] text-white font-medium">Intro (0:00-0:30)</span>
                        </div>
                        <div className="absolute left-[30%] top-0 bottom-0 w-[50%] bg-vedit-purple/30 border-r-2 border-vedit-purple/50 flex items-center justify-center">
                          <span className="text-[10px] text-white font-medium">Main (0:30-2:30)</span>
                        </div>
                        <div className="absolute left-[80%] top-0 bottom-0 w-[20%] bg-vedit-pink/30 rounded-r flex items-center justify-center">
                          <span className="text-[10px] text-white font-medium">Outro (2:30-3:00)</span>
                        </div>
                        {/* Playhead */}
                        <motion.div
                          className="absolute top-0 bottom-0 w-0.5 bg-vedit-blue border border-white/50 rounded-full shadow-glow z-10"
                          style={{ left: '35%', marginLeft: '-1px' }}
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 1, repeat: Infinity }}
                        />
                      </div>
                    </div>
                    {/* Audio Track */}
                    <div className="flex gap-2">
                      <div className="w-24 flex-shrink-0 flex flex-col items-center gap-1 p-2 bg-white/5 rounded border border-white/10">
                        <span className="text-xs text-white font-medium">Audio Track 1</span>
                        <span className="text-[10px] text-gray-400">audio</span>
                      </div>
                      <div className="flex-1 relative h-12 bg-white/5 rounded border border-white/10 overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-full bg-vedit-purple/20 rounded flex items-center justify-center">
                          <span className="text-[10px] text-white/60">Background Music</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Right: VIA Chat */}
              <aside className="backdrop-blur-xl bg-black/30 border border-white/10 rounded-2xl p-4 flex flex-col overflow-hidden">
                <h3 className="text-lg font-semibold mb-4 text-white">VIA Chat</h3>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto mb-4 space-y-3 pr-2">
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl p-3 bg-white/10 backdrop-blur-md text-gray-200 border border-white/20">
                      <p className="text-xs">Ask me anything about video editing or give me commands!</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl p-3 bg-gradient-to-r from-vedit-pink to-vedit-purple text-white">
                      <p className="text-xs">Apply cinematic color grade</p>
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl p-3 bg-white/10 backdrop-blur-md text-gray-200 border border-white/20">
                      <p className="text-xs">✅ Applied cinematic color grade to your video!</p>
                    </div>
                  </div>
                </div>
                {/* Input Area */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ask VIA or give editing commands..."
                      className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/20 text-white placeholder-gray-400 text-xs focus:outline-none focus:border-vedit-purple"
                      disabled
                    />
                    <div className="px-3 py-2 rounded-xl bg-gradient-to-r from-vedit-purple to-vedit-blue text-white text-xs font-semibold">
                      🎤
                    </div>
                  </div>
                  <button className="w-full px-4 py-2 rounded-xl bg-gradient-to-r from-vedit-pink via-vedit-purple to-vedit-blue text-white text-xs font-semibold shadow-glow">
                    Send ✨
                  </button>
                  <p className="text-[10px] text-gray-400 text-center">💬 Type or 🎤 Voice commands</p>
                </div>
              </aside>
            </div>

            {/* Feature Highlights */}
            <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-center">
                <span className="text-vedit-purple font-semibold">VIA AI</span>
                <p className="text-gray-400 text-[10px] mt-1">Natural language editing</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-center">
                <span className="text-vedit-blue font-semibold">V-Port</span>
                <p className="text-gray-400 text-[10px] mt-1">Multi-platform publishing</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-center">
                <span className="text-vedit-pink font-semibold">Auto-Enhance</span>
                <p className="text-gray-400 text-[10px] mt-1">AI-powered improvements</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-center">
                <span className="text-vedit-purple font-semibold">Templates</span>
                <p className="text-gray-400 text-[10px] mt-1">Professional presets</p>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Animated Features Section */}
      <section className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
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
              className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-4 sm:p-6 shadow-glow hover:shadow-glow-strong transition-all duration-300"
            >
              <div className={`text-4xl sm:text-5xl mb-4 bg-gradient-to-r ${feature.color} bg-clip-text text-transparent`}>
                {feature.icon}
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-2 text-white">{feature.title}</h3>
              <p className="text-gray-300 text-xs sm:text-sm leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Roadmap Section */}
      <section className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-8 sm:mb-12"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-vedit-pink via-vedit-purple to-vedit-blue bg-clip-text text-transparent">
            Roadmap
          </h2>
          <p className="text-gray-300 text-base sm:text-lg max-w-2xl mx-auto">
            Our journey to revolutionize video editing
          </p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {[
            {
              phase: 'Phase 1',
              title: 'VIA Chatbot',
              description: 'AI-powered natural language video editing assistant with voice commands',
              status: 'completed',
              icon: '✅'
            },
            {
              phase: 'Phase 2',
              title: 'AI Video Automation',
              description: 'Advanced scene detection, auto-trailer generation, and smart editing features',
              status: 'in-progress',
              icon: '🚧'
            },
            {
              phase: 'Phase 3',
              title: 'Monetization + Platform Publishing',
              description: 'Multi-platform publishing, scheduling, and revenue optimization tools',
              status: 'planned',
              icon: '📅'
            }
          ].map((item, index) => (
            <motion.div
              key={item.phase}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-4 sm:p-6 shadow-glow hover:shadow-glow-strong transition-all duration-300"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <div className="text-xs sm:text-sm text-gray-400">{item.phase}</div>
                  <h3 className="text-lg sm:text-xl font-semibold text-white">{item.title}</h3>
                </div>
              </div>
              <p className="text-gray-300 text-xs sm:text-sm leading-relaxed">{item.description}</p>
              <div className="mt-4">
                <span className={`text-xs px-2 py-1 rounded ${
                  item.status === 'completed' 
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : item.status === 'in-progress'
                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                    : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                }`}>
                  {item.status === 'completed' ? 'Completed' : item.status === 'in-progress' ? 'In Progress' : 'Planned'}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Enhanced Footer */}
      <footer className="relative z-10 w-full border-t border-white/10 bg-black/40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 mb-6 sm:mb-8">
            <div>
              <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 bg-gradient-to-r from-vedit-pink to-vedit-blue bg-clip-text text-transparent">
                About VEDIT
              </h3>
              <p className="text-gray-400 text-xs sm:text-sm leading-relaxed">
                The most cinematic AI video editor powered by VIA. Edit, manage, and publish your videos in seconds.
              </p>
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-white">Contact</h3>
              <a
                href="mailto:nitabariki070@gmail.com"
                className="text-gray-400 hover:text-vedit-purple text-xs sm:text-sm transition-colors flex items-center gap-2"
              >
                <span>📧</span>
                <span>nitabariki070@gmail.com</span>
              </a>
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-white">Powered By</h3>
              <p className="text-gray-400 text-xs sm:text-sm">
                AI
              </p>
            </div>
          </div>
          <div className="border-t border-white/10 pt-6 sm:pt-8 text-center">
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-xs sm:text-sm text-gray-400"
            >
              © 2025 VEDIT – Powered by AI
            </motion.p>
          </div>
        </div>
      </footer>

      {/* Floating Glow Effects */}
      <div className="fixed top-20 left-1/4 w-20 h-20 bg-vedit-purple/30 rounded-full blur-2xl animate-float pointer-events-none"></div>
      <div className="fixed bottom-40 right-1/4 w-16 h-16 bg-vedit-blue/30 rounded-full blur-xl animate-float pointer-events-none" style={{ animationDelay: '1s' }}></div>
      <div className="fixed top-1/2 right-1/3 w-12 h-12 bg-vedit-pink/30 rounded-full blur-lg animate-float pointer-events-none" style={{ animationDelay: '2s' }}></div>
    </div>
  )
}
