import AsteroidsGame from './AsteroidsGame';

const CONTROLS: [string, string][] = [
  ['← → / A D', 'Rotate'],
  ['↑ / W', 'Thrust'],
  ['SPACE', 'Fire'],
  ['P', 'Pause'],
  ['M', 'Mute'],
];

export default function FunPage() {
  return (
    <div className="scanline-bg h-screen h-dvh overflow-y-auto overflow-x-hidden bg-[#0d0d0d] text-gray-200"
      style={{ overscrollBehavior: 'none' }}>
      <main
        className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 px-3 py-3 sm:gap-6 sm:px-4 sm:py-10"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))', paddingLeft: 'max(0.75rem, env(safe-area-inset-left))', paddingRight: 'max(0.75rem, env(safe-area-inset-right))' }}
      >
        <header className="flex w-full items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <img src="/sprite.svg" alt="" width={32} height={32} className="pixelated h-8 w-8 shrink-0 sm:h-10 sm:w-10" />
            <h1 className="retro truncate text-[11px] leading-tight text-amber-400 sm:text-xl">PIXELFORGE ARCADE</h1>
          </div>
          <a href="/" className="retro shrink-0 py-2 text-[10px] text-amber-500 underline-offset-4 hover:text-amber-300 hover:underline sm:text-xs">
            &larr; <span className="max-[420px]:hidden">Back to PixelForge</span><span className="min-[421px]:hidden">Back</span>
          </a>
        </header>

        <AsteroidsGame className="w-full" autoFocus />

        <section aria-label="Controls" className="w-full [@media(pointer:coarse)]:hidden border-2 border-amber-900/60 bg-[#14110a] p-4">
          <h2 className="retro mb-3 text-[10px] text-amber-400 sm:text-xs">CONTROLS</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-gray-300 sm:grid-cols-5">
            {CONTROLS.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1">
                <dt className="retro text-[10px] text-amber-300">{k}</dt>
                <dd className="text-gray-400">{v}</dd>
              </div>
            ))}
          </dl>
          
        </section>
      </main>
    </div>
  );
}
