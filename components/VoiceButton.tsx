'use client';

import { useVoiceAgent } from '@/lib/useVoiceAgent';

export default function VoiceButton() {
  const { state, startListening, stopListening } = useVoiceAgent();

  const getButtonStyles = () => {
    switch (state) {
      case 'idle':
        return 'bg-gray-800 text-gray-300 hover:bg-gray-700';
      case 'listening':
        return 'bg-red-600 text-white animate-pulse';
      case 'processing':
        return 'bg-yellow-600 text-white opacity-70 cursor-not-allowed';
      case 'speaking':
        return 'bg-green-600 text-white';
    }
  };

  const getButtonIcon = () => {
    switch (state) {
      case 'idle':
        return '🎙️';
      case 'listening':
        return '🔴';
      case 'processing':
        return '⏳';
      case 'speaking':
        return '🔊';
    }
  };

  return (
    <button
      onMouseDown={startListening}
      onMouseUp={stopListening}
      onMouseLeave={stopListening}
      onTouchStart={startListening}
      onTouchEnd={stopListening}
      disabled={state === 'processing' || state === 'speaking'}
      className={`rounded-full p-2 ml-2 transition-colors duration-200 flex items-center justify-center w-10 h-10 ${getButtonStyles()}`}
      title={state === 'idle' ? 'Hold to talk to ATHENOS' : state}
    >
      <span className="text-xl">{getButtonIcon()}</span>
    </button>
  );
}
