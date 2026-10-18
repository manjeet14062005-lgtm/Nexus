import { useState } from "react";
import { Link } from "react-router-dom";
import "./AuthExperience.css";

export function AuthExperience({ children, registration = false }) {
  const [paused, setPaused] = useState(false);
  return (
    <div className={`auth-experience ${paused ? "auth-paused" : ""}`}>
      <aside className="auth-story">
        <Link className="auth-brand" to="/" aria-label="Nexus home"><img src="/assets/nexus-mark.svg" alt="" />Nexus<span> / IDENTITY INFRASTRUCTURE</span></Link>
        <div className="auth-story-copy"><span className="auth-eyebrow">CONNECTED BY CONFIDENCE</span><h2>Every connection.<br /><em>A new possibility.</em></h2><p>One place for verification, your team,<br />and everything you’re building next.</p></div>
        <div className="auth-art" aria-hidden="true">
          <div className="auth-orbit-grid" />
          <div className="auth-portal"><div className="auth-ring auth-ring-one" /><div className="auth-ring auth-ring-two" /><div className="auth-ring auth-ring-three" /><div className="auth-core"><img src="/assets/nexus-mark.svg" alt="" /></div><div className="auth-signal" /></div>
          <div className="auth-float auth-float-one"><span className="auth-card-icon">✓</span><div><small>IDENTITY CHECK</small><strong>A trusted connection</strong></div><span className="auth-dot" /></div>
          <div className="auth-float auth-float-two"><span className="auth-card-icon">⌘</span><div><small>YOUR WORKSPACE</small><strong>Everything, connected.</strong></div></div>
          <span className="auth-art-caption">THE NEXUS CONNECTION / 001</span>
        </div>
        <div className="auth-story-footer"><span>Verification. Collaboration. Possibility.</span><button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? "▶ Play motion" : "Ⅱ Pause motion"}</button></div>
      </aside>
      <main className="auth-form-side">
        <header className="auth-form-header"><Link to="/" className="auth-back">↖ Back to Nexus</Link><span>{registration ? "Already a member?" : "New to Nexus?"} <Link to={registration ? "/login" : "/register"}>{registration ? "Sign in" : "Get started"} ↗</Link></span></header>
        <div className="auth-form-content"><div className="auth-form-kicker"><span />{registration ? "YOUR NEXT CHAPTER STARTS HERE" : "YOUR WORKSPACE IS WAITING"}</div>{children}</div>
        <footer className="auth-form-footer"><span>© {new Date().getFullYear()} Nexus</span><div><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div></footer>
      </main>
    </div>
  );
}
