import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  Volume2, 
  VolumeX, 
  AlertTriangle, 
  Clock, 
  Headphones, 
  Maximize2,
  CheckCircle2,
  Sparkles,
  Zap
} from 'lucide-react';
import { CallRecord, QuiebreAtencion, SegmentoDialogo } from '../types';

interface EnterpriseAudioPlayerProps {
  call: CallRecord;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  externalSeekTime?: number | null;
  onSeekComplete?: () => void;
}

export const EnterpriseAudioPlayer: React.FC<EnterpriseAudioPlayerProps> = ({
  call,
  currentTime,
  onTimeUpdate,
  externalSeekTime,
  onSeekComplete,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformContainerRef = useRef<HTMLDivElement | null>(null);
  const intervalRef = useRef<number | null>(null);

  const totalDuration = call.duracion_segundos > 0 ? call.duracion_segundos : 240; // default 4 mins

  // Raw segments and quiebres
  const rawSegments = (call as any).transcripcion?.segmentos || call.segmentos || [];
  const segmentos: SegmentoDialogo[] = Array.isArray(rawSegments) ? rawSegments : [];
  const quiebres: QuiebreAtencion[] = call.quiebres_atencion || [];

  // Generate deterministic waveform peaks based on call id
  const waveformBars = useMemo(() => {
    const barsCount = 80;
    const bars = [];
    const seed = call.codigo_llamada.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    
    for (let i = 0; i < barsCount; i++) {
      const progress = i / barsCount;
      const second = progress * totalDuration;

      // Check which speaker is active at this second
      const activeSeg = segmentos.find((s) => second >= s.inicio && second <= s.fin);
      let speaker: 'agente' | 'cliente' | 'silencio' = 'silencio';
      if (activeSeg) {
        speaker = activeSeg.hablante === 'agente' ? 'agente' : 'cliente';
      }

      // Check if quiebre occurs here
      const hasQuiebre = quiebres.some((q) => Math.abs(q.segundo - second) <= (totalDuration / barsCount));

      // Deterministic pseudo-random height between 20% and 100%
      const rawPseudo = Math.abs(Math.sin((i + 1) * 12.9898 + seed) * 43758.5453) % 1;
      const baseHeight = speaker === 'silencio' ? 0.15 : 0.35 + rawPseudo * 0.65;
      const height = Math.min(1, Math.max(0.12, baseHeight));

      bars.push({
        index: i,
        second,
        height,
        speaker,
        hasQuiebre
      });
    }
    return bars;
  }, [call.codigo_llamada, totalDuration, segmentos, quiebres]);

  // Handle external seek requests
  useEffect(() => {
    if (externalSeekTime !== undefined && externalSeekTime !== null) {
      seekTo(externalSeekTime);
      if (onSeekComplete) onSeekComplete();
    }
  }, [externalSeekTime]);

  // Sync with real audio element if available
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [playbackRate, volume, isMuted]);

  // Playback timer simulation if no real audio element source or media file
  useEffect(() => {
    if (isPlaying) {
      if (audioRef.current && call.audio_url) {
        audioRef.current.play().catch(() => {
          // fallback to simulated clock if browser blocks autoplay or format unsupported
          startSimulationTimer();
        });
      } else {
        startSimulationTimer();
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      stopSimulationTimer();
    }

    return () => stopSimulationTimer();
  }, [isPlaying, call.audio_url]);

  const startSimulationTimer = () => {
    stopSimulationTimer();
    const intervalMs = 250;
    intervalRef.current = window.setInterval(() => {
      onTimeUpdate((prevTime) => {
        const next = prevTime + (intervalMs / 1000) * playbackRate;
        if (next >= totalDuration) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
    }, intervalMs);
  };

  const stopSimulationTimer = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const seekTo = (sec: number) => {
    const clamped = Math.max(0, Math.min(totalDuration, sec));
    if (audioRef.current && call.audio_url) {
      audioRef.current.currentTime = clamped;
    }
    onTimeUpdate(clamped);
  };

  const skipSeconds = (delta: number) => {
    seekTo(currentTime + delta);
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformContainerRef.current) return;
    const rect = waveformContainerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const targetSecond = percent * totalDuration;
    seekTo(targetSecond);
  };

  const handleWaveformMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformContainerRef.current) return;
    const rect = waveformContainerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    setHoverTime(percent * totalDuration);
    setHoverPos(clickX);
  };

  const handleWaveformMouseLeave = () => {
    setHoverTime(null);
    setHoverPos(null);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const playbackProgress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="rounded-3xl border border-[#DADCE0] bg-white p-5 shadow-sm">
      {/* Real HTML5 Audio element hidden under hood */}
      {call.audio_url && (
        <audio
          ref={audioRef}
          src={call.audio_url}
          onTimeUpdate={() => {
            if (audioRef.current) {
              onTimeUpdate(audioRef.current.currentTime);
            }
          }}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* Header with Title & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DADCE0] pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#E8F0FE] text-[#1A73E8]">
            <Headphones className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-['Google_Sans',sans-serif] text-sm font-bold text-[#202124]">
                Consola de Audio & Forma de Onda Sincronizada
              </h3>
              <span className="rounded-full bg-[#E6F4EA] px-2 py-0.5 text-[10px] font-bold text-[#137333]">
                Speech Diarizado
              </span>
            </div>
            <p className="text-[11px] text-[#5F6368]">
              {call.file_name || `Grabación_${call.codigo_llamada}.wav`} • Grabación estéreo 16-bit / 8kHz PCM
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#5F6368]">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="h-2.5 w-2.5 rounded-full bg-[#1A73E8]" />
            <span>Asesor OJT</span>
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <span className="h-2.5 w-2.5 rounded-full bg-[#EA4335]" />
            <span>Cliente</span>
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <span className="h-2.5 w-2.5 rounded-full bg-[#DADCE0]" />
            <span>Silencio / Hold</span>
          </span>
          <span className="flex items-center gap-1.5 font-semibold text-[#EA4335]">
            <AlertTriangle className="h-3 w-3" />
            <span>Quiebre ({quiebres.length})</span>
          </span>
        </div>
      </div>

      {/* Waveform Visualization Canvas / SVG */}
      <div className="relative mt-4">
        <div
          ref={waveformContainerRef}
          onClick={handleWaveformClick}
          onMouseMove={handleWaveformMouseMove}
          onMouseLeave={handleWaveformMouseLeave}
          className="group relative flex h-24 w-full cursor-pointer items-end justify-between gap-[2px] rounded-2xl border border-[#DADCE0] bg-[#F8F9FA] px-3 py-2 transition hover:border-[#1A73E8]"
        >
          {/* Progress Overlay */}
          <div 
            className="pointer-events-none absolute bottom-0 left-0 top-0 rounded-2xl bg-[#E8F0FE]/40 transition-all"
            style={{ width: `${playbackProgress}%` }}
          />

          {/* Current Scrubber Head */}
          <div 
            className="pointer-events-none absolute bottom-0 top-0 z-10 w-[2px] bg-[#1A73E8] shadow-[0_0_8px_rgba(26,115,232,0.6)]"
            style={{ left: `${playbackProgress}%` }}
          >
            <div className="absolute -top-1.5 -left-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#1A73E8] shadow-sm" />
          </div>

          {/* Hover Time Indicator */}
          {hoverTime !== null && hoverPos !== null && (
            <div 
              className="pointer-events-none absolute -top-8 z-20 -translate-x-1/2 rounded-md bg-[#202124] px-2 py-0.5 font-mono text-[10px] font-bold text-white shadow-md"
              style={{ left: `${hoverPos}px` }}
            >
              {formatTime(hoverTime)}
            </div>
          )}

          {/* Render Bars */}
          {waveformBars.map((bar) => {
            const isPassed = bar.second <= currentTime;
            const barHeightPx = Math.max(8, bar.height * 70);

            let barColor = 'bg-[#DADCE0]';
            if (bar.speaker === 'agente') {
              barColor = isPassed ? 'bg-[#1A73E8]' : 'bg-[#1A73E8]/35';
            } else if (bar.speaker === 'cliente') {
              barColor = isPassed ? 'bg-[#EA4335]' : 'bg-[#EA4335]/35';
            } else {
              barColor = isPassed ? 'bg-[#9AA0A6]' : 'bg-[#DADCE0]';
            }

            return (
              <div 
                key={bar.index}
                className="relative flex h-full flex-1 items-center justify-center"
              >
                <div 
                  className={`w-full rounded-full transition-all duration-75 ${barColor}`}
                  style={{ height: `${barHeightPx}px` }}
                />
              </div>
            );
          })}

          {/* Quiebres Markers on Timeline */}
          {quiebres.map((q) => {
            const quiebreProgress = (q.segundo / totalDuration) * 100;
            return (
              <div
                key={q.id}
                onClick={(e) => {
                  e.stopPropagation();
                  seekTo(q.segundo);
                }}
                className="group/pin absolute top-0 z-20 -translate-x-1/2 cursor-pointer pt-1"
                style={{ left: `${quiebreProgress}%` }}
                title={`Quiebre: ${q.tipo} (${q.tiempo})`}
              >
                <div className={`flex h-4 w-4 items-center justify-center rounded-full text-white shadow-xs ${
                  q.severidad === 'CRÍTICO' ? 'bg-[#EA4335]' : 'bg-[#FBBC05]'
                }`}>
                  <AlertTriangle className="h-2.5 w-2.5" />
                </div>
                {/* Pin Tooltip */}
                <div className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#202124] px-2 py-1 text-[10px] font-bold text-white shadow-md group-hover/pin:block">
                  {q.tiempo} - {q.tipo}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Control Bar: Play, Seek, Speed, Volume, Time */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Playback Controls */}
        <div className="flex items-center gap-2">
          {/* Rewind 5s */}
          <button
            onClick={() => skipSeconds(-5)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#DADCE0] text-[#5F6368] transition hover:bg-[#F1F3F4] active:scale-95"
            title="Retroceder 5 segundos"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          {/* Play/Pause Button */}
          <button
            onClick={togglePlayPause}
            className={`flex h-11 w-11 items-center justify-center rounded-full shadow-sm transition active:scale-95 ${
              isPlaying 
                ? 'bg-[#EA4335] text-white hover:bg-[#C5221F]' 
                : 'bg-[#1A73E8] text-white hover:bg-[#1557B0]'
            }`}
            title={isPlaying ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 fill-current" />
            ) : (
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            )}
          </button>

          {/* Forward 5s */}
          <button
            onClick={() => skipSeconds(5)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#DADCE0] text-[#5F6368] transition hover:bg-[#F1F3F4] active:scale-95"
            title="Adelantar 5 segundos"
          >
            <RotateCw className="h-4 w-4" />
          </button>

          {/* Time Counter */}
          <div className="ml-2 flex items-center gap-1 font-mono text-xs font-semibold text-[#202124]">
            <span className="text-[#1A73E8]">{formatTime(currentTime)}</span>
            <span className="text-[#9AA0A6]">/</span>
            <span className="text-[#5F6368]">{formatTime(totalDuration)}</span>
          </div>
        </div>

        {/* Right: Speed, Volume, Quiebre Jump */}
        <div className="flex items-center gap-3">
          {/* Speed Selector */}
          <div className="flex items-center rounded-full border border-[#DADCE0] bg-[#F8F9FA] p-0.5 text-xs">
            {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
              <button
                key={rate}
                onClick={() => setPlaybackRate(rate)}
                className={`rounded-full px-2.5 py-1 font-mono text-[11px] font-bold transition ${
                  playbackRate === rate 
                    ? 'bg-[#1A73E8] text-white shadow-xs' 
                    : 'text-[#5F6368] hover:text-[#202124]'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          {/* Volume Control */}
          <div className="hidden items-center gap-2 sm:flex">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="text-[#5F6368] hover:text-[#202124]"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4 text-[#EA4335]" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                if (isMuted) setIsMuted(false);
              }}
              className="w-16 accent-[#1A73E8]"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
