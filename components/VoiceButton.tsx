'use client';

import { useState, useRef, useEffect } from 'react';

type State = 'idle' | 'recording' | 'processing' | 'playing';

export default function VoiceButton() {
  const [state, setState] = useState<State>('idle');
  const [history, setHistory] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = async () => {
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

      mediaRecorder.onstop = async () => {
        setState('processing');
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        const formData = new FormData();
        formData.append('audio', audioBlob);
        formData.append('history', JSON.stringify(history));

        try {
          const response = await fetch('/api/voice', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error('API failed');
          }

          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          
          const userText = decodeURIComponent(response.headers.get('X-User-Transcript') || '');
          const assistantText = decodeURIComponent(response.headers.get('X-Assistant-Reply') || '');
          if (userText && assistantText) {
            setHistory(prev => [...prev, { role: 'user' as const, content: userText }, { role: 'assistant' as const, content: assistantText }].slice(-10));
          }

          setState('playing');
          const audio = new Audio(url);
          audioRef.current = audio;

          audio.onended = () => {
            setState('idle');
            URL.revokeObjectURL(url);
          };

          audio.play().catch(e => {
            console.error('Playback failed', e);
            setState('idle');
          });

        } catch (error) {
          console.error('Processing failed:', error);
          setState('idle');
        }
      };

      mediaRecorder.start();
      setState('recording');
    } catch (err) {
      console.error('Microphone access denied:', err);
      setState('idle');
    }
  };

  const stopRecording = () => {
    if (state === 'recording' && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  // Handle cleanup
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const getButtonStyles = () => {
    switch (state) {
      case 'idle':
        return 'bg-gray-800 text-gray-300 hover:bg-gray-700';
      case 'recording':
        return 'bg-red-600 text-white animate-pulse';
      case 'processing':
        return 'bg-yellow-600 text-white opacity-70 cursor-not-allowed';
      case 'playing':
        return 'bg-green-600 text-white';
    }
  };

  const getButtonIcon = () => {
    switch (state) {
      case 'idle':
        return '🎙️';
      case 'recording':
        return '🔴';
      case 'processing':
        return '⏳';
      case 'playing':
        return '🔊';
    }
  };

  return (
    <button
      onMouseDown={startRecording}
      onMouseUp={stopRecording}
      onMouseLeave={stopRecording}
      onTouchStart={startRecording}
      onTouchEnd={stopRecording}
      disabled={state === 'processing' || state === 'playing'}
      className={`rounded-full p-2 ml-2 transition-colors duration-200 flex items-center justify-center w-10 h-10 ${getButtonStyles()}`}
      title={state === 'idle' ? 'Hold to talk to ATHENOS' : state}
    >
      <span className="text-xl">{getButtonIcon()}</span>
    </button>
  );
}
