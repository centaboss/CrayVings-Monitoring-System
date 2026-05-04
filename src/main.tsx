// =============================================================================
// FILE: src/main.tsx
// =============================================================================
// PURPOSE: React application entry point.
//
// This is the first file executed when the app loads. It:
//   1. Initializes the Web Audio API for alert sounds
//   2. Pre-loads sound files from the /sounds/ directory
//   3. Attempts to unlock audio context on user interaction (browser requirement)
//   4. Renders the root App component inside React.StrictMode
//
// BROWSER AUDIO POLICY NOTE:
//   Modern browsers block autoplay of audio until the user interacts with the page.
//   This file attempts to initialize the AudioContext early, and retries on the
//   first click or keydown event to ensure sounds work when alerts fire.
// =============================================================================

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initializeCustomSounds, ensureAudioContextReady } from "./utils/playAlertSound";

// ========================
// AUDIO INITIALIZATION
// ========================
// Pre-loads alert sound files (MP3) into the Web Audio API.
// If loading fails, the system falls back to synthesized tones.
// Errors are silently caught to prevent blocking the app startup.
initializeCustomSounds().catch(() => {});

/**
 * Attempts to resume the AudioContext, which browsers may suspend.
 * This must be called after user interaction to work in most browsers.
 */
const initAudio = async () => {
  try {
    await ensureAudioContextReady();
  } catch {
    // Will retry on interaction - browser may block audio until user clicks
  }
};

// Attempt immediate audio initialization (may be blocked by browser)
initAudio();

// Retry audio initialization on first user interaction (click or keypress)
// This ensures the AudioContext is unlocked before any alert sounds play
document.addEventListener("click", () => initAudio(), { once: true });
document.addEventListener("keydown", () => initAudio(), { once: true });

// ========================
// REACT RENDERING
// ========================
// Creates the root React render tree and mounts the App component.
// React.StrictMode enables development-time checks (double-renders, deprecated APIs).
// The "root" element is defined in index.html.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
