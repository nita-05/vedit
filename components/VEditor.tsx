'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const createFFmpegPromise = () => import('@ffmpeg/ffmpeg').then(mod => mod.createFFmpeg)
const fetchFilePromise = () => import('@ffmpeg/util').then(mod => mod.fetchFile)

interface VideoClip {
  id: string
  file: File
  url: string
  name: string
  duration: number
}

const secondsToTimestamp = (seconds: number) => {
  const clamped = Math.max(0, seconds)
  const h = Math.floor(clamped / 3600)
  const m = Math.floor((clamped % 3600) / 60)
  const s = Math.floor(clamped % 60)
  const formatUnit = (value: number) => value.toString().padStart(2, '0')
  return h > 0 ? `${formatUnit(h)}:${formatUnit(m)}:${formatUnit(s)}` : `${formatUnit(m)}:${formatUnit(s)}`
}

export default function VEditor() {
  const [clips, setClips] = useState<VideoClip[]>([])
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoadingFFmpeg, setIsLoadingFFmpeg] = useState(false)
  const [ffmpegError, setFFmpegError] = useState<string | null>(null)
  const [supportsWebAssembly, setSupportsWebAssembly] = useState(true)
  const [ffmpegReady, setFfmpegReady] = useState(false)
  const ffmpegRef = useRef<any>(null)
  const fetchFileRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const supported = typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function'
      setSupportsWebAssembly(supported)
      if (!supported) {
        setFFmpegError('⚠️ Your browser does not support WebAssembly. Please try on Chrome, Edge, or Firefox.')
      }
    }
  }, [])

  const loadFFmpeg = useCallback(async () => {
    if (!supportsWebAssembly || ffmpegReady || isLoadingFFmpeg) {
      return
    }

    try {
      setIsLoadingFFmpeg(true)
      const [createFFmpeg, fetchFile] = await Promise.all([createFFmpegPromise(), fetchFilePromise()])
      fetchFileRef.current = fetchFile

      ffmpegRef.current = createFFmpeg({
        log: false,
        corePath: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/ffmpeg-core.js',
      })

      await ffmpegRef.current.load()
      setFfmpegReady(true)
    } catch (error) {
      console.error('Failed to load FFmpeg:', error)
      setFFmpegError('⚠️ Unable to load FFmpeg in the browser.')
    } finally {
      setIsLoadingFFmpeg(false)
    }
  }, [supportsWebAssembly, ffmpegReady, isLoadingFFmpeg])

  useEffect(() => {
    loadFFmpeg()
  }, [loadFFmpeg])

  useEffect(() => {
    return () => {
      clips.forEach(clip => URL.revokeObjectURL(clip.url))
      if (outputUrl) {
        URL.revokeObjectURL(outputUrl)
      }
    }
  }, [clips, outputUrl])

  const selectedClip = useMemo(
    () => clips.find(clip => clip.id === selectedClipId) || clips[0] || null,
    [clips, selectedClipId],
  )

  useEffect(() => {
    if (selectedClip) {
      setTrimStart(0)
      setTrimEnd(selectedClip.duration)
    }
  }, [selectedClip])

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const newClips: VideoClip[] = []

    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file)
      const id = `${file.name}-${Date.now()}`
      const duration = await getVideoDuration(url)

      newClips.push({
        id,
        file,
        url,
        name: file.name,
        duration,
      })
    }

    setClips(prev => [...prev, ...newClips])
    setSelectedClipId(prev => prev ?? newClips[0]?.id ?? null)
    setOutputUrl(null)
  }

  const getVideoDuration = (url: string): Promise<number> => {
    return new Promise(resolve => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.src = url
      video.onloadedmetadata = () => {
        resolve(Number(video.duration) || 0)
        video.remove()
      }
      video.onerror = () => {
        resolve(0)
        video.remove()
      }
    })
  }

  const handleTrim = async () => {
    if (!selectedClip) {
      alert('Please select a clip to trim.')
      return
    }

    if (!ffmpegReady || !ffmpegRef.current || !fetchFileRef.current) {
      alert('FFmpeg is still loading. Please wait a moment and try again.')
      return
    }

    if (trimStart < 0 || trimEnd <= trimStart || trimEnd > selectedClip.duration) {
      alert('Please provide a valid start and end time.')
      return
    }

    const ffmpeg = ffmpegRef.current
    const fetchFile = fetchFileRef.current

    setIsProcessing(true)

    try {
      const inputName = 'input.mp4'
      const outputName = 'trimmed.mp4'
      ffmpeg.FS('writeFile', inputName, await fetchFile(selectedClip.file))

      await ffmpeg.run(
        '-i',
        inputName,
        '-ss',
        trimStart.toString(),
        '-to',
        trimEnd.toString(),
        '-c',
        'copy',
        outputName,
      )

      const data = ffmpeg.FS('readFile', outputName)
      const trimmedFile = new File([data.buffer], `trimmed-${selectedClip.name}`, { type: 'video/mp4' })
      const url = URL.createObjectURL(trimmedFile)
      const duration = trimEnd - trimStart

      setClips(prev =>
        prev.map(clip =>
          clip.id === selectedClip.id
            ? {
                ...clip,
                file: trimmedFile,
                url,
                duration,
                name: trimmedFile.name,
              }
            : clip,
        ),
      )
      setOutputUrl(url)

      ffmpeg.FS('unlink', inputName)
      ffmpeg.FS('unlink', outputName)

      alert('✅ Trimmed clip created. Preview updated.')
    } catch (error) {
      console.error('Trim failed:', error)
      alert('Failed to trim the clip. Make sure the video format is supported.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleMerge = async () => {
    if (clips.length < 2) {
      alert('Upload at least two clips to merge.')
      return
    }

    if (!ffmpegReady || !ffmpegRef.current || !fetchFileRef.current) {
      alert('FFmpeg is still loading. Please wait a moment and try again.')
      return
    }

    const ffmpeg = ffmpegRef.current
    const fetchFile = fetchFileRef.current

    setIsProcessing(true)

    try {
      const listContent: string[] = []
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i]
        const inputName = `clip${i}.mp4`
        ffmpeg.FS('writeFile', inputName, await fetchFile(clip.file))
        listContent.push(`file ${inputName}`)
      }

      const listFile = 'concat-list.txt'
      ffmpeg.FS('writeFile', listFile, new TextEncoder().encode(listContent.join('\n')))

      const outputName = 'merged.mp4'
      try {
        await ffmpeg.run('-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outputName)
      } catch (concatError) {
        console.warn('Fast concat failed, retrying with re-encode.', concatError)
        await ffmpeg.run('-f', 'concat', '-safe', '0', '-i', listFile, '-c:v', 'libx264', '-c:a', 'aac', '-movflags', 'faststart', outputName)
      }

      const data = ffmpeg.FS('readFile', outputName)
      const mergedFile = new File([data.buffer], `merged-${Date.now()}.mp4`, { type: 'video/mp4' })
      const url = URL.createObjectURL(mergedFile)
      const mergedDuration = clips.reduce((total, clip) => total + clip.duration, 0)

      clips.forEach((_, index) => {
        ffmpeg.FS('unlink', `clip${index}.mp4`)
      })
      ffmpeg.FS('unlink', listFile)
      ffmpeg.FS('unlink', outputName)

      setClips([
        {
          id: `merged-${Date.now()}`,
          file: mergedFile,
          url,
          name: 'Merged Video',
          duration: mergedDuration,
        },
      ])
      setSelectedClipId(null)
      setOutputUrl(url)

      alert('✅ Clips merged successfully. Preview updated.')
    } catch (error) {
      console.error('Merge failed:', error)
      alert('Failed to merge clips. Ensure all videos share the same codec.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleExport = () => {
    const clipToExport = selectedClip || clips[0]
    const urlToDownload = outputUrl || clipToExport?.url

    if (!clipToExport || !urlToDownload) {
      alert('Nothing to export yet. Upload or process a video first.')
      return
    }

    const link = document.createElement('a')
    link.href = urlToDownload
    link.download = clipToExport.name || `vedit-export-${Date.now()}.mp4`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    alert('✅ Export started. Your download should begin shortly.')
  }

  const totalDuration = clips.reduce((total, clip) => total + clip.duration, 0)

  const renderTimeline = () => {
    if (clips.length === 0) {
      return (
        <div className="flex items-center justify-center h-32 rounded-xl border border-dashed border-white/10 text-gray-400">
          Upload videos to start building your timeline.
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>Timeline</span>
          <span>•</span>
          <span>Total Duration: {secondsToTimestamp(totalDuration)}</span>
        </div>
        <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black/40 p-4">
          <div className="flex h-16">
            {clips.map(clip => {
              const widthPercent = totalDuration > 0 ? (clip.duration / totalDuration) * 100 : 100 / clips.length
              const isSelected = clip.id === selectedClip?.id
              return (
                <motion.button
                  key={clip.id}
                  type="button"
                  onClick={() => setSelectedClipId(clip.id)}
                  style={{ width: `${widthPercent}%` }}
                  className={`relative flex flex-col justify-center items-center gap-1 border-r border-white/5 py-2 transition-all ${
                    isSelected ? 'bg-vedit-purple/30 shadow-glow scale-[1.02]' : 'bg-white/5 hover:bg-white/10'
                  }`}
                  whileHover={{ scale: isSelected ? 1.02 : 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <span className="text-xs font-semibold text-white truncate px-2">{clip.name}</span>
                  <span className="text-[10px] text-gray-300">{secondsToTimestamp(clip.duration)}</span>
                </motion.button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  if (!supportsWebAssembly) {
    return (
      <div className="w-full min-h-[60vh] flex items-center justify-center">
        <div className="max-w-lg text-center p-6 rounded-2xl border border-red-500/40 bg-red-500/10 text-red-200">
          {ffmpegError}
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full max-w-6xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-vedit-purple/10 via-black/60 to-vedit-blue/10 rounded-3xl blur-3xl opacity-70" />
      <div className="relative border border-white/10 rounded-3xl bg-black/60 backdrop-blur-2xl shadow-2xl p-6 sm:p-10 space-y-8">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-vedit-pink via-vedit-purple to-vedit-blue bg-clip-text text-transparent">
              V-Editor
            </h1>
            <p className="text-gray-300 max-w-2xl mt-2">
              Upload clips, trim precise segments, merge videos, and export — all powered by FFmpeg running directly in
              your browser.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className={`w-2 h-2 rounded-full ${ffmpegReady ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
            <span>{ffmpegReady ? 'FFmpeg ready' : isLoadingFFmpeg ? 'Loading FFmpeg...' : 'Initializing FFmpeg'}</span>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
          <motion.button
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-vedit-pink via-vedit-purple to-vedit-blue text-white font-semibold shadow-glow flex items-center gap-2 text-sm"
          >
            📤 Upload Videos
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            disabled={!selectedClip || isProcessing}
            onClick={handleTrim}
            className="px-6 py-3 rounded-2xl bg-white/10 border border-white/15 text-white font-semibold flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ✂️ Trim Clip
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            disabled={clips.length < 2 || isProcessing}
            onClick={handleMerge}
            className="px-6 py-3 rounded-2xl bg-white/10 border border-white/15 text-white font-semibold flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🔗 Merge Clips
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            disabled={clips.length === 0}
            onClick={handleExport}
            className="px-6 py-3 rounded-2xl bg-vedit-blue/20 border border-vedit-blue/40 text-white font-semibold flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🚀 Export Video
          </motion.button>
        </div>

        {clips.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-white/10 bg-black">
                {selectedClip ? (
                  <video
                    key={selectedClip.id + selectedClip.url}
                    src={selectedClip.url}
                    controls
                    className="w-full h-full object-contain"
                    preload="metadata"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400">Select a clip to preview</div>
                )}
              </div>

              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">Trim Settings</h2>
                {selectedClip ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs text-gray-400 uppercase">Start Time (seconds)</label>
                      <input
                        type="number"
                        min={0}
                        max={Math.max(0, selectedClip.duration - 1)}
                        step="0.1"
                        value={trimStart}
                        onChange={event => setTrimStart(Number(event.target.value))}
                        className="px-4 py-2 rounded-xl bg-black/40 border border-white/10 text-white focus:border-vedit-purple focus:outline-none"
                      />
                      <span className="text-xs text-gray-500">{secondsToTimestamp(trimStart)}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs text-gray-400 uppercase">End Time (seconds)</label>
                      <input
                        type="number"
                        min={trimStart + 0.1}
                        max={selectedClip.duration}
                        step="0.1"
                        value={trimEnd}
                        onChange={event => setTrimEnd(Number(event.target.value))}
                        className="px-4 py-2 rounded-xl bg-black/40 border border-white/10 text-white focus:border-vedit-purple focus:outline-none"
                      />
                      <span className="text-xs text-gray-500">{secondsToTimestamp(trimEnd)}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs text-gray-400 uppercase">Clip Duration</label>
                      <div className="px-4 py-2 rounded-xl bg-black/40 border border-white/10 text-white">
                        {secondsToTimestamp(selectedClip.duration)}
                      </div>
                      <span className="text-xs text-gray-500">
                        Trim length: {secondsToTimestamp(Math.max(0, trimEnd - trimStart))}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Select a clip to adjust trimming.</p>
                )}
              </div>
            </div>

            <aside className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
                <h2 className="text-lg font-semibold text-white">Clip Library</h2>
                <div className="space-y-3 max-h-72 overflow-y-auto pr-2">
                  {clips.map(clip => {
                    const isSelected = clip.id === selectedClip?.id
                    return (
                      <motion.button
                        key={clip.id}
                        onClick={() => setSelectedClipId(clip.id)}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-vedit-purple/60 bg-vedit-purple/20 text-white shadow-glow'
                            : 'border-white/10 bg-black/20 text-gray-200 hover:border-vedit-purple/40'
                        }`}
                        whileHover={{ scale: isSelected ? 1.01 : 1.02 }}
                        whileTap={{ scale: 0.99 }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold truncate">{clip.name}</span>
                          <span className="text-xs text-gray-400">{secondsToTimestamp(clip.duration)}</span>
                        </div>
                      </motion.button>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
                <h2 className="text-lg font-semibold text-white">Processed Output</h2>
                {outputUrl ? (
                  <video key={outputUrl} src={outputUrl} controls className="w-full rounded-xl" preload="metadata" />
                ) : (
                  <p className="text-sm text-gray-400">
                    Processed clips will appear here after you trim or merge videos.
                  </p>
                )}
              </div>
            </aside>
          </div>
        )}

        <div>{renderTimeline()}</div>

        <AnimatePresence>
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                className="px-6 py-4 rounded-2xl border border-white/20 bg-black/70 text-white flex items-center gap-3"
              >
                <div className="w-6 h-6 border-4 border-vedit-purple border-t-transparent rounded-full animate-spin" />
                <div>
                  <p className="font-semibold text-sm">Processing video...</p>
                  <p className="text-xs text-gray-300">This runs locally in your browser using FFmpeg.wasm.</p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}


