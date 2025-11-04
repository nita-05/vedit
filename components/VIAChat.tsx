'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface VIAChatProps {
  videoPublicId: string
  videoUrl?: string // Current video URL to continue editing
  mediaType?: 'video' | 'image' // Media type: video or image
  onVideoUpdate: (url: string) => void
  externalCommand?: string
  onCommandProcessed?: () => void
  commandToInput?: string // New prop: populate input field instead of auto-sending
  onInputPopulated?: () => void // Callback when input is populated
}

export default function VIAChat({ videoPublicId, videoUrl, mediaType = 'video', onVideoUpdate, externalCommand, onCommandProcessed, commandToInput, onInputPopulated }: VIAChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)
  const handleSendRef = useRef<((messageText?: string) => Promise<void>) | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Define handleSend before useEffect hooks that depend on it
  const handleSend = useCallback(async (messageText?: string) => {
    const text = messageText || input.trim()
    if (!text) {
      console.warn('⚠️ VIAChat: handleSend called with empty text')
      return
    }
    
    if (isLoading) {
      console.warn('⚠️ VIAChat: handleSend called while already loading')
      return
    }

    if (!videoPublicId) {
      alert('Please upload a video first')
      return
    }
    
    console.log('📤 VIAChat: handleSend called with text:', text)

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const startTime = Date.now()
      const response = await fetch('/api/via', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          videoPublicId,
          videoUrl, // Pass current video URL to continue editing
          mediaType, // Pass media type (video or image)
        }),
      })

      const data = await response.json()
      const responseTime = Date.now() - startTime
      console.log(`⚡ VIA response time: ${responseTime}ms`)

      // Build comprehensive message content
      let messageContent = data.message || 'Video editing command processed successfully!'
      
      // Add analysis if present
      if (data.analysis) {
        messageContent += `\n\n${data.analysis}`
      }
      
      // Add suggestions if present
      if (data.suggestions && Array.isArray(data.suggestions)) {
        messageContent += '\n\n📋 Suggestions:'
        data.suggestions.forEach((suggestion: any, index: number) => {
          const category = suggestion.category || 'Feature'
          const recommendation = suggestion.recommendation || suggestion
          const reason = suggestion.reason || ''
          messageContent += `\n${index + 1}. **${category}**: ${recommendation}`
          if (reason) {
            messageContent += ` (${reason})`
          }
        })
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: messageContent,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])

      if (data.videoUrl) {
        console.log('📹 VIAChat: Received videoUrl from API:', data.videoUrl)
        console.log('📹 VIAChat: Calling onVideoUpdate with:', data.videoUrl)
        onVideoUpdate(data.videoUrl)
        console.log('📹 VIAChat: onVideoUpdate called successfully')
      } else {
        // No videoUrl is expected for interactive questions or analysis
        console.log('💬 VIAChat: Interactive message (no video processing)')
      }
    } catch (error) {
      console.error('Error:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, there was an error processing your request.',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, videoPublicId, onVideoUpdate])

  // Keep ref updated with latest handleSend
  useEffect(() => {
    handleSendRef.current = handleSend
  }, [handleSend])

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Handle external commands (auto-send mode)
  useEffect(() => {
    if (externalCommand && externalCommand.trim()) {
      console.log('📥 VIAChat: externalCommand received:', externalCommand)
      if (handleSendRef.current) {
        handleSendRef.current(externalCommand).then(() => {
          onCommandProcessed?.()
        })
      }
    }
  }, [externalCommand, onCommandProcessed])

  // Handle command to input (populate input field for editing)
  useEffect(() => {
    if (commandToInput && commandToInput.trim()) {
      console.log('📥 VIAChat: Populating input with commandToInput:', commandToInput)
      setInput(commandToInput)
      // Focus on input field and place cursor at end
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.setSelectionRange(commandToInput.length, commandToInput.length)
        // Scroll input into view if needed
        inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
      // Notify parent that input was populated
      onInputPopulated?.()
    }
  }, [commandToInput, onInputPopulated])

  // Setup speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition()
        recognitionRef.current.continuous = false
        recognitionRef.current.interimResults = false
        recognitionRef.current.lang = 'en-US'

        recognitionRef.current.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript
          setInput(transcript)
          setIsListening(false)
          // Call handleSend after setting input using ref to get latest version
          setTimeout(() => {
            if (handleSendRef.current) {
              handleSendRef.current(transcript)
            }
          }, 0)
        }

        recognitionRef.current.onerror = () => {
          setIsListening(false)
        }

        recognitionRef.current.onend = () => {
          setIsListening(false)
        }
      }
    }
  }, [])

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      setIsListening(true)
      recognitionRef.current.start()
    }
  }

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl p-3 ${
                  message.role === 'user'
                    ? 'bg-gradient-to-r from-vedit-pink to-vedit-purple text-white'
                    : 'bg-white/10 backdrop-blur-sm text-gray-200 border border-white/20'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3">
              <div className="flex gap-2">
                <div className="w-2 h-2 bg-vedit-blue rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-vedit-purple rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 bg-vedit-pink rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type or speak your editing command..."
            className="flex-1 px-4 py-2 rounded-xl bg-black/30 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-vedit-purple focus:shadow-glow transition-all"
          />
          <button
            onClick={isListening ? stopListening : startListening}
            className={`px-4 py-2 rounded-xl transition-all ${
              isListening
                ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                : 'bg-gradient-to-r from-vedit-purple to-vedit-blue hover:scale-105'
            } text-white font-semibold shadow-glow`}
            title={isListening ? 'Stop Voice Input' : 'Start Voice Input (🎤)'}
            disabled={!recognitionRef.current}
          >
            🎤 {isListening ? 'Listening...' : ''}
          </button>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-400 px-2">
          <span>💬 Type or 🎤 Use voice</span>
          {!recognitionRef.current && (
            <span className="text-yellow-400">⚠️ Voice not available (Chrome/Edge recommended)</span>
          )}
        </div>
        <button
          onClick={() => handleSend()}
          disabled={isLoading || !input.trim()}
          className="w-full px-4 py-2 rounded-xl bg-gradient-to-r from-vedit-pink via-vedit-purple to-vedit-blue text-white font-semibold hover:scale-105 transition-transform duration-300 shadow-glow disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Processing...' : 'Send'}
        </button>
      </div>
    </div>
  )
}

declare global {
  interface Window {
    webkitSpeechRecognition: any
    SpeechRecognition: any
  }
}
