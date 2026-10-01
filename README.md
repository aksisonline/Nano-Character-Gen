<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# PixelForge Sprite Studio

Create a pixel-art character, refine its base sprite, then define and generate
animation clips individually. Preview each clip and export one or all of them
as transparent GIFs.

View your app in AI Studio: https://ai.studio/apps/drive/1udfLhn1BGyXFggS_M_yuILvXX-NeaY8K

## Run locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Add `GEMINI_API_KEY` to `.env.local` to enable AI sprite and animation generation.
   Preset characters, editing, and GIF export can be used without an API key.
3. Start the dev server: `npm run dev`

The workflow is **Create → Edit → Animate**. Animation clips have their own
name, motion prompt, frame count, playback FPS, and loop setting.
