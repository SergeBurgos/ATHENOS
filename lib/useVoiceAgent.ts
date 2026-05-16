'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MicVAD } from '@ricky0123/vad-web';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  content: string;
}

export function useVoiceAgent() {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const transcriptRef = useRef<TranscriptEntry[]>([]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const vadRef = useRef<any>(null);
  const hadSpeechRef = useRef<boolean>(false);

  const cleanupAudio = useCallback(() => {
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    silenceStartRef.current = null;
  }, []);

  const stopListening = useCallback(() => {
    if (vadRef.current) {
      vadRef.current.pause();
      vadRef.current.destroy();
      vadRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    cleanupAudio();
  }, [cleanupAudio]);

  const processAudio = useCallback(async (audioBlob: Blob) => {
    setState('processing');

    const formData = new FormData();
    formData.append('audio', audioBlob);
    formData.append('history', JSON.stringify(transcriptRef.current));

    try {
      const response = await fetch('/api/voice', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('API failed');

      const userText = decodeURIComponent(response.headers.get('X-User-Transcript') || '');
      const assistantText = decodeURIComponent(response.headers.get('X-Assistant-Reply') || '');

      if (userText && assistantText) {
        setTranscript(prev => [...prev, { role: 'user' as const, content: userText }, { role: 'assistant' as const, content: assistantText }].slice(-10));
      }

      try {
        if (!window.MediaSource || !response.body) throw new Error('Streaming not supported');
        const audio = new Audio();
        const mediaSource = new MediaSource();
        audio.src = URL.createObjectURL(mediaSource);
        audioRef.current = audio;
        setState('speaking');
        audio.onended = () => setState('idle');
        audio.onerror = () => setState('idle');

        mediaSource.addEventListener('sourceopen', async () => {
          const sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
          let readerDone = false;
          sourceBuffer.addEventListener('updateend', () => {
            if (readerDone && !sourceBuffer.updating && mediaSource.readyState === 'open') {
              try { mediaSource.endOfStream(); } catch (e) {}
            }
          });
          const reader = response.body!.getReader();
          const pump = async () => {
            const { done, value } = await reader.read();
            if (done) {
              readerDone = true;
              return;
            }
            await new Promise<void>(r => {
              if (!sourceBuffer.updating) return r();
              sourceBuffer.addEventListener('updateend', () => r(), { once: true });
            });
            sourceBuffer.appendBuffer(value!);
            pump();
          };
          pump();
        });
        await audio.play();
        const checkEnded = setInterval(() => {
          if (audio.ended || (audio.paused && audio.currentTime > 0 && audio.currentTime >= audio.duration - 0.1)) {
            clearInterval(checkEnded);
            setState('idle');
          }
        }, 250);
        audio.addEventListener('ended', () => clearInterval(checkEnded), { once: true });
        audio.addEventListener('error', () => clearInterval(checkEnded), { once: true });
      } catch (e) {
        console.warn('Streaming playback fallback:', e);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        setState('speaking');
        audio.onended = () => { setState('idle'); URL.revokeObjectURL(url); };
        await audio.play().catch(() => setState('idle'));
      }
    } catch (error) {
      console.error('Processing failed:', error);
      setState('idle');
    }
  }, []);

  const startListening = useCallback(async () => {
    if (state !== 'idle') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        if (!hadSpeechRef.current) {
          const fallbackAudio = new Audio('/audio/no-audio-detected.mp3');
          setState('speaking');
          fallbackAudio.onended = () => setState('idle');
          fallbackAudio.onerror = () => setState('idle');
          fallbackAudio.play();
          return;
        }
        
        processAudio(audioBlob);
      };

      hadSpeechRef.current = false;
      const vad = await MicVAD.new({
        getStream: async () => stream,
        onSpeechStart: () => {
          hadSpeechRef.current = true;
        },
        onSpeechEnd: () => {
          stopListening();
        },
        onVADMisfire: () => {
        },
        baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@latest/dist/",
        onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@latest/dist/",
      });
      vadRef.current = vad;
      vad.start();

      mediaRecorder.start();
      setState('listening');
    } catch (err) {
      console.error('Microphone access denied:', err);
      setState('idle');
    }
  }, [state, processAudio, stopListening]);

  const endSession = useCallback(() => {
    setTranscript([]);
    setState('idle');
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    stopListening();
  }, [stopListening]);

  useEffect(() => {
    return () => {
      stopListening();
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [stopListening]);

  return {
    state,
    transcript,
    startListening,
    stopListening,
    endSession,
  };
}
