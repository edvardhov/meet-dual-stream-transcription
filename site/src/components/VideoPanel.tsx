import { demoVideo } from "../content";

export function VideoPanel() {
  return (
    <section id="section-video" className="page-section step-reveal">
      <div className="mb-6 lg:mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-cornflower-400">
          Demo
        </p>
        <h2 className="mt-2 font-heading text-3xl text-white sm:text-4xl">
          See it in action
        </h2>
        <p className="mt-3 max-w-xl text-fog-300">
          A short walkthrough of capture, live transcription, and summarization in a
          real Google Meet call.
        </p>
      </div>

      <div className="card-surface overflow-hidden">
        {demoVideo === null ? (
          <div className="flex aspect-video flex-col items-center justify-center gap-4 bg-haiti-900/50 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-white/20 bg-haiti-800/50">
              <svg
                className="h-7 w-7 text-cornflower-400"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <div>
              <p className="font-heading text-xl text-white">Video coming soon</p>
              <p className="mt-2 max-w-sm font-mono text-xs leading-relaxed text-fog-400">
                Set <code className="text-cornflower-300">demoVideo</code> in{" "}
                <code className="text-cornflower-300">site/src/content.ts</code> to a
                file path or YouTube ID.
              </p>
            </div>
          </div>
        ) : demoVideo.kind === "youtube" ? (
          <iframe
            className="aspect-video w-full"
            src={`https://www.youtube-nocookie.com/embed/${demoVideo.id}`}
            title="Meet Dual-Stream Transcription demo"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video
            className="aspect-video w-full bg-black"
            controls
            playsInline
            poster={demoVideo.poster}
          >
            <source src={demoVideo.src} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        )}
      </div>
    </section>
  );
}
