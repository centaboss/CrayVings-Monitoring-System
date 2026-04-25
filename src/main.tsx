import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initializeCustomSounds, ensureAudioContextReady } from "./utils/playAlertSound";

initializeCustomSounds().catch(() => {});

const initAudio = async () => {
  try {
    await ensureAudioContextReady();
  } catch {
    // Will retry on interaction
  }
};

initAudio();

document.addEventListener("click", () => initAudio(), { once: true });
document.addEventListener("keydown", () => initAudio(), { once: true });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);