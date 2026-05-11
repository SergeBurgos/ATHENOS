'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  content: string;
}

async function getAudioRMS(blob: Blob): Promise<number> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const channelData = audioBuffer.getChannelData(0);
  let sumSquares = 0;
  for (let i = 0; i < channelData.length; i++) {
    sumSquares += channelData[i] * channelData[i];
  }
  const rms = Math.sqrt(sumSquares / channelData.length);
  audioContext.close();
  return rms;
}

export function useVoiceAgent() {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const silenceStartRef = useRef<number | null>(null);

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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    cleanupAudio();
  }, [cleanupAudio]);

  const processAudio = useCallback(async (audioBlob: Blob) => {
    setState('processing');

    try {
      const rms = await getAudioRMS(audioBlob);
      const SILENCE_THRESHOLD = 0.015;
      if (rms < SILENCE_THRESHOLD) {
        const fallbackAudio = new Audio('/audio/no-audio-detected.mp3');
        setState('speaking');
        fallbackAudio.onended = () => setState('idle');
        fallbackAudio.onerror = () => setState('idle');
        await fallbackAudio.play();
        return;
      }
    } catch (error) {
      console.warn('Silence detection failed:', error);
    }

    const formData = new FormData();
    formData.append('audio', audioBlob);
    formData.append('history', JSON.stringify(transcript));

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
          const reader = response.body!.getReader();
          const pump = async () => {
            const { done, value } = await reader.read();
            if (done) {
              if (mediaSource.readyState === 'open') mediaSource.endOfStream();
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
  }, [transcript]);

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
        processAudio(audioBlob);
      };

      // Hybrid Tap-to-Listen: Auto-stop on silence
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkSilence = () => {
        if (mediaRecorder.state !== 'recording') return;
        analyser.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);

        if (rms < 0.02) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = Date.now();
          } else if (Date.now() - silenceStartRef.current > 1500) {
            stopListening();
            return;
          }
        } else {
          silenceStartRef.current = null;
        }

        silenceTimerRef.current = setTimeout(checkSilence, 100);
      };

      mediaRecorder.start();
      setState('listening');
      checkSilence();
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
