import { useCallback, useState } from "react";

interface CommandBlockProps {
  command: string;
}

export function CommandBlock({ command }: CommandBlockProps) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [command]);

  return (
    <div className="group relative flex items-stretch overflow-hidden rounded-lg border border-white/10 bg-haiti-950/80">
      <pre className="flex-1 overflow-x-auto px-4 py-3 font-mono text-sm text-fog-100">
        <code>{command}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 border-l border-white/10 px-4 py-3 font-mono text-xs text-fog-300 transition-colors hover:bg-haiti-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cornflower-400"
        aria-label={`Copy command: ${command}`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
