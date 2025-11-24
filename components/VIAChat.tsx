'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Suggestion {
  category: string
  recommendation: string
  reason?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isTyping?: boolean
  suggestions?: Suggestion[]
}

interface VIAChatProps {
  videoPublicId: string
  videoUrl?: string
  mediaType?: 'video' | 'image'
  onVideoUpdate: (url: string) => void
  externalCommand?: string
  onCommandProcessed?: () => void
  commandToInput?: string
  onInputPopulated?: () => void
}

// Typing animation component
function TypingIndicator() {
  return (
    <div className="flex gap-1.5 px-1">
      <motion.div
        className="w-2 h-2 bg-vedit-blue rounded-full"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
      />
      <motion.div
        className="w-2 h-2 bg-vedit-purple rounded-full"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
      />
      <motion.div
        className="w-2 h-2 bg-vedit-pink rounded-full"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
      />
    </div>
  )
}

// Animated text typing effect
function TypingText({ text, onComplete }: { text: string; onComplete?: () => void }) {
  const [displayedText, setDisplayedText] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(text.slice(0, currentIndex + 1))
        setCurrentIndex(currentIndex + 1)
      }, 20) // Typing speed: 20ms per character
      return () => clearTimeout(timeout)
    } else if (onComplete) {
      onComplete()
    }
  }, [currentIndex, text, onComplete])

  return <span>{displayedText}</span>
}

export default function VIAChat({ 
  videoPublicId, 
  videoUrl, 
  mediaType = 'video', 
  onVideoUpdate, 
  externalCommand, 
  onCommandProcessed, 
  commandToInput, 
  onInputPopulated 
}: VIAChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [isVoiceSupported, setIsVoiceSupported] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)
  const handleSendRef = useRef<((messageText?: string) => Promise<void>) | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Determine if message is a chat query or video editing command
  const isVideoEditingCommand = (text: string): boolean => {
    const lowerText = text.toLowerCase()
    const editingKeywords = [
      'trim', 'cut', 'merge', 'split', 'add', 'apply', 'remove', 'delete',
      'text', 'caption', 'effect', 'filter', 'color', 'grading', 'transition',
      'music', 'audio', 'voiceover', 'speed', 'crop', 'rotate', 'resize'
    ]
    return editingKeywords.some(keyword => lowerText.includes(keyword))
  }

  const handleSend = useCallback(async (messageText?: string) => {
    const text = messageText || input.trim()
    if (!text) return
    
    if (isLoading) return

    if (!videoPublicId && isVideoEditingCommand(text)) {
      alert('Please upload a video first')
      return
    }
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setIsTyping(true)

    try {
      const isEditingCommand = isVideoEditingCommand(text)
      const apiEndpoint = isEditingCommand ? '/api/via' : '/api/viaChat'
      
      const startTime = Date.now()
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEditingCommand ? {
            prompt: text,
            videoPublicId,
            videoUrl,
            mediaType,
          } : {
            message: text,
            context: {
              videoPublicId,
              hasVideo: !!videoPublicId,
              mediaType,
            },
          }),
        }),
      })

      const data = await response.json()
      const responseTime = Date.now() - startTime
      console.log(`⚡ ${isEditingCommand ? 'VIA' : 'VIA Chat'} response time: ${responseTime}ms`)

      let messageContent = ''
      let suggestions: Suggestion[] = []
      
      if (isEditingCommand) {
        // Video editing response
        const baseMessage = data.message || 'Video editing command processed successfully!'

        // If a new videoUrl is returned, the change has ALREADY been applied.
        // In that case, we ignore VIA's future-tense phrasing and replace it
        // with a clear past-tense confirmation so it doesn’t sound like
        // it will apply the effect again.
        if (data.videoUrl) {
          messageContent = '✅ Done! I’ve already applied that change to your video.'
        } else {
          messageContent = baseMessage
        }
        if (data.analysis) {
          messageContent += `\n\n${data.analysis}`
        }
        if (data.suggestions && Array.isArray(data.suggestions)) {
          messageContent += '\n\n📋 Suggestions:'
          suggestions = data.suggestions.map((suggestion: any) => ({
            category: suggestion.category || 'Feature',
            recommendation: suggestion.recommendation || suggestion,
            reason: suggestion.reason || '',
          }))
        }

        if (data.videoUrl) {
          onVideoUpdate(data.videoUrl)
        }
      } else {
        // Chat response
        messageContent = data.reply || 'I received your message. How can I help you with video editing?'
      }

      setIsTyping(false)
      
      // Add assistant message with typing animation
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: messageContent,
        timestamp: new Date(),
        isTyping: true,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
      }

      setMessages((prev) => [...prev, assistantMessage])
      
      // Simulate typing delay based on message length
      const typingDelay = Math.min(messageContent.length * 20, 2000)
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
      typingTimeoutRef.current = setTimeout(() => {
        setMessages((prev) => prev.map(msg => 
          msg.id === assistantMessage.id ? { ...msg, isTyping: false } : msg
        ))
      }, typingDelay)

    } catch (error) {
      console.error('Error:', error)
      setIsTyping(false)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, there was an error processing your request. Please try again.',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, videoPublicId, videoUrl, mediaType, onVideoUpdate])

  useEffect(() => {
    handleSendRef.current = handleSend
  }, [handleSend])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (externalCommand && externalCommand.trim() && !isLoading) {
      if (handleSendRef.current) {
        handleSendRef.current(externalCommand).then(() => {
          onCommandProcessed?.()
        }).catch(() => {
          onCommandProcessed?.()
        })
      }
    }
  }, [externalCommand, onCommandProcessed, isLoading])

  useEffect(() => {
    if (commandToInput && commandToInput.trim()) {
      setInput(commandToInput)
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.setSelectionRange(commandToInput.length, commandToInput.length)
        inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
      onInputPopulated?.()
    }
  }, [commandToInput, onInputPopulated])

  // Enhanced speech recognition setup
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
      if (SpeechRecognition) {
        setIsVoiceSupported(true)
        recognitionRef.current = new SpeechRecognition()
        recognitionRef.current.continuous = false
        recognitionRef.current.interimResults = true
        recognitionRef.current.lang = 'en-US'

        recognitionRef.current.onresult = (event: any) => {
          let interimTranscript = ''
          let finalTranscript = ''

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              finalTranscript += transcript
            } else {
              interimTranscript += transcript
            }
          }

          if (finalTranscript) {
            setInput(finalTranscript)
            setIsListening(false)
            setTimeout(() => {
              if (handleSendRef.current) {
                handleSendRef.current(finalTranscript)
              }
            }, 300)
          } else if (interimTranscript) {
            setInput(interimTranscript)
          }
        }

        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error)
          setIsListening(false)
          if (event.error === 'no-speech') {
            alert('No speech detected. Please try again.')
          }
        }

        recognitionRef.current.onend = () => {
          setIsListening(false)
        }
      } else {
        setIsVoiceSupported(false)
      }
    } else {
      setIsVoiceSupported(false)
    }
  }, [])

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      try {
        setIsListening(true)
        recognitionRef.current.start()
      } catch (error) {
        console.error('Failed to start speech recognition:', error)
        setIsListening(false)
      }
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
      <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2 scrollbar-thin scrollbar-thumb-vedit-purple/50 scrollbar-track-transparent">
        <AnimatePresence>
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full text-center px-4"
            >
              <div className="text-4xl mb-3">🎬</div>
              <h3 className="text-lg font-semibold text-white mb-2">VIA Assistant</h3>
              <p className="text-sm text-gray-400 max-w-xs">
                Ask me anything about video editing or give me commands to edit your video!
              </p>
            </motion.div>
          )}
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[80%] rounded-2xl p-3 sm:p-4 shadow-lg ${
                  message.role === 'user'
                    ? 'bg-gradient-to-r from-vedit-pink to-vedit-purple text-white'
                    : 'bg-white/10 backdrop-blur-md text-gray-200 border border-white/20'
                }`}
              >
                {message.isTyping && message.role === 'assistant' ? (
                  <TypingText text={message.content} />
                ) : (
                  <>
                    <p className="text-sm sm:text-base whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    {message.suggestions && message.suggestions.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs font-semibold text-gray-300 mb-2">Click to apply:</p>
                        {message.suggestions.map((suggestion, index) => (
                          <motion.button
                            key={index}
                            whileHover={{ scale: 1.02, x: 4 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                              // Extract the action from the recommendation
                              const recommendation = suggestion.recommendation
                              // Send command to apply the suggestion
                              handleSend(recommendation)
                            }}
                            className="w-full text-left px-3 py-2 rounded-lg bg-gradient-to-r from-vedit-purple/20 to-vedit-blue/20 hover:from-vedit-purple/30 hover:to-vedit-blue/30 border border-vedit-purple/30 hover:border-vedit-purple/50 transition-all duration-200 group"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="text-xs font-semibold text-vedit-purple group-hover:text-vedit-blue transition-colors">
                                  {suggestion.category}
                                </p>
                                <p className="text-sm text-white/90 mt-1">{suggestion.recommendation}</p>
                                {suggestion.reason && (
                                  <p className="text-xs text-gray-400 mt-1">{suggestion.reason}</p>
                                )}
                              </div>
                              <span className="text-lg opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-300 mr-2">VIA is thinking</span>
                <TypingIndicator />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Ask VIA or give editing commands..."
              disabled={isLoading}
              className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-vedit-purple focus:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
            />
            {isListening && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              </motion.div>
            )}
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={isListening ? stopListening : startListening}
            disabled={!recognitionRef.current || isLoading}
            className={`px-4 py-3 rounded-xl transition-all ${
              isListening
                ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                : 'bg-gradient-to-r from-vedit-purple to-vedit-blue hover:from-vedit-purple/80 hover:to-vedit-blue/80'
            } text-white font-semibold shadow-glow disabled:opacity-50 disabled:cursor-not-allowed`}
            title={isListening ? 'Stop Voice Input' : 'Start Voice Input'}
          >
            <span className="text-lg">{isListening ? '🔴' : '🎤'}</span>
          </motion.button>
        </div>
        
        <div className="flex items-center justify-between text-xs text-gray-400 px-2">
          <div className="flex items-center gap-2">
            <span>💬 Type</span>
            {recognitionRef.current && <span className="hidden sm:inline">or 🎤 Voice</span>}
          </div>
          <div className="flex items-center gap-3">
            {messages.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Clear all chat messages?')) {
                    setMessages([])
                  }
                }}
                className="text-red-400 hover:text-red-300 transition-colors text-xs"
                title="Clear chat"
              >
                🗑️ Clear
              </button>
            )}
            {!isVoiceSupported && (
              <span className="text-yellow-400/80 text-xs hidden sm:inline">⚠️ Voice: Chrome/Edge</span>
            )}
          </div>
        </div>
        
        <motion.button
          whileHover={{ scale: isLoading ? 1 : 1.02 }}
          whileTap={{ scale: isLoading ? 1 : 0.98 }}
          onClick={() => handleSend()}
          disabled={isLoading || !input.trim()}
          className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-vedit-pink via-vedit-purple to-vedit-blue text-white font-semibold hover:shadow-glow transition-all duration-300 shadow-glow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span>Processing...</span>
            </>
          ) : (
            <>
              <span>Send</span>
              <span className="text-lg">✨</span>
            </>
          )}
        </motion.button>
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
