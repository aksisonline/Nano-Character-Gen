import SpriteCanvas from './SpriteCanvas';
import { BASE_CHARACTERS } from '../baseCharacters';
import { ToolMode } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';
import { Button } from '@/components/ui/8bit/button';

const STEPS = [
  { n: '1', title: 'Create', body: 'Describe a character, or start from a template. PixelForge draws a 32×48 sprite with a clean, limited palette.' },
  { n: '2', title: 'Edit', body: 'Touch up every pixel with the built-in editor: pencil, fill, eraser and an editable palette.' },
  { n: '3', title: 'Animate', body: 'Define your own clips (walk, attack, anything), set frames and FPS, then export transparent GIFs.' },
];

export const signIn = () => { window.location.href = '/api/auth/login'; };

interface LandingProps {
  weeklyLimit?: number;
  /** Signed-in account; when present the CTA greets the user and opens the studio. */
  user?: { name: string | null } | null;
  onEnter?: () => void;
}

export default function Landing({ weeklyLimit = 20, user, onEnter }: LandingProps) {
  const failed = new URLSearchParams(window.location.search).get('signin') === 'failed';
  const isMobile = useIsMobile();
  const showcase = BASE_CHARACTERS.slice(0, 3);
  return (
    <div className="scanline-bg h-screen h-dvh overflow-y-auto overflow-x-hidden bg-[#0d0d0d] text-gray-200">
      <main className="mx-auto flex max-w-5xl flex-col gap-12 px-5 py-10 sm:gap-20 sm:px-6 sm:py-24" style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}>
        <section className="flex flex-col items-center gap-6 text-center sm:gap-8">
          <img src="/sprite.svg" alt="" width={80} height={80} className="pixelated" />
          <h1 className="retro text-2xl leading-tight text-amber-400 sm:text-5xl">PIXELFORGE</h1>
          <p className="max-w-xl text-sm leading-relaxed text-gray-400 sm:text-base">
            Make a pixel-art game character from a sentence, polish it by hand, and bring it to life with
            custom animations. Export it as a sprite, a PNG, or a transparent GIF.
          </p>
          <div className="flex items-end justify-center gap-4 py-2 sm:gap-6 sm:py-4" aria-hidden>
            {showcase.map((c, i) => (
              <div key={c.id} className={`pixelated sprite-shadow ${i === 1 ? 'scale-110' : 'opacity-80'}`}>
                <SpriteCanvas matrix={c.matrix} scale={isMobile ? (window.innerWidth < 350 ? 2 : 3) : 4} selectedColorIndex={0} toolMode={ToolMode.PENCIL}
                  onUpdatePixel={() => {}} showGrid={false} readOnly />
              </div>
            ))}
          </div>
          <div className="flex w-full flex-col items-center gap-3">
            <Button
              onClick={user ? onEnter : signIn}
              className="retro game-button h-12 w-full max-w-xs px-8 py-3 text-xs sm:w-auto"
            >
              {user ? `Hello ${user.name?.trim() || 'there'}` : 'Sign in to start'}
            </Button>
            {failed && <p role="alert" className="text-xs text-red-400">Sign-in didn't complete. Please try again.</p>}
            <p className="text-xs text-gray-500">
              {user ? 'Tap to open the studio.' : 'Uses your AKS account.'} Includes {weeklyLimit} AI generations every week.
            </p>
          </div>
        </section>

        <section aria-labelledby="how" className="flex flex-col gap-8">
          <h2 id="how" className="retro text-center text-xs text-gray-500">HOW IT WORKS</h2>
          <ol className="grid gap-4 sm:grid-cols-3 sm:gap-6">
            {STEPS.map((s) => (
              <li key={s.n} className="flex flex-col gap-3 border-2 border-gray-800 bg-[#141414] p-5">
                <span className="retro text-amber-500">{s.n} · {s.title.toUpperCase()}</span>
                <p className="text-sm leading-relaxed text-gray-400">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-2 border-gray-800 bg-[#141414] p-5 text-sm sm:p-6 leading-relaxed text-gray-400">
          <h2 className="retro mb-3 text-xs text-gray-300">FAIR USE</h2>
          Image generation costs real money, so it needs a sign-in and a weekly allowance of {weeklyLimit} generations
          (a new sprite or an animation clip each counts as one). The limit resets every Monday at 00:00 IST. Editing,
          templates and exporting never use your allowance.
        </section>

        <footer className="pb-4 text-center text-xs text-gray-600">A project by AKS</footer>
      </main>
    </div>
  );
}
