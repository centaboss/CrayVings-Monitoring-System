const TONE_CONFIG = {
  warning: { frequency: 440, duration: 0.3, type: "sine" as OscillatorType },
  critical: { frequency: 880, duration: 0.15, type: "square" as OscillatorType, repeatDelay: 200 },
  low: { frequency: 300, duration: 0.4, type: "sine" as OscillatorType },
  high: { frequency: 600, duration: 0.4, type: "square" as OscillatorType },
} as const;

const DEFAULT_VOLUME = 0.8;
const MIN_FREQ = 1;
const MAX_FREQ = 20000;
const MAX_DURATION = 10;

let audioContext: AudioContext | null = null;
let volume: number = DEFAULT_VOLUME;

const audioBuffers: Record<string, AudioBuffer> = {};

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
      // Browser blocked - will work after user interaction
    }
  }
  return audioContext;
}

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

function isSoundEnabled(): boolean {
  try {
    const enabled = localStorage.getItem("alertSoundEnabled");
    return enabled === null || enabled === "true";
  } catch {
    return true;
  }
}

export function getIsSoundEnabled(): boolean {
  return isSoundEnabled();
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem("alertSoundEnabled", enabled ? "true" : "false");
  } catch {
    // localStorage unavailable
  }
}

export function getVolume(): number {
  return volume;
}

export function setVolume(newVolume: number): void {
  if (typeof newVolume !== "number" || !Number.isFinite(newVolume)) {
    volume = DEFAULT_VOLUME;
    return;
  }
  volume = Math.max(0, Math.min(1, newVolume));
}

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
    
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);

    await new Promise(resolve => setTimeout(resolve, duration * 1000 + 50));
  } catch {
    // Silent fail - audio may not work
  } finally {
    try { oscillator?.disconnect(); } catch {}
    try { gainNode?.disconnect(); } catch {}
  }
}

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
    // Silent fail
  } finally {
    try { source?.disconnect(); } catch {}
    try { gainNode?.disconnect(); } catch {}
  }
}

async function decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = await ensureAudioContext();
  return ctx.decodeAudioData(arrayBuffer);
}

export async function setCustomSound(key: string, url: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await decodeAudioData(arrayBuffer);
  audioBuffers[key] = audioBuffer;
}

export async function setCustomSoundFromBlob(key: string, blob: Blob): Promise<void> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await decodeAudioData(arrayBuffer);
  audioBuffers[key] = audioBuffer;
}

export function clearCustomSound(key: string): void {
  delete audioBuffers[key];
}

export function hasCustomSound(key: string): boolean {
  return key in audioBuffers;
}

const SOUND_URLS = {
  warning: "/sounds/warning.mp3",
  critical: "/sounds/critical.mp3",
  low: "/sounds/low.mp3",
  high: "/sounds/high.mp3",
} as const;

export async function initializeCustomSounds(): Promise<void> {
  const loadPromises = Object.entries(SOUND_URLS).map(async ([key, url]) => {
    try {
      await setCustomSound(key, url);
    } catch {
      // Use synth tone instead
    }
  });
  await Promise.allSettled(loadPromises);
}

export async function ensureAudioContextReady(): Promise<void> {
  await ensureAudioContext();
}

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

function getToneConfigForKey(key: string): { frequency: number; duration: number; type: OscillatorType } {
  switch (key) {
    case "warning": return TONE_CONFIG.warning;
    case "critical": return { frequency: TONE_CONFIG.critical.frequency, duration: TONE_CONFIG.critical.duration, type: TONE_CONFIG.critical.type };
    case "low": return TONE_CONFIG.low;
    case "high": return TONE_CONFIG.high;
    default: return { frequency: 440, duration: 0.3, type: "sine" };
  }
}

export async function playWarningSound(): Promise<void> {
  if (!isSoundEnabled()) return;
  const sound = await getActiveSound("warning");
  await sound.play();
}

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

export async function playLowAlertSound(): Promise<void> {
  if (!isSoundEnabled()) return;
  const sound = await getActiveSound("low");
  await sound.play();
}

export async function playHighAlertSound(): Promise<void> {
  if (!isSoundEnabled()) return;
  const sound = await getActiveSound("high");
  await sound.play();
}