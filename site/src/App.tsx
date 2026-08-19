import { Hero } from "./components/Hero";
import { StepCard } from "./components/StepCard";
import { VideoPanel } from "./components/VideoPanel";
import { steps } from "./content";
import { useScrollReveal } from "./hooks/useActiveSection";

export function App() {
  useScrollReveal();

  return (
    <>
      <div className="page-grain" aria-hidden="true" />

      <Hero />

      <div className="relative z-10 mx-auto max-w-3xl px-6 pb-16">
        <main className="setup-main">
          {steps.map((step) => (
            <StepCard key={step.id} step={step} />
          ))}

          <VideoPanel />
        </main>
      </div>
    </>
  );
}
