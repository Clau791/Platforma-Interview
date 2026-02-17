import { Link } from "react-router-dom";


export default function Landing() {
  return (
    <div className="space-y-12 fade-up">
      <section className="hero">
        <div className="space-y-6">
          <p className="eyebrow">Voice-first interview lab</p>
          <h1 className="hero-title">Practice interviews that feel real, not scripted.</h1>
          <p className="hero-subtitle">
            Train with adaptive AI, instant vocal feedback, and multimodal behavioral
            insight. Designed for students who want to sound confident under pressure.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link className="btn-primary" to="/login">
              Start a Session
            </Link>
            <Link className="btn-ghost" to="/arena">
              Enter the Arena
            </Link>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="pill">Whisper STT</span>
            <span className="pill">TTS feedback</span>
            <span className="pill">Emotion insights</span>
          </div>
        </div>

        <div className="panel space-y-4">
          <span className="tag">Live Session Preview</span>
          <h2 className="section-title">Today&rsquo;s focus</h2>
          <p className="muted">
            Behavioral + technical drills, with tone calibrated to stress signals and
            hesitation patterns.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="metric">
              <span>Session mode</span>
              <strong>Voice</strong>
            </div>
            <div className="metric">
              <span>Latency target</span>
              <strong>&lt; 2s</strong>
            </div>
            <div className="metric">
              <span>Emotion signals</span>
              <strong>Stress, Calm</strong>
            </div>
            <div className="metric">
              <span>Report format</span>
              <strong>JSON + tips</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3 stagger">
        <div className="surface-card">
          <h3 className="section-title">Voice-first arena</h3>
          <p className="muted" style={{ color: "var(--text)" }}>
            Speak naturally; the AI responds with realistic pacing and follow-up
            questions.
          </p>
        </div>
        <div className="surface-card">
          <h3 className="section-title">Multimodal coaching</h3>
          <p className="muted" style={{ color: "var(--text)" }}>
            We analyze micro-emotions and hesitation to adapt the coaching style in
            real time.
          </p>
        </div>
        <div className="surface-card">
          <h3 className="section-title">Technical sandbox</h3>
          <p className="muted" style={{ color: "var(--text)" }}>
            Solve coding prompts in a safe container while the coach scores clarity
            and correctness.
          </p>
        </div>
      </section>

      <section className="surface-card fade-up">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h2 className="section-title">Get a structured interview report</h2>
            <p className="muted">
              Walk away with a session summary, ideal answers, and a behavioral trend
              timeline.
            </p>
          </div>
          <Link className="btn-secondary" to="/profile">
            Configure Profile
          </Link>
        </div>
      </section>
    </div>
  );
}
