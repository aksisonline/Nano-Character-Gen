/**
 * Placeholder for UI/game sound effects.
 * Replace with actual audio playback (e.g. Howler, Web Audio) when assets are ready.
 */

export type GameSoundId = 'click' | 'hover' | 'success' | 'error' | 'open' | 'close';

export function useGameSound(): (id: GameSoundId) => void {
  return (_id: GameSoundId) => {
    // TODO: play sound when assets and audio context are ready
  };
}
