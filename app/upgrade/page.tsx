'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function UpgradePage() {
  const router = useRouter();

  useEffect(() => {
    // Reset body classes on /upgrade page to avoid inheriting chat layout
    const originalClasses = document.body.className;
    document.body.className = 'upgrade-page';
    return () => {
      document.body.className = originalClasses;
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#0a0805',
        color: '#f5f0e7',
        overflowY: 'auto',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '48px 16px',
        boxSizing: 'border-box',
        zIndex: 9999,
      }}
      className="font-sans antialiased"
    >
      <div className="w-full max-w-[900px] flex-grow flex flex-col justify-center py-4 px-2 md:px-6">
        {/* Header */}
        <div className="text-center mb-12 w-full flex flex-col items-center">
          <div className="flex justify-center mb-4">
            <svg width="40" height="52" viewBox="0 0 110 150" fill="none">
              <line x1="18" y1="142" x2="55" y2="36" stroke="#C9A035" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="92" y1="142" x2="55" y2="36" stroke="#C9A035" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="33" y1="99" x2="77" y2="99" stroke="#C9A035" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-light tracking-wide text-[#f5f0e7] mb-3">
            Upgrade to Strategist
          </h1>
          <p className="text-sm md:text-base text-[#C9A035]/65 font-light tracking-wider uppercase">
            Unlock the full ATHENOS experience
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-12 w-full">
          {/* Monthly */}
          <div className="bg-[#0d0a06] border border-[#222220] hover:border-[#C9A035]/30 rounded-xl p-8 flex flex-col justify-between transition-all duration-300 shadow-xl">
            <div>
              <h3 className="text-lg font-medium tracking-wide text-[#f5f0e7] mb-2">Monthly</h3>
              <div className="flex items-baseline mb-6">
                <span className="text-4xl font-serif font-light text-[#C9A035]">$24.99</span>
                <span className="text-sm text-[#7a7870] ml-2">/ month</span>
              </div>
              <p className="text-sm text-[#7a7870] font-light leading-relaxed mb-6">
                Flexibility with month-to-month access to the full suite of Strategist capabilities.
              </p>
            </div>
            <button
              disabled
              className="w-full py-3 px-4 bg-[#111110] text-[#7a7870] font-medium rounded-lg text-sm transition-all duration-200 cursor-not-allowed border border-transparent"
            >
              Coming soon
            </button>
          </div>

          {/* Annual */}
          <div className="bg-[#0d0a06] border border-[#C9A035]/40 hover:border-[#C9A035]/80 rounded-xl p-8 flex flex-col justify-between transition-all duration-300 shadow-2xl relative">
            <div className="absolute top-4 right-4 bg-[#C9A035]/10 border border-[#C9A035]/30 text-[#C9A035] text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full">
              Save 17%
            </div>
            <div>
              <h3 className="text-lg font-medium tracking-wide text-[#f5f0e7] mb-2">Annual</h3>
              <div className="flex items-baseline mb-6">
                <span className="text-4xl font-serif font-light text-[#C9A035]">$249</span>
                <span className="text-sm text-[#7a7870] ml-2">/ year</span>
              </div>
              <p className="text-sm text-[#7a7870] font-light leading-relaxed mb-6">
                Best value plan. Gain uninterrupted access to Athena reasoning capabilities and save.
              </p>
            </div>
            <button
              disabled
              className="w-full py-3 px-4 bg-[#111110] text-[#7a7870] font-medium rounded-lg text-sm transition-all duration-200 cursor-not-allowed border border-transparent"
            >
              Coming soon
            </button>
          </div>
        </div>

        {/* Benefits Section */}
        <div className="border-t border-[#C9A035]/15 pt-12 mb-12 w-full">
          <h2 className="text-xl font-serif font-light tracking-wide text-center text-[#f5f0e7] mb-8">
            Strategist Plan Benefits
          </h2>
          <div className="grid md:grid-cols-2 gap-x-12 gap-y-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[#C9A035] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-[#f5f0e7]">200 chat messages per day</h4>
                <p className="text-xs text-[#7a7870] mt-0.5">Substantial daily limit vs 10 on the free tier</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[#C9A035] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-[#f5f0e7]">15 voice turns per day</h4>
                <p className="text-xs text-[#7a7870] mt-0.5">Engage in vocal workflow vs 5 on the free tier</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[#C9A035] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-[#f5f0e7]">Unlimited web search</h4>
                <p className="text-xs text-[#7a7870] mt-0.5">Real-time reference capabilities vs 3 queries on free</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[#C9A035] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-[#f5f0e7]">Access to Athena</h4>
                <p className="text-xs text-[#7a7870] mt-0.5">Our deep reasoning and high-capability model persona</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[#C9A035] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-[#f5f0e7]">Persistent memory across sessions</h4>
                <p className="text-xs text-[#7a7870] mt-0.5">Athenos retains strategic context from previous workflows</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[#C9A035] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-[#f5f0e7]">Priority support</h4>
                <p className="text-xs text-[#7a7870] mt-0.5">Direct channel to engineering and support teams</p>
              </div>
            </div>
          </div>
        </div>

        {/* Athena Spotlight */}
        <div className="bg-gradient-to-r from-[#0d0a06] to-[#0a0805] border border-[#C9A035]/30 rounded-xl p-8 w-full text-center">
          <h3 className="text-sm font-semibold text-[#C9A035] uppercase tracking-widest mb-3">Athena Spotlight</h3>
          <h4 className="text-2xl font-serif font-light text-[#f5f0e7] mb-4">Deep Reasoning & Strategic Analysis</h4>
          <p
            style={{
              textAlign: 'center' as const,
              margin: '0 auto',
              maxWidth: '576px',
              display: 'block',
              width: '100%',
            }}
            className="text-sm text-[#7a7870] font-light leading-relaxed"
          >
            Athena is designed for strategic analysis, surfacing what you are missing, and executing deep reasoning tasks. 
            It analyzes business problems systematically, addresses blind spots in your plans, and suggests actionable next steps.
          </p>
        </div>
      </div>

      {/* Footer / Back Link */}
      <div className="text-center mt-12 w-full max-w-[900px]">
        <Link
          href="/"
          className="text-xs text-[#7a7870] hover:text-[#f5f0e7] tracking-wider uppercase transition-colors duration-200"
        >
          Continue with Sophocles for free
        </Link>
      </div>
    </div>
  );
}
