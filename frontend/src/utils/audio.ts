// FILE: frontend/src/utils/audio.ts

/**
 * Plays a short, futuristic cyberpunk "bip" notification sound using the Web Audio API.
 * Requires no external audio files, runs locally, and handles browser audio autoplay gracefully.
 */
export function playNotificationSound(): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';

    // Futuristic electronic pitch chirp (880Hz -> 1320Hz)
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);

    // Fast attack and exponential decay over 0.12 seconds
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);

    // Close AudioContext to release hardware resources after playback completes
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 250);
  } catch {
    // Autoplay policy or audio device busy; fail silently
  }
}
