'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'

interface Clip {
  id: string
  start: number
  end: number
  name: string
  thumbnail?: string
  track?: 'video' | 'audio' | 'text' | 'overlay'
  videoPublicId?: string // Video source this clip belongs to
  videoUrl?: string // Video URL this clip belongs to
}

interface TimelineTrack {
  id: string
  type: 'video' | 'audio' | 'text' | 'overlay'
  name: string
  clips: Clip[]
  visible: boolean
  muted: boolean
  locked: boolean
}

interface TimelineViewProps {
  videoPublicId: string
  videoUrl?: string // Current video URL for clips
  videoName?: string // Video name for clip naming
  currentTime?: number
  duration?: number
  onTrim?: (start: number, end: number) => void
  onDeleteClip?: (clipId: string) => void
  onSplitClip?: (time: number) => void
  onMergeClips?: (clipIds: string[], clips?: Clip[]) => void // Pass clips with video source info
  multiTrack?: boolean // Enable multi-track mode
}

export default function TimelineView({ 
  videoPublicId,
  videoUrl,
  videoName,
  currentTime = 0, 
  duration = 0,
  onTrim,
  onDeleteClip,
  onSplitClip,
  onMergeClips,
  multiTrack = true, // Default to multi-track mode
}: TimelineViewProps) {
  const [clips, setClips] = useState<Clip[]>([])
  const [tracks, setTracks] = useState<TimelineTrack[]>([
    { id: 'track_video_0', type: 'video', name: 'Video Track 1', clips: [], visible: true, muted: false, locked: false },
    { id: 'track_audio_0', type: 'audio', name: 'Audio Track 1', clips: [], visible: true, muted: false, locked: false },
  ])
  const [selectedClip, setSelectedClip] = useState<string | null>(null)
  const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set())
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [draggingClip, setDraggingClip] = useState<string | null>(null)
  const [dragType, setDragType] = useState<'start' | 'end' | 'move' | null>(null)
  const [dragStart, setDragStart] = useState<number | null>(null)
  const [dragEnd, setDragEnd] = useState<number | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (videoPublicId) {
      fetchTimelineData()
    }
  }, [videoPublicId])
  
  // Auto-create default clip when duration is available and no clips exist
  useEffect(() => {
    if (duration > 0 && clips.length === 0 && videoPublicId) {
      const defaultName = videoName 
        ? generateClipName(0, duration, videoName)
        : `Main Video (0:00-${formatTime(duration)})`
      setClips([{
        id: `clip_${Date.now()}`,
        start: 0,
        end: duration,
        name: defaultName,
        videoPublicId: videoPublicId,
        videoUrl: videoUrl,
      }])
    }
  }, [duration, videoPublicId, videoUrl, videoName])

  useEffect(() => {
    // Initialize tracks with clips when clips are loaded
    if (multiTrack && clips.length > 0 && tracks.length > 0) {
      setTracks(prevTracks => {
        const updatedTracks = [...prevTracks]
        // Distribute clips to tracks based on their track property or default to first video track
        clips.forEach(clip => {
          const trackType = clip.track || 'video'
          const targetTrack = updatedTracks.find(t => t.type === trackType)
          if (targetTrack && !targetTrack.clips.find(c => c.id === clip.id)) {
            targetTrack.clips.push(clip)
          } else if (!clip.track && updatedTracks[0]) {
            // If no track specified, add to first video track
            updatedTracks[0].clips.push(clip)
          }
        })
        return updatedTracks
      })
    }
  }, [clips, multiTrack])
  
  // Update clips when video changes to preserve video source info
  useEffect(() => {
    if (videoPublicId && videoUrl) {
      setClips(prev => prev.map(clip => ({
        ...clip,
        videoPublicId: clip.videoPublicId || videoPublicId,
        videoUrl: clip.videoUrl || videoUrl,
      })))
    }
  }, [videoPublicId, videoUrl])

  const fetchTimelineData = async () => {
    try {
      const response = await fetch(`/api/timeline?publicId=${videoPublicId}`)
      const data = await response.json()
      if (data.clips) {
        setClips(data.clips)
      } else if (duration > 0) {
        // If no clips, create 2 default clips (split at midpoint) for better editing experience
        const midpoint = duration / 2
        const clip1Name = videoName 
          ? generateClipName(0, midpoint, videoName)
          : `Clip 0:00-${formatTime(midpoint)}`
        const clip2Name = videoName 
          ? generateClipName(midpoint, duration, videoName)
          : `Clip ${formatTime(midpoint)}-${formatTime(duration)}`
        
        setClips([
          {
            id: `clip_0_${Date.now()}`,
            start: 0,
            end: midpoint,
            name: clip1Name,
            videoPublicId: videoPublicId,
            videoUrl: videoUrl,
            track: 'video',
          },
          {
            id: `clip_1_${Date.now()}`,
            start: midpoint,
            end: duration,
            name: clip2Name,
            videoPublicId: videoPublicId,
            videoUrl: videoUrl,
            track: 'video',
          }
        ])
      }
    } catch (error) {
      console.error('Failed to fetch timeline:', error)
    }
  }

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || duration === 0) return
    
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = x / rect.width
    const time = percentage * duration
    
    // If shift is held, split clip at this point (KEYBOARD SHORTCUT)
    if (e.shiftKey && onSplitClip) {
      // Find the clip at this time point OR the nearest clip
      let clipAtTime = clips.find(c => time >= c.start && time <= c.end)
      
      // If no clip found at this exact time, find the nearest clip (for splitting between clips)
      if (!clipAtTime && clips.length > 0) {
        // Find the clip that this time point would fall into or is closest to
        const sortedClips = [...clips].sort((a, b) => a.start - b.start)
        
        // Check if clicking at a boundary between clips
        for (let i = 0; i < sortedClips.length - 1; i++) {
          const currentClip = sortedClips[i]
          const nextClip = sortedClips[i + 1]
          
          // If clicking exactly at the boundary (within 0.1s tolerance)
          if (Math.abs(time - currentClip.end) < 0.1 || Math.abs(time - nextClip.start) < 0.1) {
            // Split the next clip at its start (or current at its end)
            clipAtTime = nextClip
            break
          }
        }
        
        // If still no clip, find the nearest clip that starts after this time
        if (!clipAtTime) {
          clipAtTime = sortedClips.find(c => c.start >= time) || sortedClips[sortedClips.length - 1]
        }
      }
      
      if (clipAtTime) {
        const clipStartTime = clipAtTime.start
        const clipEndTime = clipAtTime.end
        const minSplitDistance = 0.1 // Reduced to 0.1s to allow splitting at boundaries
        
        // Allow splitting at boundaries (exactly at start/end) or within clip
        const canSplitAtBoundary = (Math.abs(time - clipStartTime) < 0.1 || Math.abs(time - clipEndTime) < 0.1)
        const canSplitWithin = time > clipStartTime + minSplitDistance && time < clipEndTime - minSplitDistance
        
        if (canSplitAtBoundary || canSplitWithin) {
          // If splitting at start boundary, split the previous clip if exists
          if (Math.abs(time - clipStartTime) < 0.1 && time > 0) {
            // Find the clip that ends at this time
            const prevClip = clips.find(c => Math.abs(c.end - time) < 0.1)
            if (prevClip) {
              // Split the previous clip at its end (which is this boundary)
              const splitTimeActual = prevClip.end
              const newClipId1 = `clip_${Date.now()}_1`
              const newClipId2 = `clip_${Date.now()}_2`
              
              const clip1Name = generateClipName(prevClip.start, splitTimeActual, videoName)
              const clip2Name = generateClipName(splitTimeActual, prevClip.end, videoName)
              
              setClips(prev => {
                const updated = prev.filter(c => c.id !== prevClip.id)
                updated.push({
                  id: newClipId1,
                  start: prevClip.start,
                  end: splitTimeActual,
                  name: clip1Name,
                  videoPublicId: prevClip.videoPublicId || videoPublicId,
                  videoUrl: prevClip.videoUrl || videoUrl,
                  track: prevClip.track,
                })
                updated.push({
                  id: newClipId2,
                  start: splitTimeActual,
                  end: prevClip.end,
                  name: clip2Name,
                  videoPublicId: prevClip.videoPublicId || videoPublicId,
                  videoUrl: prevClip.videoUrl || videoUrl,
                  track: prevClip.track,
                })
                return updated.sort((a, b) => a.start - b.start)
              })
              
              onSplitClip(splitTimeActual)
              console.log(`✂️ Split clip at boundary ${formatTime(splitTimeActual)}`)
              return
            }
          }
          
          // Normal split within clip or at end boundary
          const splitTimeActual = canSplitAtBoundary && Math.abs(time - clipEndTime) < 0.1 
            ? clipEndTime - 0.1 // Split slightly before end
            : time
          
          if (splitTimeActual > clipStartTime && splitTimeActual < clipEndTime) {
            const newClipId1 = `clip_${Date.now()}_1`
            const newClipId2 = `clip_${Date.now()}_2`
            
            const clip1Name = generateClipName(clipStartTime, splitTimeActual, videoName)
            const clip2Name = generateClipName(splitTimeActual, clipEndTime, videoName)
            
            setClips(prev => {
              const updated = prev.filter(c => c.id !== clipAtTime.id)
              updated.push({
                id: newClipId1,
                start: clipStartTime,
                end: splitTimeActual,
                name: clip1Name,
                videoPublicId: clipAtTime.videoPublicId || videoPublicId,
                videoUrl: clipAtTime.videoUrl || videoUrl,
                track: clipAtTime.track,
              })
              updated.push({
                id: newClipId2,
                start: splitTimeActual,
                end: clipEndTime,
                name: clip2Name,
                videoPublicId: clipAtTime.videoPublicId || videoPublicId,
                videoUrl: clipAtTime.videoUrl || videoUrl,
                track: clipAtTime.track,
              })
              return updated.sort((a, b) => a.start - b.start)
            })
            
            onSplitClip(splitTimeActual)
            console.log(`✂️ Split clip at ${formatTime(splitTimeActual)}`)
            return
          }
        }
      }
      
      // If no valid split point, show helpful message
      if (clips.length === 0) {
        alert('No clips available to split. Please add a video first.')
      } else {
        alert(`Click on or near a clip to split it. You can split at boundaries between clips (where Clip 1 ends and Clip 2 begins).`)
      }
      return
    }

    // Otherwise, select the clip at this time
    const clip = clips.find(c => time >= c.start && time <= c.end)
    if (clip) {
      // If Ctrl/Cmd is held, multi-select
      if (e.ctrlKey || e.metaKey) {
        setSelectedClips(prev => {
          const newSet = new Set(prev)
          if (newSet.has(clip.id)) {
            newSet.delete(clip.id)
          } else {
            newSet.add(clip.id)
          }
          return newSet
        })
      } else {
        setSelectedClip(clip.id)
        setSelectedClips(new Set([clip.id]))
      }
    }
  }

  const handleMergeSelected = () => {
    if (selectedClips.size < 2) {
      alert('Please select at least 2 clips to merge')
      return
    }
    if (onMergeClips) {
      // Get selected clip objects with video source info
      const selectedClipObjects = clips.filter(clip => selectedClips.has(clip.id))
      // Ensure each clip has video source info
      const clipsWithSource = selectedClipObjects.map(clip => ({
        ...clip,
        videoPublicId: clip.videoPublicId || videoPublicId,
        videoUrl: clip.videoUrl || videoUrl,
      }))
      onMergeClips(Array.from(selectedClips), clipsWithSource)
      setSelectedClips(new Set())
      setSelectedClip(null)
    }
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !draggingClip || !timelineRef.current || !dragType) return
    
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    const time = percentage * duration
    
    if (dragType === 'start') {
      const clip = clips.find(c => c.id === draggingClip)
      if (clip) {
        const newStart = Math.max(0, Math.min(time, clip.end - 0.5))
        setClips(prev => prev.map(c => {
          if (c.id === draggingClip) {
            return { ...c, start: newStart }
          }
          return c
        }))
      }
    } else if (dragType === 'end') {
      const clip = clips.find(c => c.id === draggingClip)
      if (clip) {
        const newEnd = Math.min(duration, Math.max(time, clip.start + 0.5))
        setClips(prev => prev.map(c => {
          if (c.id === draggingClip) {
            return { ...c, end: newEnd }
          }
          return c
        }))
      }
    }
  }, [isDragging, draggingClip, dragType, duration, clips])

  const handleMouseUp = useCallback(() => {
    if (isDragging && draggingClip) {
      const clip = clips.find(c => c.id === draggingClip)
      if (clip && onTrim) {
        onTrim(clip.start, clip.end)
      }
    }
    setIsDragging(false)
    setDraggingClip(null)
    setDragType(null)
  }, [isDragging, draggingClip, clips, onTrim])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  const handleDelete = (clipId: string) => {
    if (confirm('Are you sure you want to delete this clip?')) {
      setClips(prev => prev.filter(c => c.id !== clipId))
      if (onDeleteClip) {
        onDeleteClip(clipId)
      }
    }
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  
  // Generate descriptive clip name based on time range
  const generateClipName = (start: number, end: number, videoName?: string): string => {
    const startTime = formatTime(start)
    const endTime = formatTime(end)
    const duration = (end - start).toFixed(1)
    if (videoName) {
      // Extract video name without extension
      const cleanName = videoName.replace(/\.[^/.]+$/, '').substring(0, 15)
      return `${cleanName} (${startTime}-${endTime})`
    }
    return `Clip ${startTime}-${endTime}`
  }

  const getClipPosition = (start: number) => {
    return duration > 0 ? (start / duration) * 100 : 0
  }

  const getClipWidth = (start: number, end: number) => {
    return duration > 0 ? ((end - start) / duration) * 100 : 0
  }

  const addNewTrack = (type: 'video' | 'audio' | 'text' | 'overlay') => {
    const trackId = `track_${type}_${Date.now()}`
    const newTrack: TimelineTrack = {
      id: trackId,
      type,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} Track ${tracks.filter(t => t.type === type).length + 1}`,
      clips: [],
      visible: true,
      muted: false,
      locked: false,
    }
    setTracks(prev => [...prev, newTrack])
  }

  const toggleTrackVisibility = (trackId: string) => {
    setTracks(prev => prev.map(track => 
      track.id === trackId ? { ...track, visible: !track.visible } : track
    ))
  }

  const toggleTrackMute = (trackId: string) => {
    setTracks(prev => prev.map(track => 
      track.id === trackId ? { ...track, muted: !track.muted } : track
    ))
  }

  return (
    <div className="mt-4 p-4 bg-black/20 rounded-xl border border-white/10 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white">
            {multiTrack ? 'Multi-Track Timeline' : 'Timeline'}
          </h3>
          <span className="text-xs text-gray-400">
            {multiTrack ? 'Drag clips between tracks | Shift + Click to split | Ctrl + Click to multi-select' : 'Hold Shift + Click to split | Drag edges to trim | Ctrl + Click to multi-select'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {multiTrack && (
            <div className="flex gap-1">
              <button
                onClick={() => addNewTrack('video')}
                className="px-2 py-1 text-xs rounded bg-vedit-blue/20 text-vedit-blue border border-vedit-blue/30 hover:bg-vedit-blue/30"
                title="Add Video Track"
              >
                + Video
              </button>
              <button
                onClick={() => addNewTrack('audio')}
                className="px-2 py-1 text-xs rounded bg-vedit-purple/20 text-vedit-purple border border-vedit-purple/30 hover:bg-vedit-purple/30"
                title="Add Audio Track"
              >
                + Audio
              </button>
            </div>
          )}
          {duration > 0 && (
            <span className="text-sm text-gray-400">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          )}
        </div>
      </div>
      
      {/* Multi-Track Timeline */}
      {multiTrack && duration > 0 && (
        <div className="mb-4 space-y-2">
          {tracks.map((track, trackIndex) => (
            <div key={track.id} className="flex gap-2">
              {/* Track Controls */}
              <div className="w-32 flex-shrink-0 flex flex-col items-center gap-1 p-2 bg-white/5 rounded border border-white/10">
                <div className="flex items-center gap-1 w-full">
                  <button
                    onClick={() => toggleTrackVisibility(track.id)}
                    className={`text-xs ${track.visible ? 'text-white' : 'text-gray-500'}`}
                    title={track.visible ? 'Hide track' : 'Show track'}
                  >
                    {track.visible ? '👁️' : '👁️‍🗨️'}
                  </button>
                  {track.type === 'audio' && (
                    <button
                      onClick={() => toggleTrackMute(track.id)}
                      className={`text-xs ${track.muted ? 'text-red-400' : 'text-white'}`}
                      title={track.muted ? 'Unmute' : 'Mute'}
                    >
                      {track.muted ? '🔇' : '🔊'}
                    </button>
                  )}
                  <span className={`text-xs ${track.locked ? 'text-yellow-400' : 'text-gray-400'}`}>
                    {track.locked ? '🔒' : ''}
                  </span>
                </div>
                <span className="text-xs text-white font-medium truncate w-full text-center">
                  {track.name}
                </span>
                <span className="text-[10px] text-gray-400">
                  {track.type}
                </span>
              </div>
              
              {/* Track Timeline */}
              <div 
                ref={trackIndex === 0 ? timelineRef : undefined}
                onClick={(e) => {
                  // Only handle timeline click if not dragging
                  if (!isDragging) {
                    handleTimelineClick(e)
                  }
                }}
                onDragOver={(e: React.DragEvent) => {
                  e.preventDefault()
                  e.stopPropagation()
                  e.dataTransfer.dropEffect = 'move'
                  
                  // Calculate drop position on timeline
                  const rect = e.currentTarget.getBoundingClientRect()
                  const x = e.clientX - rect.left
                  const percentage = Math.max(0, Math.min(1, x / rect.width))
                  const dropTime = percentage * duration
                  
                  // Update clip position in real-time while dragging
                  const clip = clips.find(c => c.id === draggingClip)
                  if (clip && draggingClip) {
                    const clipDuration = clip.end - clip.start
                    // Snap to drop position (clip starts where you drop)
                    const newStart = Math.max(0, Math.min(dropTime, duration - clipDuration))
                    const newEnd = newStart + clipDuration
                    
                    // Update clip position visually during drag
                    setClips(prev => prev.map(c => 
                      c.id === draggingClip ? { ...c, start: newStart, end: newEnd } : c
                    ))
                    
                    // Update tracks too
                    setTracks(prev => prev.map(track => ({
                      ...track,
                      clips: track.clips.map(c => 
                        c.id === draggingClip ? { ...c, start: newStart, end: newEnd } : c
                      )
                    })))
                  }
                }}
                onDragEnter={(e: React.DragEvent) => {
                  e.preventDefault()
                  e.stopPropagation()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(e: React.DragEvent) => {
                  e.preventDefault()
                  e.stopPropagation()
                  
                  if (draggingClip && timelineRef.current) {
                    const rect = timelineRef.current.getBoundingClientRect()
                    const x = e.clientX - rect.left
                    const percentage = Math.max(0, Math.min(1, x / rect.width))
                    const dropTime = percentage * duration
                    
                    const clip = clips.find(c => c.id === draggingClip)
                    if (clip) {
                      const clipDuration = clip.end - clip.start
                      // Place clip at drop position (clip starts where you drop)
                      const newStart = Math.max(0, Math.min(dropTime, duration - clipDuration))
                      const newEnd = newStart + clipDuration
                      
                      // Update clip position permanently
                      setClips(prev => prev.map(c => 
                        c.id === draggingClip ? { ...c, start: newStart, end: newEnd } : c
                      ).sort((a, b) => a.start - b.start))
                      
                      // Update tracks with new position
                      setTracks(prev => prev.map(track => ({
                        ...track,
                        clips: track.clips.map(c => 
                          c.id === draggingClip ? { ...c, start: newStart, end: newEnd } : c
                        ).sort((a, b) => a.start - b.start)
                      })))
                      
                      console.log(`📍 Moved clip "${clip.name}" to ${formatTime(newStart)}-${formatTime(newEnd)}`)
                    }
                    
                    setIsDragging(false)
                    setDraggingClip(null)
                    setDragType(null)
                    setDragStart(null)
                  }
                }}
                onKeyDown={(e) => {
                  // Keyboard shortcut: Shift + S to split selected clip at midpoint
                  if (e.shiftKey && e.key === 'S' && selectedClip && onSplitClip) {
                    e.preventDefault()
                    const clip = clips.find(c => c.id === selectedClip)
                    if (clip) {
                      const splitTime = (clip.start + clip.end) / 2
                      const minSplitDistance = 0.5
                      
                      if (splitTime > clip.start + minSplitDistance && splitTime < clip.end - minSplitDistance) {
                        // Split the clip locally with descriptive names
                        const newClipId1 = `clip_${Date.now()}_1`
                        const newClipId2 = `clip_${Date.now()}_2`
                        
                        const clip1Name = generateClipName(clip.start, splitTime, videoName)
                        const clip2Name = generateClipName(splitTime, clip.end, videoName)
                        
                        setClips(prev => {
                          const updated = prev.filter(c => c.id !== clip.id)
                          updated.push({
                            id: newClipId1,
                            start: clip.start,
                            end: splitTime,
                            name: clip1Name,
                            videoPublicId: clip.videoPublicId || videoPublicId,
                            videoUrl: clip.videoUrl || videoUrl,
                            track: clip.track,
                          })
                          updated.push({
                            id: newClipId2,
                            start: splitTime,
                            end: clip.end,
                            name: clip2Name,
                            videoPublicId: clip.videoPublicId || videoPublicId,
                            videoUrl: clip.videoUrl || videoUrl,
                            track: clip.track,
                          })
                          return updated.sort((a, b) => a.start - b.start)
                        })
                        
                        // Also call the callback for API processing
                        onSplitClip(splitTime)
                        console.log(`✂️ Split clip at ${formatTime(splitTime)}`)
                      }
                    }
                  }
                }}
                className={`flex-1 relative h-16 bg-white/5 rounded border ${selectedTrack === track.id ? 'border-vedit-purple' : 'border-white/10'} overflow-hidden cursor-crosshair`}
                onMouseEnter={() => setSelectedTrack(track.id)}
                title="Click to select | Shift + Click to split | Ctrl + Click to multi-select"
              >
                {/* Time markers */}
                <div className="absolute inset-0 flex">
                  {Array.from({ length: Math.floor(duration) + 1 }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 w-px bg-white/10"
                      style={{ left: `${(i / duration) * 100}%` }}
                    />
                  ))}
                </div>

                {/* Clips on this track */}
                {track.clips.map((clip) => (
                  <motion.div
                    key={clip.id}
                    className={`absolute top-0 bottom-0 rounded border-2 ${
                      selectedClips.has(clip.id)
                        ? 'bg-vedit-purple/30 border-vedit-purple shadow-glow'
                        : selectedClip === clip.id
                        ? 'bg-vedit-blue/30 border-vedit-blue/50'
                        : track.type === 'video' 
                        ? 'bg-vedit-blue/20 border-vedit-blue/50'
                        : track.type === 'audio'
                        ? 'bg-vedit-purple/20 border-vedit-purple/50'
                        : 'bg-white/20 border-white/50'
                    } cursor-move hover:bg-vedit-purple/30 transition-colors`}
                    style={{
                      left: `${getClipPosition(clip.start)}%`,
                      width: `${getClipWidth(clip.start, clip.end)}%`,
                    }}
                    draggable={true}
                    onDragStart={(e: React.DragEvent) => {
                      e.stopPropagation()
                      setIsDragging(true)
                      setDraggingClip(clip.id)
                      setDragType('move')
                      setDragStart(clip.start)
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', clip.id)
                      // Make drag image invisible
                      const dragImage = document.createElement('div')
                      dragImage.style.opacity = '0'
                      document.body.appendChild(dragImage)
                      e.dataTransfer.setDragImage(dragImage, 0, 0)
                      setTimeout(() => document.body.removeChild(dragImage), 0)
                      console.log(`🚀 Started dragging clip: ${clip.name}`)
                    }}
                    onDragEnd={(e) => {
                      e.stopPropagation()
                      setIsDragging(false)
                      setDraggingClip(null)
                      setDragType(null)
                      setDragStart(null)
                      console.log(`✅ Drag ended`)
                    }}
                    onMouseDown={(e) => {
                      // Allow click to work but don't interfere with drag
                      if (e.button === 0) { // Left click only
                        // Small delay to distinguish click from drag
                        setTimeout(() => {
                          if (!isDragging) {
                            // This was a click, not a drag
                          }
                        }, 100)
                      }
                    }}
                    onClick={(e) => {
                      // Only handle click if not dragging
                      if (!isDragging) {
                        e.stopPropagation()
                        if (e.ctrlKey || e.metaKey) {
                          setSelectedClips(prev => {
                            const newSet = new Set(prev)
                            if (newSet.has(clip.id)) {
                              newSet.delete(clip.id)
                            } else {
                              newSet.add(clip.id)
                            }
                            return newSet
                          })
                        } else {
                          setSelectedClip(clip.id)
                          setSelectedClips(new Set([clip.id]))
                        }
                      }
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-[10px] text-white font-medium truncate px-1">
                        {clip.name}
                      </span>
                    </div>
                  </motion.div>
                ))}

                {/* Playback indicator */}
                {trackIndex === 0 && (
                  <motion.div
                    className="absolute top-0 bottom-0 w-0.5 bg-vedit-blue border border-white/50 rounded-full shadow-glow z-10"
                    style={{ left: `${(currentTime / duration) * 100}%`, marginLeft: '-1px' }}
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Single-Track Timeline (fallback) */}
      {!multiTrack && duration > 0 && (
        <div className="mb-4">
          <div 
            ref={timelineRef}
            onClick={handleTimelineClick}
            className="relative w-full h-24 bg-white/5 rounded-lg border border-white/10 overflow-hidden cursor-crosshair"
          >
            {/* Time markers */}
            <div className="absolute inset-0 flex">
              {Array.from({ length: Math.floor(duration) + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 w-px bg-white/10"
                  style={{ left: `${(i / duration) * 100}%` }}
                >
                  <span className="absolute top-0 left-1 text-[10px] text-white/40">
                    {formatTime(i)}
                  </span>
                </div>
              ))}
            </div>

            {/* Clips visualization */}
            {clips.map((clip) => (
              <motion.div
                key={clip.id}
                className={`absolute top-0 bottom-0 rounded border-2 ${
                  selectedClips.has(clip.id)
                    ? 'bg-vedit-purple/30 border-vedit-purple shadow-glow'
                    : selectedClip === clip.id
                    ? 'bg-vedit-blue/30 border-vedit-blue/50'
                    : 'bg-vedit-blue/20 border-vedit-blue/50'
                } cursor-move hover:bg-vedit-purple/30 transition-colors`}
                style={{
                  left: `${getClipPosition(clip.start)}%`,
                  width: `${getClipWidth(clip.start, clip.end)}%`,
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  // If Ctrl/Cmd is held, multi-select
                  if (e.ctrlKey || e.metaKey) {
                    setSelectedClips(prev => {
                      const newSet = new Set(prev)
                      if (newSet.has(clip.id)) {
                        newSet.delete(clip.id)
                      } else {
                        newSet.add(clip.id)
                      }
                      return newSet
                    })
                  } else {
                    setSelectedClip(clip.id)
                    setSelectedClips(new Set([clip.id]))
                  }
                }}
              >
                {/* Clip trim handles */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-3 bg-vedit-purple/50 cursor-ew-resize hover:bg-vedit-purple rounded-l z-10"
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    setIsDragging(true)
                    setDraggingClip(clip.id)
                    setDragType('start')
                  }}
                />
                <div
                  className="absolute right-0 top-0 bottom-0 w-3 bg-vedit-purple/50 cursor-ew-resize hover:bg-vedit-purple rounded-r z-10"
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    setIsDragging(true)
                    setDraggingClip(clip.id)
                    setDragType('end')
                  }}
                />
                
                {/* Clip label */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-xs text-white font-medium truncate px-2">
                    {clip.name}
                  </span>
                </div>
              </motion.div>
            ))}

            {/* Playback indicator */}
            <motion.div
              className="absolute top-0 bottom-0 w-0.5 bg-vedit-blue border border-white/50 rounded-full shadow-glow z-10"
              style={{ left: `${(currentTime / duration) * 100}%`, marginLeft: '-1px' }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          </div>
        </div>
      )}
      
      {/* Merge button for selected clips */}
      {selectedClips.size >= 2 && onMergeClips && (
        <div className="mb-4 p-3 bg-vedit-purple/20 border border-vedit-purple/50 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white">
              {selectedClips.size} clips selected for merging
            </span>
            <button
              onClick={handleMergeSelected}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-vedit-purple to-vedit-blue text-white text-sm font-semibold hover:scale-105 transition-transform"
            >
              🔗 Merge Selected
            </button>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts hint */}
      <div className="mb-3 p-2 bg-vedit-purple/10 border border-vedit-purple/30 rounded-lg">
        <p className="text-xs text-gray-300 mb-1">
          <span className="font-semibold text-white">⌨️ Keyboard Shortcuts:</span>
        </p>
        <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-400">
          <div><span className="text-vedit-purple font-semibold">Shift</span> + Click timeline = Split clip</div>
          <div><span className="text-vedit-purple font-semibold">Shift</span> + <span className="text-vedit-purple font-semibold">S</span> = Split selected clip</div>
          <div><span className="text-vedit-purple font-semibold">Ctrl/Cmd</span> + Click = Multi-select clips</div>
          <div><span className="text-vedit-purple font-semibold">Delete</span> key = Delete selected clip</div>
        </div>
      </div>

      {/* Clip list with actions */}
      <div className="space-y-2">
        {clips.length > 0 ? clips.map((clip, index) => (
          <motion.div
            key={clip.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            tabIndex={0}
            onKeyDown={(e) => {
              // Delete key to delete selected clip
              if (e.key === 'Delete' && selectedClip === clip.id && onDeleteClip) {
                e.preventDefault()
                handleDelete(clip.id)
              }
              // Shift + S to split selected clip
              if (e.shiftKey && e.key === 'S' && selectedClip === clip.id && onSplitClip) {
                e.preventDefault()
                onSplitClip((clip.start + clip.end) / 2)
              }
            }}
            className={`p-3 bg-white/5 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-vedit-purple/50 ${
              selectedClips.has(clip.id)
                ? 'bg-vedit-purple/20 border-vedit-purple/50 shadow-glow'
                : selectedClip === clip.id
                ? 'bg-vedit-blue/20 border-vedit-blue/50'
                : 'border-white/10 hover:bg-white/10'
            } ${
              currentTime >= clip.start && currentTime <= clip.end
                ? 'ring-2 ring-vedit-blue/50'
                : ''
            }`}
            onClick={(e) => {
              // If Ctrl/Cmd is held, multi-select
              if (e.ctrlKey || e.metaKey) {
                setSelectedClips(prev => {
                  const newSet = new Set(prev)
                  if (newSet.has(clip.id)) {
                    newSet.delete(clip.id)
                  } else {
                    newSet.add(clip.id)
                  }
                  return newSet
                })
              } else {
                setSelectedClip(clip.id)
                setSelectedClips(new Set([clip.id]))
              }
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">{clip.name}</p>
                <p className="text-xs text-gray-400">
                  {formatTime(clip.start)} - {formatTime(clip.end)} 
                  <span className="ml-2">({formatTime(clip.end - clip.start)}s)</span>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (onSplitClip) {
                      onSplitClip((clip.start + clip.end) / 2)
                    }
                  }}
                  className="px-3 py-1 text-xs rounded-lg bg-vedit-blue/20 text-vedit-blue border border-vedit-blue/30 hover:bg-vedit-blue/30 transition-colors"
                >
                  Split
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(clip.id)
                  }}
                  className="px-3 py-1 text-xs rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </motion.div>
        )) : (
          <p className="text-sm text-gray-400 text-center py-4">
            {duration > 0 && clips.length === 0 
              ? 'No clips yet. Split the video or drag clips on timeline to create clips!' 
              : duration > 0 && clips.length > 0
              ? `${clips.length} clip${clips.length !== 1 ? 's' : ''} on timeline. Drag to reposition, Shift+Click to split, Ctrl+Click to select multiple.`
              : 'Upload and play a video to see the timeline'}
          </p>
        )}
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
