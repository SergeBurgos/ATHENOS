'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { useVoiceAgent } from '@/lib/useVoiceAgent';

export default function VoicePage() {
  const [user, setUser] = useState<User | null>(null);
  const { state, transcript, startListening, stopListening, endSession } = useVoiceAgent();
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });
  }, []);

  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript]);

  const getInitial = () => {
    if (!user) return '?';
    const fullName = user.user_metadata?.full_name as string | undefined;
    if (fullName) return fullName.trim().split(' ')[0]?.[0]?.toUpperCase() || 'U';
    return user.email?.[0]?.toUpperCase() || 'U';
  };

  const getStatusText = () => {
    switch (state) {
      case 'idle': return { main: 'Tap to speak', sub: 'Athenos is ready' };
      case 'listening': return { main: 'Listening', sub: 'Speak naturally' };
      case 'processing': return { main: 'Thinking', sub: 'One moment' };
      case 'speaking': return { main: 'Athenos', sub: 'Speaking now' };
    }
  };

  const status = getStatusText();

  return (
    <div className="flex flex-col min-h-screen bg-[#0B0B0F] text-white font-sans selection:bg-[#C9A961]/30">
      {/* Top Nav */}
      <nav className="h-16 flex items-center justify-between px-6 border-b border-white/5">
        <div className="flex items-center gap-2">
           <svg width="24" height="24" viewBox="0 0 110 150" fill="none">
             <line x1="18" y1="142" x2="55" y2="36" stroke="#C9A961" strokeWidth="6" strokeLinecap="round" />
             <line x1="92" y1="142" x2="55" y2="36" stroke="#C9A961" strokeWidth="6" strokeLinecap="round" />
             <line x1="33" y1="99" x2="77" y2="99" stroke="#C9A961" strokeWidth="4" strokeLinecap="round" />
           </svg>
           <span className="font-serif text-xl tracking-wide font-medium">ATHENOS</span>
        </div>

        <div className="flex items-center bg-[#15151B] p-1 rounded-full border border-white/5">
          <Link href="/" className="px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/50 hover:text-white transition-colors">Chat</Link>
          <div className="px-5 py-1.5 text-xs font-semibold uppercase tracking-wider bg-[#C9A961] text-[#0B0B0F] rounded-full">Voice</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right">
            <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-0.5">Strategist</div>
            <div className="text-xs font-medium text-white/70">{user?.email || 'Guest User'}</div>
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E5C476] to-[#A88944] flex items-center justify-center text-[#0B0B0F] font-bold text-sm shadow-lg shadow-[#C9A961]/20">
            {getInitial()}
          </div>
        </div>
      </nav>

      {/* Main Stage */}
      <main className="flex-1 flex flex-col items-center justify-center relative px-6">
        <div 
          className="relative w-[340px] h-[340px] flex items-center justify-center cursor-pointer group"
          onClick={() => state === 'idle' ? startListening() : stopListening()}
        >
          {/* Rings */}
          <div className={`absolute inset-0 rounded-full border border-[#C9A961]/20 ${state === 'idle' ? 'animate-ring-idle' : 'animate-ring-active'}`} style={{ animationDelay: '0s' }}></div>
          <div className={`absolute inset-0 rounded-full border border-[#C9A961]/15 ${state === 'idle' ? 'animate-ring-idle' : 'animate-ring-active'}`} style={{ animationDelay: '1s' }}></div>
          <div className={`absolute inset-0 rounded-full border border-[#C9A961]/10 ${state === 'idle' ? 'animate-ring-idle' : 'animate-ring-active'}`} style={{ animationDelay: '2s' }}></div>

          {/* Orb */}
          <div className={`relative w-[200px] h-[200px] rounded-full bg-[#15151B] flex items-center justify-center shadow-[0_0_50px_rgba(201,169,97,0.15)] transition-all duration-500 border border-white/5 z-10 
            ${state === 'listening' ? 'scale-110 shadow-[0_0_80px_rgba(201,169,97,0.3)]' : ''}
            ${state === 'idle' ? 'animate-orb-pulse-idle' : state === 'listening' ? 'animate-orb-pulse-listening' : 'animate-orb-pulse-speaking'}`}>
            
            {/* Athenos Logo */}
            <svg width="84" height="84" viewBox="0 0 110 150" fill="none" className="opacity-80">
              <line x1="18" y1="142" x2="55" y2="36" stroke="#C9A961" strokeWidth="6" strokeLinecap="round" />
              <line x1="92" y1="142" x2="55" y2="36" stroke="#C9A961" strokeWidth="6" strokeLinecap="round" />
              <line x1="33" y1="99" x2="77" y2="99" stroke="#C9A961" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Status Text */}
        <div className="mt-12 text-center h-[90px]">
          <h1 className="font-serif text-4xl font-medium mb-3 tracking-tight text-white/95">
            {status.main}
          </h1>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#C9A961] opacity-70">
            {status.sub}
          </p>
        </div>

        {/* Waveform */}
        {state === 'speaking' && (
          <div className="flex items-center gap-1.5 h-12 mt-4">
            {Array.from({ length: 28 }).map((_, i) => (
              <div 
                key={i}
                className="w-[3px] bg-[#C9A961] rounded-full animate-waveform-bar"
                style={{ 
                  height: '8px',
                  animationDuration: `${0.6 + Math.random() * 0.8}s`,
                  animationDelay: `${Math.random() * -1}s`
                }}
              ></div>
            ))}
          </div>
        )}
      </main>

      {/* Transcript Section */}
      <section className="max-w-2xl w-full mx-auto px-6 overflow-hidden flex flex-col">
        <div className="max-height-[220px] overflow-y-auto pr-2 custom-scrollbar mask-fade-top flex flex-col gap-6 py-8">
          {transcript.map((entry, i) => (
            <div key={i} className="animate-fade-in-up">
              <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${entry.role === 'user' ? 'text-white/40' : 'text-[#C9A961]'}`}>
                {entry.role === 'user' ? 'You' : 'Athenos'}
              </div>
              <div className="font-serif text-[18px] leading-[1.55] text-white/90">
                {entry.content}
              </div>
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      </section>

      {/* Footer Controls */}
      <footer className="h-[104px] flex items-center justify-between px-10 pb-[safe-area-inset-bottom]">
        <div className="w-24"></div> {/* Spacer for symmetry */}
        
        <button 
          onClick={() => state === 'idle' ? startListening() : stopListening()}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 border-2 
            ${state === 'listening' ? 'bg-[#C9A961] border-[#C9A961] scale-110 shadow-lg shadow-[#C9A961]/30' : 'bg-transparent border-white/10 hover:border-[#C9A961]/50'}`}
        >
          {state === 'listening' ? (
             <div className="w-6 h-6 bg-[#0B0B0F] rounded-sm"></div>
          ) : (
             <div className="w-6 h-6 border-2 border-[#C9A961] rounded-full"></div>
          )}
        </button>

        <button 
          onClick={endSession}
          className="text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors px-6 py-3 border border-white/5 rounded-full hover:bg-white/5"
        >
          End
        </button>
      </footer>

      <style jsx global>{`
        @keyframes ring-idle {
          0% { transform: scale(0.58); opacity: 0.8; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes ring-active {
          0% { transform: scale(0.55); opacity: 1; }
          100% { transform: scale(1.05); opacity: 0; }
        }
        @keyframes orb-pulse-idle {
          0% { transform: scale(1); box-shadow: 0 0 40px rgba(201,169,97,0.1); }
          50% { transform: scale(1.02); box-shadow: 0 0 60px rgba(201,169,97,0.15); }
          100% { transform: scale(1); box-shadow: 0 0 40px rgba(201,169,97,0.1); }
        }
        @keyframes orb-pulse-listening {
          0% { transform: scale(1.1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1.1); }
        }
        @keyframes orb-pulse-speaking {
          0% { transform: scale(1.08); }
          50% { transform: scale(1.12); }
          100% { transform: scale(1.08); }
        }
        @keyframes waveform-bar {
          0%, 100% { height: 8px; }
          50% { height: 32px; }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .animate-ring-idle { animation: ring-idle 3.2s linear infinite; }
        .animate-ring-active { animation: ring-active 1.3s linear infinite; }
        .animate-orb-pulse-idle { animation: orb-pulse-idle 6s ease-in-out infinite; }
        .animate-orb-pulse-listening { animation: orb-pulse-listening 0.7s ease-in-out infinite; }
        .animate-orb-pulse-speaking { animation: orb-pulse-speaking 0.45s ease-in-out infinite; }
        .animate-waveform-bar { animation: waveform-bar ease-in-out infinite; }
        .animate-fade-in-up { animation: fade-in-up 0.4s ease-out forwards; }

        .mask-fade-top {
          -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 15%);
          mask-image: linear-gradient(to bottom, transparent 0%, black 15%);
        }

        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(201,169,97,0.2); border-radius: 10px; }
        
        @media (max-height: 680px) {
          main { padding-top: 2rem; padding-bottom: 1rem; }
          .w-[340px] { width: 260px; height: 260px; }
          .w-[200px] { width: 140px; height: 140px; }
          h1 { font-size: 1.875rem; }
        }
      `}</style>
    </div>
  );
}
