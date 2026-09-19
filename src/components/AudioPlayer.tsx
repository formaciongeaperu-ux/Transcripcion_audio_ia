import React, { useRef, useState, useEffect, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  Volume2, 
  VolumeX, 
  UploadCloud, 
  FileAudio,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Zap
} from 'lucide-react';
import { SegmentoDialogo } from '../types';
import { normalizeAudioForPlayback } from '../utils/telephonyAudio';

interface AudioPlayerProps {
  audioFile?: File | null;
  audioUrl?: string | null;
  fileName?: string | null;
  segmentos?: SegmentoDialogo[];
  onTimeUpdate?: (seconds: number) => void;
  onLoadedDuration?: (duration: number) => void;
  seekTime?: number | null;
  initialDuration?: number;
  onAudioFileAttached?: (file: File) => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioFile,
  audioUrl,
  fileName,
  onTimeUpdate,
  onLoadedDuration,
  seekTime,
  initialDuration = 0,
  onAudioFileAttached,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeBlobUrlRef = useRef<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [codecBadge, setCodecBadge] = useState<string | null>(null);

  // Fallback conversion to standard PCM using the backend ffmpeg engine
  const convertWithServer = async (fileOrBlob: Blob): Promise<Blob> => {
    const arrayBuffer = await fileOrBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    const res = await fetch('/api/convert-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64: base64 }),
    });

    if (!res.ok) {
      throw new Error(`El servidor devolvió error ${res.status} al convertir audio`);
    }

    return await res.blob();
  };

  // Safe audio processing pipeline for telephony recordings (G.711 / PCM)
  const processAndLoadAudio = useCallback(async (blobOrFile: Blob | File, name: string) => {
    setAudioError(null);
    setIsConverting(true);

    try {
      // 1. Client-side instant ITU-T G.711 A-law / µ-law normalization (< 20ms)
      const normResult = await normalizeAudioForPlayback(blobOrFile);

      let finalBlob = normResult.blob;
      let badge = normResult.wasConverted 
        ? 'Telefonía G.711 decodificado a PCM' 
        : normResult.codecInfo;

      // 2. Create usable Object URL
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      }
      const newUrl = URL.createObjectURL(finalBlob);
      activeBlobUrlRef.current = newUrl;

      setSourceUrl(newUrl);
      setCurrentFileName(name);
      setCodecBadge(badge);
      setIsConverting(false);
    } catch (err: any) {
      console.warn('Error en decodificación local, intentando transcodificación en servidor...', err);
      try {
        const serverBlob = await convertWithServer(blobOrFile);
        if (activeBlobUrlRef.current) {
          URL.revokeObjectURL(activeBlobUrlRef.current);
        }
        const serverUrl = URL.createObjectURL(serverBlob);
        activeBlobUrlRef.current = serverUrl;

        setSourceUrl(serverUrl);
        setCurrentFileName(name);
        setCodecBadge('Audio Contact Center normalizado');
        setIsConverting(false);
      } catch (serverErr: any) {
        console.error('Fallo en ambas decodificaciones:', serverErr);
        setIsConverting(false);
        setAudioError('El formato de audio no es compatible con el navegador. Intenta re-subir en formato MP3 o WAV estándar.');
      }
    }
  }, []);

  // 1. Gestión reactiva de la fuente de audio (con auto-decodificación de G.711 y WAV de telefonía)
  useEffect(() => {
    let isMounted = true;

    const setupAudio = async () => {
      setAudioError(null);

      if (audioFile) {
        await processAndLoadAudio(audioFile, audioFile.name);
      } else if (audioUrl) {
        // If audioUrl is already set, verify if it's a blob url or needs processing
        try {
          const res = await fetch(audioUrl);
          const blob = await res.blob();
          if (isMounted) {
            await processAndLoadAudio(blob, fileName || 'Grabacion_Original.wav');
          }
        } catch {
          if (isMounted) {
            setSourceUrl(audioUrl);
            setCurrentFileName(fileName || 'Grabacion_Original.wav');
          }
        }
      } else {
        if (isMounted) {
          setSourceUrl(null);
          setCurrentFileName(null);
          setCodecBadge(null);
        }
      }
    };

    setupAudio();

    return () => {
      isMounted = false;
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
        activeBlobUrlRef.current = null;
      }
    };
  }, [audioFile, audioUrl, fileName, processAndLoadAudio]);

  // Actualizar duración inicial si se proporciona
  useEffect(() => {
    if (initialDuration && initialDuration > 0 && duration === 0) {
      setDuration(initialDuration);
    }
  }, [initialDuration, duration]);

  // Manejar salto interactivo de tiempo
  useEffect(() => {
    if (typeof seekTime === 'number' && seekTime >= 0) {
      handleSeek(seekTime);
    }
  }, [seekTime]);

  // Manejar error nativo del elemento <audio> con recuperación automática
  const handleAudioElementError = async () => {
    console.warn('Evento error disparado por <audio>. Intentando auto-recuperación con transcodificación...');
    
    // Si tenemos audioFile o podemos descargar de audioUrl, forzar conversión por servidor
    const sourceBlob = audioFile || (audioUrl ? await (await fetch(audioUrl)).blob() : null);
    if (sourceBlob && !isConverting) {
      setIsConverting(true);
      setAudioError('Optimizando formato de telefonía para el navegador...');
      try {
        const pcmBlob = await convertWithServer(sourceBlob);
        if (activeBlobUrlRef.current) {
          URL.revokeObjectURL(activeBlobUrlRef.current);
        }
        const newUrl = URL.createObjectURL(pcmBlob);
        activeBlobUrlRef.current = newUrl;
        setSourceUrl(newUrl);
        setAudioError(null);
        setCodecBadge('Audio transcodificado a PCM 16-bit 44.1kHz');
        setIsConverting(false);
      } catch (err) {
        setIsConverting(false);
        setAudioError('No se pudo reproducir este formato de telefonía. Puedes seleccionar el archivo nuevamente.');
      }
    } else {
      setAudioError('Error al leer el archivo. Haz clic en "Cambiar archivo" para seleccionar la grabación original.');
      setIsPlaying(false);
    }
  };

  // 2. Play / Pause nativo
  const togglePlay = () => {
    if (!audioRef.current || !sourceUrl) {
      fileInputRef.current?.click();
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setAudioError(null);
        })
        .catch(async (err) => {
          console.error('Error al reproducir audio real:', err);
          setIsPlaying(false);
          // Si falló la reproducción, ejecutar recuperación
          handleAudioElementError();
        });
    }
  };

  // 3. Salto de tiempo (Seek)
  const handleSeek = (newTime: number) => {
    const maxDur = duration > 0 ? duration : 9999;
    const clampedTime = Math.max(0, Math.min(maxDur, newTime));

    if (audioRef.current) {
      audioRef.current.currentTime = clampedTime;
    }
    setCurrentTime(clampedTime);
    onTimeUpdate?.(clampedTime);
  };

  const skipTime = (seconds: number) => {
    handleSeek(currentTime + seconds);
  };

  // 4. Velocidad de reproducción
  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  // 5. Volumen y Silencio
  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
      audioRef.current.muted = newVol === 0;
    }
  };

  // 6. Carga de archivo real desde disco o drag-and-drop
  const handleFileSelection = async (file: File) => {
    setAudioError(null);
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|ogg|webm|flac|wma)$/i.test(file.name)) {
      setAudioError('Por favor selecciona un archivo de audio válido (.mp3, .wav, .m4a, .ogg).');
      return;
    }

    onAudioFileAttached?.(file);
    await processAndLoadAudio(file, file.name);

    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {
          setIsPlaying(false);
        });
      }
    }, 200);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelection(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelection(file);
    }
  };

  return (
    <div 
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`relative rounded-3xl border transition-all ${
        isDragOver 
          ? 'border-[#1A73E8] bg-[#E8F0FE]/40 ring-2 ring-[#1A73E8]' 
          : 'border-[#DADCE0] bg-[#F8F9FA]'
      } p-5 shadow-xs`}
    >
      {/* Input oculto para cargar archivo de audio real */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac"
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Elemento HTML5 nativo: decodifica y reproduce la voz real de la persona */}
      {sourceUrl && (
        <audio
          ref={audioRef}
          src={sourceUrl}
          preload="auto"
          onTimeUpdate={() => {
            if (audioRef.current) {
              const t = audioRef.current.currentTime;
              setCurrentTime(t);
              onTimeUpdate?.(t);
            }
          }}
          onLoadedMetadata={() => {
            if (audioRef.current && !isNaN(audioRef.current.duration) && audioRef.current.duration > 0) {
              const d = audioRef.current.duration;
              setDuration(d);
              onLoadedDuration?.(d);
            }
          }}
          onPlay={() => {
            setIsPlaying(true);
            setAudioError(null);
          }}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          onError={handleAudioElementError}
        />
      )}

      {/* Cabecera del reproductor */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8EAED] pb-3 text-xs">
        <div className="flex items-center gap-2">
          {sourceUrl ? (
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 items-center justify-center rounded-full bg-[#E6F4EA]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#34A853] animate-pulse" />
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-[#202124]">Audio Real de la Llamada:</span>
                <span className="rounded-md bg-white px-2 py-0.5 font-mono text-[11px] font-medium text-[#1A73E8] border border-[#DADCE0]">
                  {currentFileName || 'Grabacion_Original.wav'}
                </span>
                {codecBadge && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#E6F4EA] px-2 py-0.5 text-[10px] font-semibold text-[#137333] border border-[#CEEAD6]">
                    <Zap className="h-2.5 w-2.5" />
                    <span>{codecBadge}</span>
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[#5F6368]">
              <FileAudio className="h-4 w-4 text-[#EA4335]" />
              <span className="font-semibold text-[#202124]">Audio Real No Vinculado</span>
              <span className="rounded-full bg-[#FCE8E6] px-2 py-0.5 text-[10px] font-medium text-[#EA4335]">
                Se requiere archivo original
              </span>
            </div>
          )}
        </div>

        {/* Acciones: Cargar/Reemplazar archivo y Selector de velocidad */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-full border border-[#DADCE0] bg-white px-3 py-1 text-[11px] font-medium text-[#3C4043] transition hover:border-[#1A73E8] hover:bg-[#E8F0FE] hover:text-[#1A73E8]"
            title="Seleccionar o sustituir por tu archivo de audio real (.mp3, .wav, .m4a)"
          >
            <UploadCloud className="h-3.5 w-3.5" />
            <span>{sourceUrl ? 'Cambiar archivo de audio' : 'Cargar audio real (.mp3 / .wav)'}</span>
          </button>

          {/* Selector de velocidad */}
          <div className="flex items-center gap-0.5 rounded-full border border-[#DADCE0] bg-white p-0.5 text-[11px]">
            {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
              <button
                key={rate}
                onClick={() => handleRateChange(rate)}
                className={`rounded-full px-2 py-0.5 font-mono font-semibold transition ${
                  playbackRate === rate
                    ? 'bg-[#1A73E8] text-white shadow-xs'
                    : 'text-[#5F6368] hover:text-[#202124]'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Banner si NO hay audio real cargado */}
      {!sourceUrl && (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="my-3 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-dashed border-[#1A73E8]/60 bg-white p-4 transition hover:bg-[#E8F0FE]/20 hover:border-[#1A73E8]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F0FE] text-[#1A73E8]">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#202124]">
                Para escuchar la voz real del cliente y asesor, adjunta la grabación de esta llamada
              </p>
              <p className="text-[11px] text-[#5F6368]">
                Haz clic aquí o arrastra un archivo (.mp3, .wav, .m4a, .ogg) para reproducir el audio auténtico.
              </p>
            </div>
          </div>
          <button 
            type="button"
            className="shrink-0 rounded-xl bg-[#1A73E8] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1557B0]"
          >
            Seleccionar Audio
          </button>
        </div>
      )}

      {/* Notificación de conversión o estado */}
      {isConverting && (
        <div className="my-2 flex items-center justify-between gap-2 rounded-xl bg-[#E8F0FE] p-2.5 text-xs text-[#1A73E8]">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
            <span>Optimizando códec de telefonía ({currentFileName || 'grabación'}) para reproducción en navegador...</span>
          </div>
        </div>
      )}

      {/* Error de audio si ocurre con botón de resolución */}
      {audioError && (
        <div className="my-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FCE8E6] p-2.5 text-xs text-[#EA4335]">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{audioError}</span>
          </div>
          <button
            onClick={handleAudioElementError}
            className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 font-semibold text-[#EA4335] shadow-xs border border-[#FAD2CF] hover:bg-[#FCE8E6]"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Reintentar optimización</span>
          </button>
        </div>
      )}

      {/* Waveform Visual Interactivo Sincronizado */}
      <div className="mt-3 flex flex-col gap-2">
        <div className="relative flex h-14 w-full items-center gap-1 rounded-2xl bg-white px-3 shadow-inner">
          {Array.from({ length: 60 }).map((_, i) => {
            const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
            const barPct = (i / 60) * 100;
            const isPassed = barPct <= progressPct;
            const height = 12 + Math.sin(i * 0.35) * 14 + Math.cos(i * 0.9) * 12;

            return (
              <div
                key={i}
                onClick={() => {
                  if (duration > 0) {
                    handleSeek((i / 60) * duration);
                  }
                }}
                className="group relative flex h-full flex-1 cursor-pointer items-center justify-center"
                title={duration > 0 ? `Saltar a ${formatSeconds((i / 60) * duration)}` : ''}
              >
                <div
                  className={`w-1 rounded-full transition-all duration-150 ${
                    isPassed 
                      ? 'bg-[#1A73E8]' 
                      : 'bg-[#DADCE0] group-hover:bg-[#BDC1C6]'
                  }`}
                  style={{ height: `${Math.max(8, Math.min(46, height))}px` }}
                />
              </div>
            );
          })}
        </div>

        {/* Barra de progreso interactiva (Scrubber) */}
        <input
          type="range"
          min={0}
          max={duration > 0 ? duration : 100}
          step={0.1}
          value={currentTime}
          disabled={!sourceUrl || isConverting}
          onChange={(e) => handleSeek(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer accent-[#1A73E8] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Progreso del audio de la llamada"
        />
      </div>

      {/* Controles Principales de Audio */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Retroceder 5 segundos */}
          <button
            id="btn-player-skip-back"
            onClick={() => skipTime(-5)}
            disabled={!sourceUrl || isConverting}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white border border-[#DADCE0] text-[#5F6368] shadow-xs transition hover:bg-[#E8EAED] hover:text-[#202124] disabled:opacity-40 disabled:hover:bg-white"
            title="Retroceder 5 segundos"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          {/* Botón Principal Play / Pause */}
          <button
            id="btn-player-play-pause"
            onClick={togglePlay}
            disabled={isConverting}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1A73E8] text-white shadow-md transition hover:bg-[#1557B0] active:scale-95 disabled:bg-[#BDC1C6]"
            title={
              !sourceUrl 
                ? 'Cargar archivo de audio para reproducir' 
                : isPlaying 
                  ? 'Pausar audio real' 
                  : 'Reproducir voz real de la grabación'
            }
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            )}
          </button>

          {/* Avanzar 5 segundos */}
          <button
            id="btn-player-skip-fwd"
            onClick={() => skipTime(5)}
            disabled={!sourceUrl || isConverting}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white border border-[#DADCE0] text-[#5F6368] shadow-xs transition hover:bg-[#E8EAED] hover:text-[#202124] disabled:opacity-40 disabled:hover:bg-white"
            title="Avanzar 5 segundos"
          >
            <RotateCw className="h-4 w-4" />
          </button>

          {/* Control de Volumen y Silencio */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-[#DADCE0]">
            <button
              onClick={toggleMute}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-[#DADCE0] text-[#5F6368] shadow-xs transition hover:bg-[#E8EAED]"
              title={isMuted ? 'Activar sonido' : 'Silenciar'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4 text-[#EA4335]" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="h-1 w-16 cursor-pointer accent-[#1A73E8]"
              title={`Volumen: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
            />
          </div>
        </div>

        {/* Contador de tiempo digital exacto */}
        <div className="flex items-center gap-2">
          {sourceUrl && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#137333] bg-[#E6F4EA] px-2 py-0.5 rounded-full">
              <CheckCircle2 className="h-3 w-3" />
              <span>Audio Original</span>
            </span>
          )}
          <div className="flex items-center gap-1 rounded-xl border border-[#DADCE0] bg-white px-3 py-1.5 font-mono text-xs font-bold text-[#3C4043] shadow-xs">
            <span className="text-[#1A73E8]">{formatSeconds(currentTime)}</span>
            <span className="text-[#9AA0A6]">/</span>
            <span>{formatSeconds(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

function formatSeconds(sec: number): string {
  if (isNaN(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
