import { Waveform } from "./Waveform";
import { scrollToSection } from "../hooks/useActiveSection";

export function Hero() {
  return (
    <header id="section-hero" className="page-section hero-section">
      <div className="hero-glow" aria-hidden="true" />

      <div className="hero-content relative mx-auto flex w-full max-w-4xl flex-col items-center px-6 text-center">
        <Waveform className="hero-enter mb-8" />

        <h1 className="hero-enter hero-enter-delay-1 w-full font-heading text-4xl leading-tight text-white sm:text-5xl md:text-6xl">
          Dual-stream transcription
          <br />
          <span className="italic text-fog-200">for Google Meet</span>
        </h1>

        <p className="hero-enter hero-enter-delay-2 mt-6 w-full max-w-xl text-base leading-relaxed text-fog-300 sm:text-lg">
          Capture your mic and Meet tab audio on separate channels, transcribe live,
          and summarize — follow these steps to get running.
        </p>

        <div className="hero-enter hero-enter-delay-3 mt-10 flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            className="btn-primary"
            onClick={() => scrollToSection("step-01")}
          >
            Start setup
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => scrollToSection("section-video")}
          >
            Watch the demo
          </button>
        </div>
      </div>
    </header>
  );
}
