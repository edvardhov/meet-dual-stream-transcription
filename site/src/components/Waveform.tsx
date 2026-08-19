interface WaveformProps {
  className?: string;
  barCount?: number;
  compact?: boolean;
}

function generateHeights(count: number, seed: number): number[] {
  const heights: number[] = [];
  for (let i = 0; i < count; i++) {
    const wave = Math.sin((i + seed) * 0.7) * 0.3 + Math.cos((i + seed) * 0.4) * 0.2;
    heights.push(0.35 + Math.abs(wave) * 0.65);
  }
  return heights;
}

function WaveLane({
  heights,
  colorClass,
  label,
}: {
  heights: number[];
  colorClass: string;
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-fog-400/70">
        {label}
      </span>
      <div className="flex h-12 items-end justify-center gap-[3px] sm:h-16 sm:gap-1">
        {heights.map((h, i) => (
          <span
            key={i}
            className={`wave-bar w-1 rounded-full sm:w-1.5 ${colorClass}`}
            style={{
              height: `${h * 100}%`,
              animationDelay: `${(i % 12) * 0.08}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function Waveform({ className = "", barCount = 24, compact = false }: WaveformProps) {
  const micHeights = generateHeights(barCount, 1);
  const meetHeights = generateHeights(barCount, 7);

  if (compact) {
    return (
      <div
        className={`flex items-end justify-center gap-[2px] ${className}`}
        aria-hidden="true"
      >
        {[...micHeights.slice(0, 12), ...meetHeights.slice(0, 12)].map((h, i) => (
          <span
            key={i}
            className={`wave-bar w-0.5 rounded-full ${i < 12 ? "bg-cornflower-500" : "bg-fog-300/60"}`}
            style={{
              height: `${h * (compact ? 24 : 48)}px`,
              animationDelay: `${(i % 8) * 0.1}s`,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`mx-auto flex w-full max-w-md gap-6 sm:gap-10 ${className}`}
      role="img"
      aria-label="Dual-channel waveform — microphone and Meet tab audio"
    >
      <WaveLane heights={micHeights} colorClass="bg-cornflower-500" label="Ch 0 · Mic" />
      <div className="w-px shrink-0 bg-white/10" aria-hidden="true" />
      <WaveLane heights={meetHeights} colorClass="bg-fog-300/70" label="Ch 1 · Meet" />
    </div>
  );
}

export function WaveformDivider() {
  return (
    <div className="my-16 flex items-center justify-center gap-4 opacity-60" aria-hidden="true">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <Waveform compact className="opacity-80" />
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
    </div>
  );
}
