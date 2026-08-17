import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Meet Dual-Stream Transcription",
  version: "0.1.0",
  description: "Capture mic and Google Meet tab audio separately, transcribe live, and summarize.",
  permissions: [
    "activeTab",
    "tabCapture",
    "offscreen",
    "storage",
    "scripting",
    "sidePanel",
  ],
  host_permissions: ["https://meet.google.com/*", "http://localhost:8000/*"],
  content_scripts: [
    {
      matches: ["https://meet.google.com/*"],
      js: ["src/content/meet-observer.ts"],
      run_at: "document_idle",
    },
  ],
  action: {
    default_popup: "src/popup/index.html",
    default_title: "Meet Transcription",
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  commands: {
    "toggle-mic-mute": {
      suggested_key: {
        default: "Ctrl+Shift+M",
        mac: "Command+Shift+M",
      },
      description: "Toggle extension microphone mute",
    },
  },
  web_accessible_resources: [
    {
      resources: ["assets/*"],
      matches: ["<all_urls>"],
    },
  ],
});
