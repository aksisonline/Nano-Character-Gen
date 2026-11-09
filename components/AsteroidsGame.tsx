import { useCallback, useEffect, useRef, useState } from 'react';

const W = 640;
const H = 480;
const STEP = 1 / 60;
const TAU = Math.PI * 2;
const HS_KEY = 'pixelforge.asteroids.highscore';

const AMBER = '#fbbf24';
const DARK_AMBER = '#b8860b';
const BG = '#0d0d0d';
const INK = '#14110a';
const FONT = '"Press Start 2P", ui-monospace, monospace';

type Mode = 'start' | 'playing' | 'paused' | 'over';
type Size = 3 | 2 | 1;
interface Rock { x: number; y: number; vx: number; vy: number; r: number; size: Size; a: number; va: number; shape: number[] }
interface Bullet { x: number; y: number; vx: number; vy: number; life: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; s: number }
interface Game {
  mode: Mode;
  ship: { x: number; y: number; vx: number; vy: number; a: number; dead: number; invuln: number };
  rocks: Rock[];
  bullets: Bullet[];
  parts: Particle[];
  score: number;
  high: number;
  lives: number;
  wave: number;
  cooldown: number;
  shake: number;
  waveBanner: number;
  nextLife: number;
  t: number;
}

const RADIUS: Record<Size, number> = { 3: 38, 2: 22, 1: 11 };
const POINTS: Record<Size, number> = { 3: 20, 2: 50, 1: 100 };

const loadHigh = (): number => {
  try { return Math.max(0, parseInt(localStorage.getItem(HS_KEY) || '0', 10) || 0); } catch { return 0; }
};
const saveHigh = (n: number) => { try { localStorage.setItem(HS_KEY, String(n)); } catch { /* ignore */ } };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const wrap = (v: number, m: number) => (v < 0 ? v + m : v >= m ? v - m : v);

function makeRock(x: number, y: number, size: Size, speedMul = 1): Rock {
  const r = RADIUS[size];
  const sp = rnd(25, 60) * speedMul * (size === 1 ? 1.8 : size === 2 ? 1.3 : 1);
  const d = rnd(0, TAU);
  const n = 11;
  return { x, y, vx: Math.cos(d) * sp, vy: Math.sin(d) * sp, r, size, a: rnd(0, TAU), va: rnd(-1, 1), shape: Array.from({ length: n }, () => rnd(0.72, 1.1)) };
}

function spawnWave(g: Game) {
  const count = Math.min(3 + g.wave, 10);
  g.rocks = [];
  for (let i = 0; i < count; i++) {
    let x = 0, y = 0;
    do { x = rnd(0, W); y = rnd(0, H); } while (Math.hypot(x - W / 2, y - H / 2) < 130);
    g.rocks.push(makeRock(x, y, 3, 1 + g.wave * 0.08));
  }
  g.waveBanner = 2;
}

function newGame(high: number, mode: Mode): Game {
  const g: Game = {
    mode, high,
    ship: { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, dead: 0, invuln: 2 },
    rocks: [], bullets: [], parts: [], score: 0, lives: 3, wave: 1, cooldown: 0, shake: 0, waveBanner: 0, nextLife: 5000, t: 0,
  };
  spawnWave(g);
  return g;
}

function burst(g: Game, x: number, y: number, n: number, colors: string[], speed = 120) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU), s = rnd(speed * 0.2, speed);
    const life = rnd(0.35, 0.9);
    g.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color: colors[i % colors.length], s: Math.random() < 0.3 ? 3 : 2 });
  }
}

export default function AsteroidsGame({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(newGame(loadHigh(), 'start'));
  const keys = useRef({ left: false, right: false, thrust: false, fire: false });
  const audioRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const [coarse, setCoarse] = useState(false);

  const coarseRef = useRef(false);
  const [portrait, setPortrait] = useState(false);
  const touchRef = useRef(false);
  const buzz = useCallback((p: number | number[]) => {
    try { if (touchRef.current && typeof navigator.vibrate === 'function') navigator.vibrate(p); } catch { /* unsupported */ }
  }, []);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { coarseRef.current = coarse; }, [coarse]);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const on = () => { if (mq.matches) { touchRef.current = true; setCoarse(true); } };
    on();
    mq.addEventListener?.('change', on);
    const pq = window.matchMedia('(orientation: portrait)');
    const op = () => setPortrait(pq.matches);
    op();
    pq.addEventListener?.('change', op);
    // Hybrid devices: reveal touch controls on the first real touch.
    const onFirstTouch = (e: PointerEvent) => {
      if (e.pointerType === 'touch') { touchRef.current = true; setCoarse(true); }
    };
    window.addEventListener('pointerdown', onFirstTouch, { passive: true });
    return () => {
      mq.removeEventListener?.('change', on);
      pq.removeEventListener?.('change', op);
      window.removeEventListener('pointerdown', onFirstTouch);
    };
  }, []);

  const ensureAudio = useCallback((): AudioContext | null => {
    try {
      if (!audioRef.current) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return null;
        audioRef.current = new AC();
      }
      if (audioRef.current.state === 'suspended') void audioRef.current.resume();
      return audioRef.current;
    } catch { return null; }
  }, []);

  const sfx = useCallback((kind: 'shoot' | 'boom' | 'big' | 'die' | 'thrust' | 'start' | 'life') => {
    if (mutedRef.current) return;
    try {
      const ac = ensureAudio();
      if (!ac) return;
      const now = ac.currentTime;
      const o = ac.createOscillator();
      const gn = ac.createGain();
      o.connect(gn); gn.connect(ac.destination);
      const tone = (type: OscillatorType, f0: number, f1: number, dur: number, vol: number) => {
        o.type = type;
        o.frequency.setValueAtTime(f0, now);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
        gn.gain.setValueAtTime(vol, now);
        gn.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        o.start(now); o.stop(now + dur);
      };
      if (kind === 'shoot') tone('square', 880, 220, 0.12, 0.05);
      else if (kind === 'boom') tone('sawtooth', 180, 40, 0.25, 0.08);
      else if (kind === 'big') tone('sawtooth', 120, 30, 0.4, 0.1);
      else if (kind === 'die') tone('sawtooth', 300, 25, 0.8, 0.12);
      else if (kind === 'start') tone('square', 330, 660, 0.25, 0.06);
      else if (kind === 'life') tone('square', 600, 1200, 0.3, 0.06);
      else tone('triangle', 70, 50, 0.06, 0.04);
    } catch { /* audio unavailable */ }
  }, [ensureAudio]);

  useEffect(() => {
    const wrapEl = wrapRef.current!;
    const boxEl = boxRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let last = 0;
    let acc = 0;
    let scale = 1;
    let thrustTick = 0;

    const resize = () => {
      const cw = boxEl.clientWidth || W;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${Math.round((cw * H) / W)}px`;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(((cw * H) / W) * dpr);
      scale = canvas.width / W;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(boxEl);
    resize();

    const start = () => {
      gameRef.current = newGame(gameRef.current.high, 'playing');
      sfx('start');
    };
    const togglePause = () => {
      const g = gameRef.current;
      if (g.mode === 'playing') g.mode = 'paused';
      else if (g.mode === 'paused') g.mode = 'playing';
    };
    const action = () => {
      const g = gameRef.current;
      if (g.mode === 'start' || g.mode === 'over') start();
      else if (g.mode === 'paused') g.mode = 'playing';
    };

    const killShip = (g: Game) => {
      const s = g.ship;
      burst(g, s.x, s.y, 28, [AMBER, '#fff3c4', DARK_AMBER], 170);
      sfx('die');
      buzz([60, 40, 120]);
      g.shake = 0.5;
      g.lives--;
      s.dead = 1.5;
      if (g.lives <= 0) {
        g.mode = 'over';
        if (g.score > g.high) { g.high = g.score; saveHigh(g.high); }
      }
    };

    const splitRock = (g: Game, i: number) => {
      const r = g.rocks[i];
      g.rocks.splice(i, 1);
      g.score += POINTS[r.size];
      if (g.score >= g.nextLife) { g.lives = Math.min(g.lives + 1, 6); g.nextLife += 5000; sfx('life'); }
      burst(g, r.x, r.y, r.size * 7, [AMBER, DARK_AMBER, '#d6d3d1'], 40 + r.size * 40);
      sfx(r.size === 3 ? 'big' : 'boom');
      buzz(r.size === 3 ? 25 : 12);
      if (r.size > 1) {
        const ns = (r.size - 1) as Size;
        for (let k = 0; k < 2; k++) g.rocks.push(makeRock(r.x, r.y, ns, 1 + g.wave * 0.08));
      }
      if (r.size === 3) g.shake = Math.max(g.shake, 0.15);
    };

    const update = (dt: number) => {
      const g = gameRef.current;
      g.t += dt;
      // particles + shake continue in every mode except pause
      if (g.mode === 'paused') return;
      g.shake = Math.max(0, g.shake - dt);
      for (let i = g.parts.length - 1; i >= 0; i--) {
        const p = g.parts[i];
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.99; p.vy *= 0.99;
        if (p.life <= 0) g.parts.splice(i, 1);
      }
      for (const r of g.rocks) {
        r.x = wrap(r.x + r.vx * dt, W); r.y = wrap(r.y + r.vy * dt, H); r.a += r.va * dt;
      }
      if (g.mode !== 'playing') return;
      g.waveBanner = Math.max(0, g.waveBanner - dt);
      const s = g.ship;
      const k = keys.current;
      if (s.dead > 0) {
        s.dead -= dt;
        if (s.dead <= 0) {
          s.x = W / 2; s.y = H / 2; s.vx = s.vy = 0; s.a = -Math.PI / 2; s.invuln = 2.5;
        }
      } else {
        s.invuln = Math.max(0, s.invuln - dt);
        if (k.left) s.a -= 4.2 * dt;
        if (k.right) s.a += 4.2 * dt;
        if (k.thrust) {
          s.vx += Math.cos(s.a) * 260 * dt; s.vy += Math.sin(s.a) * 260 * dt;
          g.parts.push({ x: s.x - Math.cos(s.a) * 9, y: s.y - Math.sin(s.a) * 9, vx: -Math.cos(s.a) * 80 + rnd(-20, 20), vy: -Math.sin(s.a) * 80 + rnd(-20, 20), life: 0.3, max: 0.3, color: Math.random() < 0.5 ? AMBER : '#f97316', s: 2 });
          thrustTick -= dt;
          if (thrustTick <= 0) { sfx('thrust'); thrustTick = 0.12; }
        }
        const drag = Math.pow(0.6, dt);
        s.vx *= drag; s.vy *= drag;
        const sp = Math.hypot(s.vx, s.vy);
        if (sp > 330) { s.vx *= 330 / sp; s.vy *= 330 / sp; }
        s.x = wrap(s.x + s.vx * dt, W); s.y = wrap(s.y + s.vy * dt, H);
        g.cooldown -= dt;
        if (k.fire && g.cooldown <= 0 && g.bullets.length < 6) {
          g.cooldown = 0.2;
          g.bullets.push({ x: s.x + Math.cos(s.a) * 12, y: s.y + Math.sin(s.a) * 12, vx: s.vx + Math.cos(s.a) * 420, vy: s.vy + Math.sin(s.a) * 420, life: 1.1 });
          sfx('shoot');
          buzz(6);
        }
      }
      for (let i = g.bullets.length - 1; i >= 0; i--) {
        const b = g.bullets[i];
        b.life -= dt; b.x = wrap(b.x + b.vx * dt, W); b.y = wrap(b.y + b.vy * dt, H);
        if (b.life <= 0) { g.bullets.splice(i, 1); continue; }
        for (let j = g.rocks.length - 1; j >= 0; j--) {
          const r = g.rocks[j];
          if (Math.hypot(b.x - r.x, b.y - r.y) < r.r) { g.bullets.splice(i, 1); splitRock(g, j); break; }
        }
      }
      if (s.dead <= 0 && s.invuln <= 0) {
        for (const r of g.rocks) {
          if (Math.hypot(s.x - r.x, s.y - r.y) < r.r * 0.85 + 6) { killShip(g); break; }
        }
      }
      if (g.rocks.length === 0 && g.mode === 'playing') {
        g.wave++;
        spawnWave(g);
        g.ship.invuln = Math.max(g.ship.invuln, 1.5);
      }
    };

    const drawShip = (g: Game) => {
      const s = g.ship;
      if (s.dead > 0) return;
      if (s.invuln > 0 && Math.floor(g.t * 12) % 2 === 0) return;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.a);
      ctx.beginPath();
      ctx.moveTo(13, 0); ctx.lineTo(-9, -9); ctx.lineTo(-4, 0); ctx.lineTo(-9, 9); ctx.closePath();
      ctx.fillStyle = AMBER; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = DARK_AMBER; ctx.lineJoin = 'miter'; ctx.stroke();
      ctx.fillStyle = INK; ctx.fillRect(1, -2, 4, 4); // cockpit, like the sprite's eye
      if (keys.current.thrust && Math.floor(g.t * 30) % 2 === 0) {
        ctx.fillStyle = '#f97316';
        ctx.fillRect(-14, -2, 6, 4);
      }
      ctx.restore();
    };

    const drawRock = (r: Rock) => {
      ctx.beginPath();
      const n = r.shape.length;
      for (let i = 0; i < n; i++) {
        const a = r.a + (i / n) * TAU;
        const x = r.x + Math.cos(a) * r.r * r.shape[i];
        const y = r.y + Math.sin(a) * r.r * r.shape[i];
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = INK; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = r.size === 3 ? AMBER : r.size === 2 ? '#e8a915' : DARK_AMBER; ctx.lineJoin = 'miter';
      ctx.stroke();
    };

    const text = (t: string, x: number, y: number, size: number, color = AMBER, align: CanvasTextAlign = 'center') => {
      ctx.font = `${size}px ${FONT}`;
      ctx.textAlign = align; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000'; ctx.fillText(t, x + 2, y + 2);
      ctx.fillStyle = color; ctx.fillText(t, x, y);
    };

    const overlay = (g: Game) => {
      ctx.fillStyle = 'rgba(13,13,13,0.72)';
      ctx.fillRect(0, 0, W, H);
      const hint = coarseRef.current ? 'TAP TO START' : 'PRESS SPACE';
      if (g.mode === 'start') {
        text('ASTEROIDS', W / 2, H / 2 - 60, 30);
        text('PIXELFORGE ARCADE', W / 2, H / 2 - 22, 10, DARK_AMBER);
        if (Math.floor(g.t * 2) % 2 === 0) text(hint, W / 2, H / 2 + 30, 14, '#e2e8f0');
        text(`HIGH SCORE ${g.high}`, W / 2, H / 2 + 80, 10, '#94a3b8');
      } else if (g.mode === 'over') {
        text('GAME OVER', W / 2, H / 2 - 60, 30, '#ef4444');
        text(`SCORE ${g.score}`, W / 2, H / 2 - 12, 14);
        text(g.score > 0 && g.score >= g.high ? 'NEW HIGH SCORE!' : `HIGH SCORE ${g.high}`, W / 2, H / 2 + 20, 10, '#e2e8f0');
        if (Math.floor(g.t * 2) % 2 === 0) text(coarseRef.current ? 'TAP TO RETRY' : 'SPACE TO RETRY', W / 2, H / 2 + 70, 12, '#e2e8f0');
      } else if (g.mode === 'paused') {
        text('PAUSED', W / 2, H / 2 - 16, 30);
        text(coarseRef.current ? 'TAP TO RESUME' : 'P TO RESUME', W / 2, H / 2 + 30, 12, '#e2e8f0');
      }
    };

    const render = () => {
      const g = gameRef.current;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      let ox = 0, oy = 0;
      if (g.shake > 0 && !reduceMotion.matches) { const m = Math.min(g.shake, 0.4) * 14; ox = rnd(-m, m); oy = rnd(-m, m); }
      ctx.setTransform(scale, 0, 0, scale, ox * scale, oy * scale);
      ctx.imageSmoothingEnabled = false;
      // faint starfield grid
      ctx.fillStyle = 'rgba(251,191,36,0.07)';
      for (let i = 0; i < 40; i++) ctx.fillRect(((i * 97) % W) | 0, ((i * 61) % H) | 0, 2, 2);
      g.rocks.forEach(drawRock);
      ctx.fillStyle = '#fff3c4';
      g.bullets.forEach((b) => ctx.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 2, 4, 4));
      drawShip(g);
      for (const p of g.parts) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
      }
      ctx.globalAlpha = 1;
      // HUD
      text(String(g.score).padStart(6, '0'), 14, 18, 12, AMBER, 'left');
      text(`HI ${g.high}`, W / 2, 18, 9, '#94a3b8');
      text(`WAVE ${g.wave}`, W / 2, 36, 9, '#94a3b8');
      for (let i = 0; i < g.lives; i++) {
        ctx.save(); ctx.translate(22 + i * 20, 42); ctx.rotate(-Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -6); ctx.lineTo(-2, 0); ctx.lineTo(-6, 6); ctx.closePath();
        ctx.fillStyle = AMBER; ctx.fill(); ctx.restore();
      }
      if (g.mode === 'playing' && g.waveBanner > 0) text(`WAVE ${g.wave}`, W / 2, H / 2 - 100, 18, '#e2e8f0');
      if (g.mode !== 'playing') overlay(g);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      acc += dt;
      while (acc >= STEP) { update(STEP); acc -= STEP; }
      render();
    };
    last = performance.now();
    raf = requestAnimationFrame(frame);

    const setKey = (e: KeyboardEvent, down: boolean): boolean => {
      const k = keys.current;
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': k.left = down; return true;
        case 'ArrowRight': case 'KeyD': k.right = down; return true;
        case 'ArrowUp': case 'KeyW': k.thrust = down; return true;
        case 'Space': k.fire = down; return true;
        case 'ArrowDown': return true;
      }
      return false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (e.code === 'KeyP' && !e.repeat) togglePause();
        if (e.code === 'KeyP') e.preventDefault();
        return;
      }
      if (e.code === 'KeyM' && !e.repeat) { setMuted((m) => !m); return; }
      if (setKey(e, true)) {
        e.preventDefault();
        if (e.code === 'Space' && !e.repeat) {
          const m = gameRef.current.mode;
          if (m !== 'playing') action();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (setKey(e, false)) e.preventDefault(); };
    const releaseAll = () => { keys.current = { left: false, right: false, thrust: false, fire: false }; };
    const onBlur = () => {
      releaseAll();
      if (gameRef.current.mode === 'playing') gameRef.current.mode = 'paused';
    };
    const unlock = () => { ensureAudio(); };
    // iOS only unlocks audio from touchend/click gestures.
    wrapEl.addEventListener('touchend', unlock, { passive: true });
    wrapEl.addEventListener('pointerup', unlock, { passive: true });
    wrapEl.addEventListener('click', unlock, { passive: true });
    // Block page scroll / pull-to-refresh / rubber-banding while playing.
    const onTouchMove = (e: TouchEvent) => { if (gameRef.current.mode === 'playing' && e.cancelable) e.preventDefault(); };
    wrapEl.addEventListener('touchmove', onTouchMove, { passive: false });
    const noMenu = (e: Event) => e.preventDefault();
    wrapEl.addEventListener('contextmenu', noMenu);
    const onVis = () => { if (document.hidden) onBlur(); else { last = performance.now(); acc = 0; } };

    // Key handlers live on the focusable wrapper so Space/arrows only
    // scroll-lock while the game has focus.
    wrapEl.addEventListener('keydown', onKeyDown);
    wrapEl.addEventListener('keyup', onKeyUp);
    wrapEl.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    const onCanvasDown = () => { wrapEl.focus({ preventScroll: true }); action(); };
    canvas.addEventListener('pointerdown', onCanvasDown);
    if (autoFocus) wrapEl.focus({ preventScroll: true });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrapEl.removeEventListener('keydown', onKeyDown);
      wrapEl.removeEventListener('keyup', onKeyUp);
      wrapEl.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onCanvasDown);
      wrapEl.removeEventListener('touchend', unlock);
      wrapEl.removeEventListener('pointerup', unlock);
      wrapEl.removeEventListener('click', unlock);
      wrapEl.removeEventListener('touchmove', onTouchMove);
      wrapEl.removeEventListener('contextmenu', noMenu);
      try { void audioRef.current?.close(); } catch { /* ignore */ }
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, sfx, buzz, ensureAudio]);

  const hold = (key: 'left' | 'right' | 'thrust' | 'fire') => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      keys.current[key] = true;
      touchRef.current = true;
      ensureAudio();
      if (key === 'fire' && gameRef.current.mode !== 'playing' && gameRef.current.mode !== 'paused') {
        gameRef.current = newGame(gameRef.current.high, 'playing');
        sfx('start');
      } else if (gameRef.current.mode === 'paused') gameRef.current.mode = 'playing';
    },
    onPointerUp: () => { keys.current[key] = false; },
    onPointerCancel: () => { keys.current[key] = false; },
    onLostPointerCapture: () => { keys.current[key] = false; },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const btn = 'retro flex select-none items-center justify-center rounded-none border-2 border-amber-500/70 text-amber-400 active:bg-amber-500 active:text-[#14110a] text-xs h-16 min-w-16 px-4 [-webkit-touch-callout:none] [touch-action:none]';
  const ctlStyle: React.CSSProperties = { touchAction: 'none', WebkitTouchCallout: 'none', userSelect: 'none', WebkitUserSelect: 'none' };
  const left = (
    <div className="flex gap-2">
      <button type="button" aria-label="Rotate left" className={`${btn} ${portrait ? 'bg-[#14110a]' : 'bg-[#14110a]/50'}`} style={ctlStyle} {...hold('left')}>&#9664;</button>
      <button type="button" aria-label="Rotate right" className={`${btn} ${portrait ? 'bg-[#14110a]' : 'bg-[#14110a]/50'}`} style={ctlStyle} {...hold('right')}>&#9654;</button>
      <button type="button" aria-label="Thrust" className={`${btn} ${portrait ? 'bg-[#14110a]' : 'bg-[#14110a]/50'}`} style={ctlStyle} {...hold('thrust')}>&#9650;</button>
    </div>
  );
  const right = (
    <button type="button" aria-label="Fire" className={`${btn} h-20 min-w-20 border-red-500/70 text-red-400 ${portrait ? 'bg-[#14110a]' : 'bg-[#14110a]/50'}`} style={ctlStyle} {...hold('fire')}>FIRE</button>
  );

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      role="application"
      aria-label="Asteroids game. Arrow keys or WASD to move, space to fire, P to pause."
      className={`relative w-full select-none outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${className ?? ''}`}
      style={{ WebkitTapHighlightColor: 'transparent', WebkitTouchCallout: 'none', overscrollBehavior: 'none' }}
    >
      <div
        ref={boxRef}
        className="relative mx-auto border-4 border-amber-900/60 bg-[#0d0d0d]"
        style={{ width: '100%', maxWidth: 'max(240px, calc((100dvh - 7rem) * 4 / 3))' }}
      >
        <canvas ref={canvasRef} className="block touch-none" style={{ imageRendering: 'pixelated', width: '100%', touchAction: 'none' }} />
        <div className="absolute right-2 top-2 flex gap-2">
          <button
            type="button"
            aria-label={muted ? 'Unmute' : 'Mute'}
            aria-pressed={muted}
            onClick={() => { setMuted((m) => !m); wrapRef.current?.focus({ preventScroll: true }); }}
            className="retro min-h-8 border-2 border-amber-500/50 bg-[#14110a]/80 px-2 py-1 text-[10px] text-amber-400"
          >
            {muted ? 'SND OFF' : 'SND ON'}
          </button>
          <button
            type="button"
            aria-label="Pause"
            onClick={() => { const g = gameRef.current; if (g.mode === 'playing') g.mode = 'paused'; else if (g.mode === 'paused') g.mode = 'playing'; wrapRef.current?.focus({ preventScroll: true }); }}
            className="retro min-h-8 min-w-8 border-2 border-amber-500/50 bg-[#14110a]/80 px-2 py-1 text-[10px] text-amber-400"
          >
            II
          </button>
        </div>
        {coarse && !portrait && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-2"
            style={{ paddingLeft: 'max(0.5rem, env(safe-area-inset-left))', paddingRight: 'max(0.5rem, env(safe-area-inset-right))', paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
          >
            <div className="pointer-events-auto">{left}</div>
            <div className="pointer-events-auto">{right}</div>
          </div>
        )}
      </div>
      {coarse && portrait && (
        <div
          className="mt-3 flex items-end justify-between gap-3"
          style={{ touchAction: 'none', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
        >
          {left}
          {right}
        </div>
      )}
    </div>
  );
}
