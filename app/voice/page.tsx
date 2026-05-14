'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { useVoiceAgent } from '@/lib/useVoiceAgent';

const ICON_MIC = <><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" /><path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V20H8a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-2.08A7 7 0 0 0 19 11z" /></>;
const ICON_STOP = <rect x="7" y="7" width="10" height="10" rx="1.5" />;
const ICON_END = <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />;

export default function VoicePage() {
  const [user, setUser] = useState<User | null>(null);
  const { state, transcript, startListening, stopListening, endSession } = useVoiceAgent();
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const [waveDurations, setWaveDurations] = useState<number[]>([]);

  useEffect(() => {
    // Generate random durations only on client, after hydration
    const durations = Array.from({ length: 28 }, () => 0.6 + Math.random() * 0.8);
    setWaveDurations(durations);
  }, []);

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

  const getUserName = (user: User | null) => {
    if (!user) return 'Guest';
    const fullName = user.user_metadata?.full_name || user.user_metadata?.name;
    if (fullName) return fullName.split(' ')[0]; // First name only
    if (user.email) return user.email.split('@')[0];
    return 'User';
  };

  const getUserInitial = (user: User | null) => {
    const name = getUserName(user);
    return name.charAt(0).toUpperCase();
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
    <div className="voice-container">
      <header id="nav">
        <span className="nav-mark">ATHENOS</span>
        <nav className="nav-modes">
          <Link href="/" className="nav-mode">Chat</Link>
          <Link href="/voice" className="nav-mode active">Voice</Link>
        </nav>
        <div className="nav-right">
          <div className="nav-user">
            <div className="nav-avatar">{getUserInitial(user)}</div>
            <span className="nav-name">{getUserName(user)} · Strategist</span>
          </div>
        </div>
      </header>

      <main id="stage" className={state}>
        <div id="orb-wrap" className={state} onClick={() => {
          if (state === 'idle' || state === 'speaking') startListening();
          else if (state === 'listening') stopListening();
        }}>
          <div className="ring"></div>
          <div className="ring"></div>
          <div className="ring"></div>
          <div id="orb">
            <svg className="orb-mark" width={56} height={76} viewBox="0 0 110 150" fill="none">
              <path d="M 38 24 Q 55 10 72 24" stroke="#C9A961" strokeWidth={0.7} strokeLinecap="round" fill="none" />
              <g transform="translate(40,22) rotate(-58)">
                <path d="M0 0 Q2.8 -4.5 0 -10 Q-2.8 -4.5 0 0Z" stroke="#C9A961" strokeWidth={0.6} strokeLinejoin="round" fill="none" />
                <line x1={0} y1={-1} x2={0} y2={-9} stroke="#C9A961" strokeWidth={0.35} strokeLinecap="round" />
              </g>
              <g transform="translate(55,10)">
                <path d="M0 0 Q2.8 -4.5 0 -10 Q-2.8 -4.5 0 0Z" stroke="#C9A961" strokeWidth={0.7} strokeLinejoin="round" fill="none" />
                <line x1={0} y1={-1} x2={0} y2={-9} stroke="#C9A961" strokeWidth={0.4} strokeLinecap="round" />
              </g>
              <g transform="translate(70,22) rotate(58)">
                <path d="M0 0 Q2.8 -4.5 0 -10 Q-2.8 -4.5 0 0Z" stroke="#C9A961" strokeWidth={0.6} strokeLinejoin="round" fill="none" />
                <line x1={0} y1={-1} x2={0} y2={-9} stroke="#C9A961" strokeWidth={0.35} strokeLinecap="round" />
              </g>
              <line x1={18} y1={142} x2={55} y2={36} stroke="#C9A961" strokeWidth={1.2} strokeLinecap="round" />
              <line x1={92} y1={142} x2={55} y2={36} stroke="#C9A961" strokeWidth={1.2} strokeLinecap="round" />
              <line x1={33} y1={99} x2={77} y2={99} stroke="#C9A961" strokeWidth={0.9} strokeLinecap="round" />
              <line x1={10} y1={142} x2={26} y2={142} stroke="#C9A961" strokeWidth={0.75} strokeLinecap="round" />
              <line x1={84} y1={142} x2={100} y2={142} stroke="#C9A961" strokeWidth={0.75} strokeLinecap="round" />
            </svg>
          </div>
        </div>

        <div id="waveform" className={state === 'speaking' ? 'visible' : ''}>
          {Array.from({ length: 28 }).map((_, i) => (
            <div
              key={i}
              className="wave-bar"
              style={{
                animationDelay: `${i * 0.07}s`,
                animationDuration: waveDurations[i] ? `${waveDurations[i]}s` : '1s'
              }}
            ></div>
          ))}
        </div>

        <div id="status">
          <div id="status-main">{status.main}</div>
          <div id="status-sub">{status.sub}</div>
        </div>
      </main>

      <section id="transcript">
        <div id="transcript-inner">
          {transcript.map((entry, i) => (
            <div key={i} className="tr-line">
              <span className={`tr-who ${entry.role === 'user' ? 'you' : 'ai'}`}>
                {entry.role === 'user' ? 'You' : 'Athenos'}
              </span>
              <span className="tr-text">{entry.content}</span>
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      </section>

      <footer id="controls">
        <div className="ctrl-placeholder"></div>
        <button className="ctrl" onClick={() => {
          if (state === 'idle' || state === 'speaking') startListening();
          else if (state === 'listening') stopListening();
        }} aria-label="Speak">
          <div className={`ctrl-circle lg ${state === 'listening' ? 'listening' : ''}`} id="micBtn">
            <svg id="micIcon" width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              {state === 'listening' ? ICON_STOP : ICON_MIC}
            </svg>
          </div>
          <span className="ctrl-label" id="micLabel">{state === 'listening' ? 'Stop' : 'Speak'}</span>
        </button>
        <button className="ctrl" onClick={endSession} aria-label="End">
          <div className="ctrl-circle sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              {ICON_END}
            </svg>
          </div>
          <span className="ctrl-label">End</span>
        </button>
      </footer>

      <style jsx>{`
        .voice-container {
          --bg: #0B0B0F;
          --gold: #C9A961;
          --gold2: #E5C476;
          --deep-gold: #A88944;
          --white: #FFFFFF;
          --gray: #C8C8C8;
          --gray-mid: #888888;
          --gray-mute: #5C5C5C;
          --card: #15151B;
          --card-border: rgba(201,169,97,.16);
          --serif: 'Cormorant Garamond', Times, serif;
          --sans: 'Inter', system-ui, sans-serif;
          
          background: var(--bg);
          color: var(--white);
          font-family: var(--sans);
          height: 100vh;
          width: 100vw;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          -webkit-font-smoothing: antialiased;
        }

        #nav {
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
          border-bottom: 1px solid rgba(255,255,255,.05);
          background: rgba(11,11,15,.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          z-index: 10;
          flex-shrink: 0;
        }
        .nav-mark {
          font-family: var(--serif);
          font-weight: 600; font-size: 18px;
          letter-spacing: .18em;
          color: var(--gold);
        }
        .nav-modes {
          display: flex; gap: 6px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(201,169,97,.2);
          border-radius: 8px; padding: 3px;
        }
        .nav-mode {
          background: transparent;
          display: inline-block;
          padding: 8px 20px;
          font-size: 11px; font-weight: 600;
          letter-spacing: .2em; text-transform: uppercase;
          color: var(--gray-mid);
          border-radius: 5px;
          cursor: pointer;
          transition: color .25s ease, background .25s ease;
          text-decoration: none;
        }
        .nav-mode:hover { color: var(--white); }
        .nav-mode.active { background: rgba(201,169,97,.35); color: #C9A961; }
        .nav-right { display: flex; align-items: center; gap: 14px; }
        .nav-user { display: flex; align-items: center; gap: 10px; }
        .nav-avatar {
          width: 32px; height: 32px; border-radius: 50%;
          background: linear-gradient(135deg, var(--deep-gold), var(--gold));
          display: flex; align-items: center; justify-content: center;
          font-family: var(--serif); font-weight: 600; font-size: 14px; color: #0B0B0F;
        }
        .nav-name {
          font-family: var(--sans);
          font-size: 12px; color: var(--gray);
          letter-spacing: .04em;
        }

        #stage {
          flex: 1;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          position: relative;
          overflow: hidden;
          padding: 32px 24px 0;
        }
        #stage::before {
          content: ''; position: absolute; inset: 0;
          background: radial-gradient(ellipse 60% 50% at 50% 50%, rgba(201,169,97,.06) 0%, transparent 70%);
          pointer-events: none;
          transition: background .8s ease;
        }
        #stage.listening::before { background: radial-gradient(ellipse 60% 50% at 50% 50%, rgba(201,169,97,.13) 0%, transparent 65%); }
        #stage.speaking::before { background: radial-gradient(ellipse 60% 50% at 50% 50%, rgba(201,169,97,.1) 0%, transparent 65%); }

        #orb-wrap {
          position: relative;
          width: 340px; height: 340px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        }
        #orb {
          width: 200px; height: 200px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, rgba(229,196,118,.35) 0%, rgba(201,169,97,.18) 35%, rgba(168,137,68,.1) 60%, rgba(11,11,15,.6) 80%);
          border: 1px solid rgba(201,169,97,.22);
          position: relative;
          display: flex; align-items: center; justify-content: center;
          transition: transform .4s cubic-bezier(.4, 0, .2, 1), box-shadow .4s ease;
          animation: orbIdle 6s ease-in-out infinite;
          box-shadow: 0 0 50px rgba(201,169,97,.1), 0 0 110px rgba(201,169,97,.05), inset 0 0 40px rgba(201,169,97,.05);
          z-index: 2;
        }
        @keyframes orbIdle {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        #orb-wrap.listening #orb {
          animation: orbListen .7s ease-in-out infinite alternate;
          box-shadow: 0 0 70px rgba(201,169,97,.24), 0 0 140px rgba(201,169,97,.1), inset 0 0 50px rgba(201,169,97,.1);
        }
        @keyframes orbListen {
          from { transform: scale(.96); }
          to { transform: scale(1.06); }
        }
        #orb-wrap.speaking #orb {
          animation: orbSpeak .45s ease-in-out infinite alternate;
          box-shadow: 0 0 90px rgba(201,169,97,.3), 0 0 170px rgba(201,169,97,.15), inset 0 0 60px rgba(201,169,97,.12);
        }
        @keyframes orbSpeak {
          from { transform: scale(.98); }
          to { transform: scale(1.08); }
        }

        .orb-mark {
          opacity: .65;
          transition: opacity .3s ease, filter .3s ease;
        }
        #orb-wrap.listening .orb-mark { opacity: .9; }
        #orb-wrap.speaking .orb-mark {
          opacity: 1;
          filter: drop-shadow(0 0 10px rgba(201,169,97,.6));
        }

        .ring {
          position: absolute; border-radius: 50%;
          border: 1px solid rgba(201,169,97,.14);
          animation: ringExpand 3.2s ease-out infinite;
          opacity: 0; pointer-events: none;
        }
        .ring:nth-child(1) { animation-delay: 0s; }
        .ring:nth-child(2) { animation-delay: 0.9s; }
        .ring:nth-child(3) { animation-delay: 1.8s; }
        @keyframes ringExpand {
          0% { width: 200px; height: 200px; opacity: .5; }
          100% { width: 340px; height: 340px; opacity: 0; }
        }
        #orb-wrap.listening .ring, #orb-wrap.speaking .ring {
          animation: ringExpandActive 1.3s ease-out infinite;
          border-color: rgba(201,169,97,.3);
        }
        @keyframes ringExpandActive {
          0% { width: 200px; height: 200px; opacity: .85; }
          100% { width: 360px; height: 360px; opacity: 0; }
        }
        #orb-wrap.listening .ring:nth-child(2) { animation-delay: .45s; }
        #orb-wrap.listening .ring:nth-child(3) { animation-delay: .9s; }
        #orb-wrap.speaking .ring:nth-child(2) { animation-delay: .32s; }
        #orb-wrap.speaking .ring:nth-child(3) { animation-delay: .65s; }

        #waveform {
          display: flex; align-items: center; gap: 3px;
          height: 48px; margin-top: 42px;
          opacity: 0; transition: opacity .4s ease;
        }
        #waveform.visible { opacity: 1; }
        .wave-bar {
          width: 3px; border-radius: 2px;
          background: var(--gold); opacity: .6;
          animation: waveAnim 1s ease-in-out infinite;
        }
        @keyframes waveAnim {
          0%, 100% { height: 5px; opacity: .3; }
          50% { height: 36px; opacity: .85; }
        }

        #status { margin-top: 36px; text-align: center; }
        #status-main {
          font-family: var(--serif);
          font-weight: 500;
          font-size: 36px;
          letter-spacing: .005em;
          color: var(--white);
          line-height: 1.1;
        }
        #status-sub {
          font-family: var(--sans);
          font-size: 11px; font-weight: 600;
          letter-spacing: .24em; text-transform: uppercase;
          color: var(--gray-mid);
          margin-top: 12px;
        }

        #transcript {
          max-height: 220px;
          overflow-y: auto;
          flex-shrink: 0;
          position: relative;
          padding: 0 0 16px;
        }
        #transcript::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 36px;
          background: linear-gradient(to bottom, var(--bg), transparent);
          pointer-events: none; z-index: 1;
        }
        #transcript::-webkit-scrollbar { width: 4px; }
        #transcript::-webkit-scrollbar-thumb { background: rgba(201,169,97,0.15); border-radius: 2px; }
        #transcript-inner {
          max-width: 760px; margin: 0 auto;
          padding: 18px 32px 0;
          display: flex; flex-direction: column; gap: 14px;
        }
        .tr-line {
          display: flex; align-items: baseline; gap: 14px;
          animation: trIn .4s ease forwards;
        }
        @keyframes trIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .tr-who {
          font-family: var(--sans);
          font-size: 10px; font-weight: 600;
          letter-spacing: .24em; text-transform: uppercase;
          flex-shrink: 0; min-width: 64px;
          opacity: .65;
        }
        .tr-who.you { color: var(--white); }
        .tr-who.ai { color: var(--gold); }
        .tr-text {
          font-family: var(--serif);
          font-weight: 400;
          font-size: 18px;
          line-height: 1.55;
          letter-spacing: .005em;
          color: rgba(245, 240, 231, .82);
        }

        #controls {
          height: 104px;
          display: flex; align-items: center; justify-content: center; gap: 36px;
          border-top: 1px solid rgba(255,255,255,.05);
          background: rgba(11,11,15,.6);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          flex-shrink: 0;
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .ctrl {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          transition: transform .2s ease;
          background: none; border: none; padding: 0; cursor: pointer; color: inherit;
        }
        .ctrl:hover { transform: translateY(-2px); }
        .ctrl-placeholder { width: 64px; }
        .ctrl-circle {
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          transition: all .25s ease;
        }
        .ctrl-circle.sm {
          width: 50px; height: 50px;
          background: rgba(255,255,255,.04);
          border: 1px solid rgba(255,255,255,.08);
        }
        .ctrl-circle.sm:hover {
          background: rgba(201,169,97,.1);
          border-color: rgba(201,169,97,.3);
        }
        .ctrl-circle.sm :global(svg) { fill: var(--gray); transition: fill .25s ease; }
        .ctrl-circle.sm:hover :global(svg) { fill: var(--gold); }
        .ctrl-circle.lg {
          width: 74px; height: 74px;
          background: var(--gold);
          box-shadow: 0 0 0 8px rgba(201,169,97,.1);
        }
        .ctrl-circle.lg:hover { box-shadow: 0 0 0 12px rgba(201,169,97,.16); }
        .ctrl-circle.lg :global(svg) { fill: #0B0B0F; }
        .ctrl-circle.lg.listening {
          background: linear-gradient(135deg, var(--deep-gold), var(--gold));
          box-shadow: 0 0 0 8px rgba(201,169,97,.18), 0 0 32px rgba(201,169,97,.32);
          animation: micPulse .8s ease-in-out infinite alternate;
        }
        @keyframes micPulse {
          from { box-shadow: 0 0 0 8px rgba(201,169,97,.18), 0 0 24px rgba(201,169,97,.22); }
          to { box-shadow: 0 0 0 14px rgba(201,169,97,.08), 0 0 44px rgba(201,169,97,.4); }
        }
        .ctrl-label {
          font-family: var(--sans);
          font-size: 10px; font-weight: 600;
          letter-spacing: .24em; text-transform: uppercase;
          color: var(--gray-mute);
        }

        @media (max-height: 680px) {
          #orb-wrap { width: 220px; height: 220px; }
          #orb { width: 140px; height: 140px; }
          @keyframes ringExpand {
            0% { width: 140px; height: 140px; opacity: .5; }
            100% { width: 220px; height: 220px; opacity: 0; }
          }
          @keyframes ringExpandActive {
            0% { width: 140px; height: 140px; opacity: .85; }
            100% { width: 240px; height: 240px; opacity: 0; }
          }
          #status-main { font-size: 24px; }
          #transcript { max-height: 96px; }
          #waveform { height: 32px; margin-top: 18px; }
          .ctrl-placeholder { width: 44px; }
        }

        @media (max-width: 768px) {
          #nav {
            padding: 0 16px;
            padding-top: max(env(safe-area-inset-top, 0px), 16px);
            height: auto;
            min-height: 64px;
            flex-wrap: wrap;
          }
          .nav-mark {
            font-size: 14px;
            letter-spacing: 0.12em;
          }
          .nav-modes {
            position: static;
            transform: none;
            order: 3;
            flex: 1 1 100%;
            justify-content: center;
            margin-top: 8px;
            padding-bottom: 8px;
          }
          .nav-mode {
            padding: 6px 14px;
            font-size: 10px;
            letter-spacing: 0.15em;
          }
          .nav-user .nav-name {
            display: none;
          }
          .nav-avatar {
            width: 28px;
            height: 28px;
            font-size: 12px;
          }
        }

        @media (max-width: 375px) {
          .nav-mark {
            font-size: 12px;
          }
          .nav-mode {
            padding: 5px 10px;
            font-size: 9px;
          }
          .nav-avatar {
            width: 26px;
            height: 26px;
            font-size: 11px;
          }
        }
      `}</style>
    </div>
  );
}
