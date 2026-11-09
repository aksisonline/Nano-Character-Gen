import AsteroidsGame from './AsteroidsGame';
import '../styles/outage.css';

interface OutagePageProps {
  reason?: string;
  eta?: string;
  since?: string;
}

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400';

export default function OutagePage({ reason, eta, since }: OutagePageProps) {
  const text = reason?.trim();
  // All operator-provided strings are rendered as React text nodes (auto-escaped), never as HTML.
  return (
    <div className="scanline-bg min-h-screen min-h-dvh overflow-x-hidden bg-[#0d0d0d] text-gray-200">
      <main
        className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-10 text-center sm:gap-8 sm:px-6 sm:py-16"
        style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="outage-logo mt-2" aria-hidden>
          <img className="base" src="/sprite.svg" alt="" />
          <img className="ghost-a" src="/sprite.svg" alt="" />
          <img className="ghost-b" src="/sprite.svg" alt="" />
          <i className="outage-spark s1" />
          <i className="outage-spark s2" />
          <i className="outage-spark s3" />
        </div>

        <div className="flex flex-col gap-3">
          <p className="retro text-[10px] tracking-widest text-amber-500 sm:text-xs">
            PIXELFORGE<span className="outage-dots" aria-hidden> <span>.</span><span>.</span><span>.</span></span>
          </p>
          <h1 className="retro text-lg leading-snug text-amber-400 sm:text-3xl sm:leading-snug">
            PixelForge is temporarily out of service
          </h1>
        </div>

        <section
          role="status"
          aria-live="polite"
          aria-label="Outage details"
          className="w-full border-4 border-amber-700/70 bg-[#141414] p-4 text-left shadow-[4px_4px_0_0_rgba(180,130,70,0.35)] sm:p-5"
        >
          <p className="retro mb-3 text-[10px] text-amber-400">{text ? 'WHAT IS HAPPENING' : 'STATUS'}</p>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-100 sm:text-base">
            {text || "We're doing some maintenance. PixelForge will be back shortly."}
          </p>
          {(eta || since) && (
            <dl className="mt-4 flex flex-col gap-1 border-t border-amber-900/50 pt-3 text-xs text-gray-300 sm:text-sm">
              {eta && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-amber-400">Expected back:</dt>
                  <dd className="break-words">{eta}</dd>
                </div>
              )}
              {since && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-amber-400">Since:</dt>
                  <dd className="break-words">{since}</dd>
                </div>
              )}
            </dl>
          )}
        </section>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`retro min-h-11 cursor-pointer border-4 border-amber-300 bg-amber-400 px-5 py-3 text-xs text-black shadow-[4px_4px_0_0_#92400e] hover:bg-amber-300 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_0_#92400e] ${focusRing}`}
        >
          Check again
        </button>

        <section aria-labelledby="outage-play" className="w-full border-4 border-gray-700 bg-[#101010] p-3 sm:p-4">
          <h2 id="outage-play" className="retro mb-3 text-[10px] text-gray-300 sm:text-xs">
            PLAY WHILE YOU WAIT
          </h2>
          <AsteroidsGame className="mx-auto block w-full max-w-full" />
          <p className="mt-3 text-xs text-gray-400">
            Want more room?{' '}
            <a href="/fun" className={`text-amber-400 underline underline-offset-2 hover:text-amber-300 ${focusRing}`}>
              Open the fullscreen arcade
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}
