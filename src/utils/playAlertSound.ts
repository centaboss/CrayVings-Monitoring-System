// =============================================================================
// FILE: src/utils/playAlertSound.ts
// =============================================================================
// PURPOSE: Web Audio API utility for playing alert sounds.
//
// This file provides a complete sound system for the monitoring dashboard:
//   1. Pre-loads MP3 sound files from /sounds/ directory
//   2. Falls back to synthesized tones if MP3 files fail to load
//   3. Supports volume control and mute toggle (persisted in localStorage)
//   4. Handles browser autoplay restrictions (requires user interaction)
//
// SOUND TYPES:
//   - "warning":   440Hz sine wave or warning.mp3
//   - "critical":  880Hz square wave (plays twice) or critical.mp3
//   - "low":       300Hz sine wave or low.mp3
//   - "high":      600Hz square wave or high.mp3
//
// AUDIO CONTEXT LIFECYCLE:
//   - Created on first call to ensureAudioContext()
//   - Resumed on user interaction (click/keydown) to bypass browser autoplay blocks
//   - Shared singleton instance for all sound playback
//
// USAGE:
//   import { playWarningSound, playCriticalSound } from "./playAlertSound";
//   await playWarningSound();  // Plays warning alert sound
// =============================================================================

// ========================
// TONE CONFIGURATION
// ========================
// Default synthesized tone parameters for each alert type.
// Used as fallback when MP3 files are not available.
const TONE_CONFIG = {
  warning: { frequency: 440, duration: 0.3, type: "sine" as OscillatorType },
  critical: { frequency: 880, duration: 0.15, type: "square" as OscillatorType, repeatDelay: 200 },
  low: { frequency: 300, duration: 0.4, type: "sine" as OscillatorType },
  high: { frequency: 600, duration: 0.4, type: "square" as OscillatorType },
} as const;

// ========================
// AUDIO PARAMETERS
// ========================
const DEFAULT_VOLUME = 0.8;    // Default volume level (0.0 to 1.0)
const MIN_FREQ = 1;            // Minimum valid frequency (Hz)
const MAX_FREQ = 20000;        // Maximum valid frequency (Hz)
const MAX_DURATION = 10;       // Maximum valid duration (seconds)

// ========================
// SHARED STATE
// ========================
// Singleton AudioContext instance and volume setting.
let audioContext: AudioContext | null = null;
let volume: number = DEFAULT_VOLUME;

// Pre-loaded audio buffers indexed by sound key (e.g., "warning", "critical")
const audioBuffers: Record<string, AudioBuffer> = {};

// ========================
// AUDIO CONTEXT MANAGEMENT
// ========================

/**
 * Creates or resumes the Web Audio API AudioContext.
 * Browsers suspend AudioContext until user interaction, so this
 * attempts to resume it. Failures are silently caught.
 */
async function ensureAudioContext(): Promise<AudioContext> {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      throw new Error("Web Audio API not supported");
    }
    audioContext = new AudioCtx();
  }
  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch {
      // Browser blocked audio - will work after user interaction
    }
  }
  return audioContext;
}

/**
 * Validates tone parameters to prevent audio errors.
 * Ensures frequency, duration, and waveform type are within valid ranges.
 */
function validateParams(frequency: number, duration: number, type: OscillatorType): void {
  if (frequency < MIN_FREQ || frequency > MAX_FREQ) {
    throw new Error(`Invalid frequency`);
  }
  if (duration <= 0 || duration > MAX_DURATION) {
    throw new Error(`Invalid duration`);
  }
  const validTypes: OscillatorType[] = ["sine", "square", "sawtooth", "triangle"];
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid type`);
  }
}

// ========================
// SOUND ENABLE/DISABLE (localStorage)
// ========================

/** Checks if sound playback is enabled (defaults to true if not set). */
function isSoundEnabled(): boolean {
  try {
    const enabled = localStorage.getItem("alertSoundEnabled");
    return enabled === null || enabled === "true";
  } catch {
    return true;
  }
}

/** Public getter for sound enabled state. */
export function getIsSoundEnabled(): boolean {
  return isSoundEnabled();
}

/** Enables or disables sound playback. Persists to localStorage. */
export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem("alertSoundEnabled", enabled ? "true" : "false");
  } catch {
    // localStorage unavailable (e.g., private browsing)
  }
}

// ========================
// VOLUME CONTROL
// ========================

/** Gets the current volume level. */
export function getVolume(): number {
  return volume;
}

/**
 * Sets the volume level (clamped to 0-1 range).
 * Invalid values are reset to the default.
 */
export function setVolume(newVolume: number): void {
  if (typeof newVolume !== "number" || !Number.isFinite(newVolume)) {
    volume = DEFAULT_VOLUME;
    return;
  }
  volume = Math.max(0, Math.min(1, newVolume));
}

// ========================
// SYNTHESIZED TONE PLAYBACK
// ========================

/**
 * Plays a synthesized tone using the Web Audio API.
 * Creates an oscillator and gain node, applies exponential fade-out,
 * and cleans up resources after playback.
 */
async function playTone(frequency: number, duration: number, type: OscillatorType = "sine"): Promise<void> {
  validateParams(frequency, duration, type);

  const ctx = await ensureAudioContext();
  let oscillator: OscillatorNode | null = null;
  let gainNode: GainNode | null = null;
  
  try {
    oscillator = ctx.createOscillator();
    gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;
    
    // Set volume and apply exponential fade-out for smooth ending
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);

    await new Promise(resolve => setTimeout(resolve, duration * 1000 + 50));
  } catch {
    // Audio error - fail silently, playback continues
  } finally {
    if (oscillator) { try { oscillator.disconnect(); } catch { /* ignore */ } }
    if (gainNode) { try { gainNode.disconnect(); } catch { /* ignore */ } }
  }
}

// ========================
// CUSTOM SOUND (MP3) PLAYBACK
// ========================

/**
 * Plays a pre-loaded audio buffer (MP3 file).
 * Uses AudioBufferSourceNode for high-quality playback.
 */
async function playCustomSound(audioBuffer: AudioBuffer): Promise<void> {
  const ctx = await ensureAudioContext();
  let source: AudioBufferSourceNode | null = null;
  let gainNode: GainNode | null = null;
  
  try {
    source = ctx.createBufferSource();
    gainNode = ctx.createGain();
  
    source.buffer = audioBuffer;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    gainNode.gain.value = volume;

    source.start(0);
    await new Promise(resolve => { 
      if (source) { source.onended = resolve; }
    });
  } catch {
    // Audio error - fail silently
  } finally {
    if (source) { try { source.disconnect(); } catch { /* ignore */ } }
    if (gainNode) { try { gainNode.disconnect(); } catch { /* ignore */ } }
  }
}

/** Decodes raw audio data into an AudioBuffer using the AudioContext. */
async function decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = await ensureAudioContext();
  return ctx.decodeAudioData(arrayBuffer);
}

// ========================
// SOUND LOADING FUNCTIONS
// ========================

/** Fetches and decodes an audio file from a URL, storing it by key. */
export async function setCustomSound(key: string, url: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await decodeAudioData(arrayBuffer);
  audioBuffers[key] = audioBuffer;
}

/** Decodes and stores an audio file from a Blob object. */
export async function setCustomSoundFromBlob(key: string, blob: Blob): Promise<void> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await decodeAudioData(arrayBuffer);
  audioBuffers[key] = audioBuffer;
}

/** Removes a custom sound by key. */
export function clearCustomSound(key: string): void {
  delete audioBuffers[key];
}

/** Checks if a custom sound is loaded for the given key. */
export function hasCustomSound(key: string): boolean {
  return key in audioBuffers;
}

// ========================
// DEFAULT SOUND FILE URLS
// ========================
// Paths to MP3 files in the public/sounds/ directory.
const SOUND_URLS = {
  warning: "/sounds/warning.mp3",
  critical: "/sounds/critical.mp3",
  low: "/sounds/low.mp3",
  high: "/sounds/high.mp3",
} as const;

/**
 * Pre-loads all default sound files on app startup.
 * Uses Promise.allSettled so one failure doesn't block others.
 * Falls back to synthesized tones for any failed loads.
 */
export async function initializeCustomSounds(): Promise<void> {
  const loadPromises = Object.entries(SOUND_URLS).map(async ([key, url]) => {
    try {
      await setCustomSound(key, url);
    } catch {
      // Use synth tone instead if file fails to load
    }
  });
  await Promise.allSettled(loadPromises);
}

/** Ensures the AudioContext is ready for playback. Called from main.tsx. */
export async function ensureAudioContextReady(): Promise<void> {
  await ensureAudioContext();
}

/**
 * Determines whether to use a custom sound (MP3) or synthesized tone.
 * Returns an object with the sound type and a play function.
 */
async function getActiveSound(key: string): Promise<{ type: "custom" | "synth"; play: () => Promise<void> }> {
  if (audioBuffers[key]) {
    return {
      type: "custom",
      play: () => playCustomSound(audioBuffers[key]),
    };
  }

  const toneConfig = getToneConfigForKey(key);
  return {
    type: "synth",
    play: () => playTone(toneConfig.frequency, toneConfig.duration, toneConfig.type),
  };
}

/**
 * Returns the synthesized tone configuration for a given sound key.
 * Falls back to a default 440Hz sine wave for unknown keys.
 */
function getToneConfigForKey(key: string): { frequency: number; duration: number; type: OscillatorType } {
  switch (key) {
    case "warning": return TONE_CONFIG.warning;
    case "critical": return { frequency: TONE_CONFIG.critical.frequency, duration: TONE_CONFIG.critical.duration, type: TONE_CONFIG.critical.type };
    case "low": return TONE_CONFIG.low;
    case "high": return TONE_CONFIG.high;
    default: return { frequency: 440, duration: 0.3, type: "sine" };
  }
}

// ========================
// PUBLIC SOUND PLAYBACK FUNCTIONS
// ========================
// These are the main entry points used by components to play alert sounds.

/** Plays the warning alert sound (or low threshold sound). */
export async function playWarningSound(): Promise<void> {
  if (!isSoundEnabled()) return;
  const sound = await getActiveSound("warning");
  await sound.play();
}

/**
 * Plays the critical alert sound.
 * For synthesized tones, plays twice with a short delay for urgency.
 */
export async function playCriticalSound(): Promise<void> {
  if (!isSoundEnabled()) return;
  const sound = await getActiveSound("critical");
  await sound.play();
  if (sound.type === "synth") {
    const { repeatDelay } = TONE_CONFIG.critical;
    await new Promise(resolve => setTimeout(resolve, repeatDelay));
    await sound.play();
  }
}

/** Plays the low threshold alert sound. */
export async function playLowAlertSound(): Promise<void> {
  if (!isSoundEnabled()) return;
  const sound = await getActiveSound("low");
  await sound.play();
}

/** Plays the high threshold alert sound. */
export async function playHighAlertSound(): Promise<void> {
  if (!isSoundEnabled()) return;
  const sound = await getActiveSound("high");
  await sound.play();
}
