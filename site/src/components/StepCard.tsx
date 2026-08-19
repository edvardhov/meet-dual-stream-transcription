import type { Step } from "../content";
import { CommandBlock } from "./CommandBlock";

interface StepCardProps {
  step: Step;
}

export function StepCard({ step }: StepCardProps) {
  return (
    <article id={step.id} className="page-section step-reveal">
      <div className="card-surface p-6 sm:p-8">
        <header className="mb-4 sm:mb-5">
          <p className="font-mono text-xs text-cornflower-400">Step {step.number}</p>
          <h2 className="mt-1 font-heading text-2xl text-white sm:text-3xl">
            {step.title}
          </h2>
        </header>

        <p className="mb-4 leading-relaxed text-fog-300 sm:mb-5">{step.body}</p>

        {step.commands && step.commands.length > 0 && (
          <div className="space-y-2">
            {step.commandsLabel && (
              <p className="text-sm text-fog-300">{step.commandsLabel}</p>
            )}
            {step.commands.map((cmd) => (
              <CommandBlock key={cmd} command={cmd} />
            ))}
          </div>
        )}

        {step.bullets && step.bullets.length > 0 && (
          <ul className="mt-4 space-y-1.5 pl-1 sm:mt-5">
            {step.bullets.map((bullet) => (
              <li
                key={bullet}
                className="flex gap-3 text-sm leading-snug text-fog-300"
              >
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-cornflower-500" />
                {bullet}
              </li>
            ))}
          </ul>
        )}

        {step.links && step.links.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3 sm:mt-5">
            {step.links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-cornflower-300 transition-colors hover:border-cornflower-500/50 hover:bg-cornflower-500/10 hover:text-white"
              >
                {link.label}
                <span aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        )}

        {step.aside && (
          <aside className="mt-4 rounded-lg border border-cornflower-500/20 bg-cornflower-500/5 px-4 py-3 text-sm leading-snug text-fog-300 sm:mt-5">
            {step.aside}
          </aside>
        )}
      </div>
    </article>
  );
}
