# Pixel-art cleanup research (2026-11-10)

Goal: reuse existing open-source code and skills, legally, to fix stray pixels, palette bloat and
eye/eyewear quality in the 32x48 sprite pipeline (`services/spritePipeline.ts`).

Sources: a Haiku research subagent (license data from the GitHub API and LICENSE pages) plus my own
check of the unfake.js source and the crates.io API. Star counts and push dates are the subagent's
numbers and were not re-verified.

## 1. Libraries and algorithms

| Tag | Project | License | Use for |
|---|---|---|---|
| Safe (port, don't ship binary) | [unfake.js](https://github.com/jenissimo/unfake.js) | MIT, **but its WASM links GPL-3.0 `imagequant`** (see section 2) | Mode/median downscale, morphological open/close, grid snap |
| Safe | [PixelRefiner](https://github.com/HappyOnigiri/PixelRefiner) | MIT | TypeScript. Anti-alias removal, grid detection, palette mapping, background removal |
| Safe (port) | [proper-pixel-art](https://github.com/KennethJAllen/proper-pixel-art) | MIT | Python. Per-cell representative color, agglomerative merge of near-duplicate colors |
| Safe | [spritefusion-pixel-snapper](https://github.com/Hugo-Dz/spritefusion-pixel-snapper) | MIT | Rust/WASM grid snap + quantize. Internals undocumented, test first |
| Safe | [pixelit](https://github.com/giventofly/pixelit) | MIT | JS converter. Algorithm not yet read |
| Safe | [RgbQuant.js](https://github.com/leeoniya/RgbQuant.js) | MIT | Small browser quantizer. Last push 2024 |
| Safe | [pxl-cleanup](https://github.com/alvincrespo/pxl-cleanup) | MIT | Python. Flood-fill background removal, k-means that keeps small accent colors |
| Ask first | [perfectPixel](https://github.com/theamusing/perfectPixel) | Unresolved (README badge says MIT, no LICENSE file, API reports none) | FFT grid detection. Ask the author before copying |
| Avoid | [pixelart-cleaner](https://github.com/Danamir/pixelart-cleaner) | GPL-3.0 | Read for ideas only, never copy code |
| Avoid | [image-quantization](https://github.com/ibezkrovnyi/image-quantization) | No license reported | Upstream licenses unclear |

## 2. unfake.js and libimagequant: verified

- unfake.js repo `LICENSE` and `Cargo.toml` workspace license: MIT.
- `crates/unfake-core/Cargo.toml` depends on `imagequant = "4.4"`.
- crates.io reports `imagequant` 4.4.1 as **GPL-3.0-or-later**.
- It is used in `crates/unfake-core/src/quantize.rs` and in `downscale.rs` (the `qvote` mode, `quantize_rgba`).
- The shipped WASM (`browser-tool/vendor/unfake-core/unfake_wasm.js`) is therefore built with GPL code.

Conclusion: **do not ship the unfake.js WASM binary.** Re-implement the MIT-licensed algorithms in TypeScript,
reading `morphology.rs`, `downscale.rs` (mode, median, dominant), `content_adaptive.rs`, `snap.rs` and
`color_count.rs`, and skip `qvote` and `quantize.rs`. Keep the MIT notice for anything ported.

## 3. Ready-made Claude skills and MCP servers

| Project | License | Notes |
|---|---|---|
| [ianlintner/ai-pixel-art-image-generation](https://github.com/ianlintner/ai-pixel-art-image-generation) | MIT | Generation plus `pixelize.py` (downscale + quantize) and a QA report script. Reference for our QA metrics |
| [thejacedev/claude-code-skills pixel-art-gen](https://github.com/thejacedev/claude-code-skills/tree/main/plugins/pixel-art-gen) | MIT | Claude writes the art, Pillow renders it. Generation, not cleanup |
| [patch-gg/pixelfx](https://github.com/patch-gg/pixelfx) | MIT (font excluded) | Visual effects. Not relevant to cleanup |
| mcpmarket "Pixel Art Snap" | Not verified | No repo or license found. Skip |

No skill, MCP server or library found handles eyes, glasses or sunglasses. That stays custom work.

## 4. Mapping to our problems

- **Stray pixels:** port morphological open/close and a majority downscale. Isolated-pixel rule: recolor any pixel
  that differs from all 4 neighbors to the neighbor majority, except inside protected eye regions.
- **Palette merge:** port proper-pixel-art's agglomerative merge, with eye colors exempt.
- **Downscale:** mode vote per block instead of one nearest sample, finer blocks in the eye bounding box.
- **Eyes and eyewear:** custom classification and repair (see the plan in the conversation).

## 5. Compliance checklist

- Add `THIRD_PARTY_LICENSES.md` with the MIT notice for every project whose code or algorithm we port.
- Never add `imagequant`, `pixelart-cleaner` or other GPL code to the dependency tree.
- Run a license check on any npm dependency we add.

## 6. Open items

- Benchmark on real raw generations: none are in the repo, so we need 10-15 saved 256x384 outputs.
- Prompt techniques for Gemini: see section 7.
- Sprite animation libraries: see section 8.

## 7. Prompting Gemini for clean pixel art

Source: Haiku research subagent. Google's docs say nothing about pixel art, so these are practical tips from
vendor blogs and community posts, not tested results. Items 5 and 7 rest on search snippets the agent could not
fully fetch.

Main finding: prompts don't enforce pixel constraints. Rangy reports that "no anti-aliasing", "exactly 32 by 32"
and "strict twelve-colour palette" changed the look but were not obeyed. The reliable fix is post-processing, which
is what the cleanup phases do.

1. **Downscale and quantize ourselves.** Nearest-neighbour or mode downscale first, then quantize with dithering
   off. Quantizing first reintroduces blended edges. ([Rangy](https://rangy.ai/blog/ai-pixel-art), [SpriteCook](https://www.spritecook.ai/blog/nanobanana-pixel-art-for-games))
2. **Generate at the largest size, then snap the grid.** Raw output has uneven pixel widths (e.g. 6 px and 7 px), and more source pixels help grid detection. (SpriteCook)
3. **Style phrase:** `pixel art chibi character, full body, front view, game sprite, clean pixel edges, limited color palette, flat shading, black outline`. ([Summer Engine](https://www.summerengine.com/ai-pixel-art-generator-for-games.md))
4. **State the view.** Models default to 3/4 angles unless told `front view` or `side view`. (SpriteCook)
5. **Background wording (unverified):** `flat solid pure #FF00FF magenta background, no gradient, no shadow, no grid lines, no watermark, character fills about 70% of the canvas`.
6. **Describe what should be there, not negatives.** Google's guidance prefers positives. Use `hard pixel edges, solid color fills` instead of `no anti-aliasing`. ([Google blog](https://developers.googleblog.com/en/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/))
7. **Pick a key color the subject doesn't use, and key out with a corner-seeded flood fill** plus a tolerance pass, so interior key-colored pixels survive. Magenta is a poor key for pink or magenta characters.
8. **Design for silhouette.** Faces, hands, thin lines and text degrade at 32 px and below. Keep glasses and sunglasses as simple solid blocks. (Rangy)
9. **Consistency:** approve one base sprite, then use it as a reference image for other poses. Reuse the same style and palette block verbatim. Avoid full sheets in one shot.
10. **Lock the palette across frames.** Quantize the whole sheet together, or use one palette. (Rangy)

Gemini specifics:
- Image models named in the docs: `gemini-2.5-flash-image`, `gemini-3.1-flash-image`, `gemini-3-pro-image`. Size strings need uppercase `K` (`1K`, `2K`, `4K`); `1k` is rejected. ([AI Studio docs](https://aistudio.google.com/docs/image-generation))
- Every output carries a SynthID watermark. Check it doesn't disturb the magenta background.
- Up to 14 reference images. The Lite model is not optimized for multi-reference or multi-turn editing.
- Editing works best with "change only the..." and "keep everything else exactly the same". Starting a new conversation with a full description helps once quality drifts.
- No source covers the "8x or 16x upscaled on a visible grid" idea, or glasses and sunglasses at 32 px.

Takeaways for our prompt (`shared/prompts.ts`):
- Add `front view`, `game sprite`, `clean pixel edges` and `hard pixel edges, solid color fills`. Drop the rigid 3x3 eye rule (see the plan).
- Phrase the background as `flat solid pure #FF00FF`, with no gradient or shadow, and consider an alternate key color for characters with pink or magenta.
- Keep eyewear as simple solid shapes.
- Our current 8x downscale needs grid snapping, since the source pixel widths vary.

Licensing: no license was found on the Summer Engine or SpriteCook pages, so treat their wording as all rights
reserved. Reuse ideas, not text. Google's Gemini API terms for commercial use of outputs were not checked.

## 8. Sprite animation: slicing, consistency, export

Source: Haiku research subagent; licenses checked via the GitHub API or LICENSE files unless marked. Last-push dates
and star counts are the agent's numbers.

Main finding: no mature, license-clean library solves frame registration or temporal consistency for pixel sprites.
That part is small and generic enough to write ourselves. Libraries help with export, playback, atlases and QA diffs.

### Libraries

| Tag | Project | License | Use |
|---|---|---|---|
| Safe (already used) | [gifenc](https://github.com/mattdesl/gifenc) | MIT | GIF export. Stable, last push 2024. Prefer over gif.js (stale) |
| Safe | [PixiJS](https://github.com/pixijs/pixijs) | MIT | AnimatedSprite playback of spritesheets |
| Safe | [UPNG.js](https://github.com/photopea/UPNG.js) | MIT | APNG/PNG export. Stale since 2023 |
| Safe | [pixelmatch](https://github.com/mapbox/pixelmatch) | ISC | Frame-to-frame diff for drift and flicker QA |
| Safe | [free-tex-packer-core](https://github.com/odrick/free-tex-packer-core) | MIT | Atlas packing with JSON |
| Safe | [ase-parser](https://github.com/TheCyberRonin/ase-parser) | MIT | Import .ase/.aseprite files |
| Safe, only if needed | [Phaser](https://github.com/phaserjs/phaser) | MIT | Full game framework, heavy |
| Reference only | [Piskel](https://github.com/piskelapp/piskel) | Apache-2.0 | Editor and frame UI ideas (onion skin unverified) |
| Reference only | [Pixelorama](https://github.com/Orama-Interactive/Pixelorama) | MIT | Godot-based pixel editor |
| Dev tool | [pixel-plugin](https://github.com/willibrandon/pixel-plugin) | MIT | Aseprite MCP server. Drives Aseprite, which has its own EULA |
| Ask first | [mediabunny](https://github.com/Vanilagy/mediabunny) | MPL-2.0 | File-level copyleft. Not needed for GIF |
| Ask first | [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) | MIT wrapper | The bundled FFmpeg core can be LGPL/GPL depending on build |
| Avoid | Aseprite source | Proprietary EULA, no redistribution | Use the file format via ase-parser instead |
| Avoid | [sprite-forge](https://github.com/gididaf/sprite-forge), [Piksy](https://github.com/adia-dev/piksy), [CutSprite](https://github.com/tripstych/cutsprite) | No license | Ideas only |
| Avoid / unchecked | LibreSprite (GPL per search results, not fetched), pixipix (license unverified) | | |

Not license-checked: the directory-listed "sprite-animator" skills (openskillindex, claude-plugins.dev), and Lospec
palettes (licensing varies per palette).

### Recommended frame-consistency pipeline

1. **Slice:** find cell boundaries from the grid or the gutters, crop each cell, remove the key color.
2. **Register at high resolution:** alpha bounding box per frame, lowest body row as the foot line, silhouette
   centroid as the horizontal anchor, scale normalized to the reference height. Integer shifts only, then downscale
   to 32x48.
3. **Palette lock:** remap every frame to the character's fixed palette by nearest color in OKLab. No dithering, no
   per-frame palette.
4. **Temporal cleanup:** over the circular loop, a per-pixel majority vote across a 3-frame window. Replace a pixel
   that differs from two agreeing neighbors. Drop components under 2 px that aren't in the reference silhouette.
   Eye pixels stay protected, as in the stray-pixel plan.
5. **Identity gate:** silhouette IoU against frame 0. Flag frames under a threshold for regeneration.
6. **Export:** GIF through gifenc with one global palette and a fixed delay, APNG through UPNG.js, atlas through
   free-tex-packer-core or our own JSON. Run pixelmatch on consecutive frames to confirm drift and flicker are gone.

### Prompting for consistent multi-frame sheets

All guides below are vendor or blog advice, not verified: [Rosebud](https://rosebud.ai/blog/how-to-create-a-sprite-sheet-with-ai-using-google-gemini-and-nano-banana-easy-guide),
[ComfyUI workflow](https://comfy.org/hub/workflows/single-image-to-animated-sprite-sheet-5cef286d4c51/),
[DEV post](https://dev.to/kenjidev9662/practical-workflow-for-ai-pixel-art-gemini-2d-animation-experiment-21le).
The agent did not fetch Google's [consistent-imagery codelab](https://codelabs.developers.google.com/gemini-consistent-imagery-notebook).

Common advice: one anchor reference image, a fixed grid with explicit reading order, a fixed frame count, and the
palette stated in the prompt. The agent's own suggestion, unsourced and worth testing: generate each frame in a
separate call with the same anchor attached, instead of one sheet, since that may drift less.
