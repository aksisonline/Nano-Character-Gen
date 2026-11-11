// Prints the app's real prompts so the research harness uses exactly the same text.
// Usage: bun scripts/research/prompt.ts sprite "<description>" [magenta|green]
//        bun scripts/research/prompt.ts key "<description>"
//        bun scripts/research/prompt.ts anim '<json {name,prompt,frameCount,columns,rows}>' [magenta|green]
import { buildSpritePrompt, buildAnimationPrompt, chooseKeyColor } from '../../shared/prompts';
const [kind, arg, key] = process.argv.slice(2);
if (kind === 'key') console.log(chooseKeyColor(arg));
else if (kind === 'anim') console.log(buildAnimationPrompt(JSON.parse(arg), (key as 'magenta' | 'green') || 'magenta'));
else console.log(buildSpritePrompt(arg, (key as 'magenta' | 'green') || chooseKeyColor(arg)));
