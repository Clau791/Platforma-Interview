import { Link } from "react-router-dom";


export default function Landing() {
  return (
    <div className="space-y-12 fade-up">
      <section className="hero">
        <div className="space-y-6">
          <p className="eyebrow">Laborator de interviu orientat pe voce</p>
          <h1 className="hero-title">Exersează interviuri care par reale, nu scriptate.</h1>
          <p className="hero-subtitle">
            Antrenează-te cu AI adaptiv, feedback vocal instant și insight comportamental
            multimodal. Gândit pentru studenți care vor să sune încrezător sub presiune.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link className="btn-primary" to="/login">
              Începe o sesiune
            </Link>
            <Link className="btn-ghost" to="/arena">
              Intră în Arena
            </Link>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="pill">Whisper STT</span>
            <span className="pill">TTS feedback</span>
            <span className="pill">Insight emoțional</span>
          </div>
        </div>

        <div className="panel space-y-4">
          <span className="tag">Previzualizare sesiune live</span>
          <h2 className="section-title">Focusul de azi</h2>
          <p className="muted">
            Exerciții comportamentale + tehnice, cu ton calibrat pe semnale de stres și
            tipare de ezitare.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="metric">
              <span>Mod sesiune</span>
              <strong>Voce</strong>
            </div>
            <div className="metric">
              <span>Țintă latență</span>
              <strong>&lt; 2s</strong>
            </div>
            <div className="metric">
              <span>Semnale emoționale</span>
              <strong>Stres, Calm</strong>
            </div>
            <div className="metric">
              <span>Format raport</span>
              <strong>JSON + recomandări</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3 stagger">
        <div className="surface-card">
          <h3 className="section-title">Arena orientată pe voce</h3>
          <p className="muted" style={{ color: "var(--text)" }}>
            Vorbește natural; AI-ul răspunde cu ritm realist și întrebări de follow-up.
          </p>
        </div>
        <div className="surface-card">
          <h3 className="section-title">Coaching multimodal</h3>
          <p className="muted" style={{ color: "var(--text)" }}>
            Analizăm micro-emoții și ezitări pentru a adapta stilul de coaching în timp
            real.
          </p>
        </div>
        <div className="surface-card">
          <h3 className="section-title">Sandbox tehnic</h3>
          <p className="muted" style={{ color: "var(--text)" }}>
            Rezolvi prompturi de coding într-un container sigur, în timp ce coach-ul
            evaluează claritatea și corectitudinea.
          </p>
        </div>
      </section>

      <section className="surface-card fade-up">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h2 className="section-title">Primește un raport structurat al interviului</h2>
            <p className="muted">
              Pleci cu un rezumat al sesiunii, răspunsuri ideale și o cronologie a
              tendințelor comportamentale.
            </p>
          </div>
          <Link className="btn-secondary" to="/profile">
            Configurează profilul
          </Link>
        </div>
      </section>
    </div>
  );
}
