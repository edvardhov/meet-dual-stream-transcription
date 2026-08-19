export type DemoVideo =
  | { kind: "file"; src: string; poster?: string }
  | { kind: "youtube"; id: string };

/** Set this and the placeholder is replaced by a real player. */
export const demoVideo: DemoVideo | null = null;

export interface StepLink {
  label: string;
  href: string;
}

export interface Step {
  id: string;
  number: string;
  title: string;
  body: string;
  commandsLabel?: string;
  commands?: string[];
  bullets?: string[];
  links?: StepLink[];
  aside?: string;
}

export const REPO_URL =
  "https://github.com/edvardhov/meet-dual-stream-transcription";

export const steps: Step[] = [
  {
    id: "step-01",
    number: "01",
    title: "Clone the repository",
    body: "Get the project on your machine. You'll need Git and a terminal.",
    commands: [
      "git clone https://github.com/edvardhov/meet-dual-stream-transcription.git",
      "cd meet-dual-stream-transcription",
    ],
  },
  {
    id: "step-02",
    number: "02",
    title: "Add your API keys",
    body: "Copy the example env file and paste your Deepgram and Gemini keys. The backend won't start without them.",
    commands: ["cp .env.example .env"],
    links: [
      {
        label: "Deepgram console",
        href: "https://console.deepgram.com/",
      },
      {
        label: "Google AI Studio",
        href: "https://aistudio.google.com/apikey",
      },
    ],
    aside:
      "LLM_MODEL defaults to gemini-3.5-flash-lite. Older names such as gemini-2.5-flash return 404 NOT_FOUND for newly created API keys.",
  },
  {
    id: "step-03",
    number: "03",
    title: "Start the backend",
    body: "Docker Compose brings up the FastAPI server and Postgres. Leave this terminal running.",
    commands: ["docker compose up --build"],
  },
  {
    id: "step-04",
    number: "04",
    title: "Build the extension",
    body: "Install dependencies and compile the Chrome extension into extension/dist.",
    commandsLabel: "In another terminal:",
    commands: ["cd extension", "pnpm install", "pnpm build"],
  },
  {
    id: "step-05",
    number: "05",
    title: "Load it in Chrome",
    body: "Install the unpacked extension from the build output folder.",
    bullets: [
      "Open chrome://extensions in Chrome",
      "Turn on Developer mode (top-right toggle)",
      "Click Load unpacked and select the extension/dist folder",
      "Confirm the card shows Meet Dual-Stream Transcription",
      "Pin the extension from the puzzle icon for quick access",
    ],
    aside:
      "After code changes, run pnpm build again and click the reload icon on the extension card.",
  },
  {
    id: "step-06",
    number: "06",
    title: "Allow the microphone",
    body: "The extension needs mic permission before capture can start. The side panel cannot show this prompt — use the popup.",
    bullets: [
      "Click the extension icon in the toolbar",
      "Click Enable microphone",
      "In the permission tab, click Allow when Chrome asks",
      "Wait for the green Microphone enabled message before closing the tab",
    ],
    aside:
      "If you skip Allow, Start capture will fail with Permission dismissed.",
  },
  {
    id: "step-07",
    number: "07",
    title: "Capture a meeting",
    body: "Join a real Google Meet call, start capture, and watch live transcripts roll in.",
    bullets: [
      "Open https://meet.google.com and join a call (not the lobby)",
      "Open the popup or side panel and press Start capture",
      "Watch live transcripts in the side panel",
      "Click Summarize when you're done",
    ],
  },
];
