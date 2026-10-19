import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { flushSync } from "react-dom";
import { createChoreographer } from "./motion/choreographer";
import { motionTokens } from "./motion/tokens";
import { useCinematicLevel } from "./hooks/useCinematicLevel";
import { useLandingReveal } from "./hooks/useLandingReveal";
import { SignalPoster } from "./world/SignalPoster";
import { DeveloperCode, RolesMatrix, Simulator, WorkflowGraph } from "./sections/InteractiveSections";
import { CommandMenu } from "./sections/CommandMenu";
import { SceneInspector } from "./sections/SceneInspector";
import "./trustGate.css";
import "./livingSignal.css";

const chapters = [
  ["VERIFY", "A clear way in.", "Turn an uncertain interaction into a verified connection. Bring email and phone verification into your application.", "Email + phone / Test + live"],
  ["UNDERSTAND", "See the bigger picture.", "Explore verification outcomes and usage. Give your team a shared view of what is happening in your workspace.", "Outcomes / Usage / Visibility"],
  ["CONNECT", "Let the next step flow.", "Connect verification events to webhooks and workflows. Make the next interaction part of the same story.", "Events / Conditions / Actions"],
  ["CONTROL", "Access, with intention.", "One workspace. Five roles. Give people the tools they need, with permissions that keep responsibilities clear.", "Owner / Admin / Developer / Analyst / Viewer"],
];
const faq = [
  ["How do I get started?", "Create an account and a workspace, then open the Developer Portal to create a test API key. The integration guide walks you through sending and checking your first verification."],
  ["Can I test before sending real messages?", "Yes. Test keys use a separate test environment with deterministic verification codes. Test requests do not send provider messages."],
  ["How does team access work?", "Each workspace has its own membership and roles: Owner, Admin, Developer, Analyst and Viewer. Role permissions determine the tools and actions available to each teammate."],
  ["Where can I compare plans?", "The Billing page shows current plans, quotas and pricing for your account. Available features and usage allowances vary by plan."],
];
function Brand() { return <Link to="/" className="tg-brand" aria-label="Nexus home"><img src="/assets/nexus-mark.svg" width="30" height="30" alt=""/>Nexus</Link>; }
export function TrustGateLanding() {
  const navigate = useNavigate();
  const motion = useCinematicLevel(); const { level } = motion;
  const track = useRef(null), canvasHost = useRef(null), renderer = useRef(null);
  const [chapter, setChapter] = useState(0), [menu, setMenu] = useState(false), [notice, setNotice] = useState("");
  const [sceneReady, setSceneReady] = useState(false);
  const [visualReady, setVisualReady] = useState(false);
  const pageReady = useLandingReveal(visualReady);
  const [heroActive, setHeroActive] = useState(true);
  useEffect(() => {
    const targets = document.querySelectorAll('.trust-gate .tg-section, .trust-gate .tg-band, .trust-gate .tg-security, .trust-gate .tg-intro, .trust-gate .tg-finale');
    if (level === 'off' || !window.IntersectionObserver) return undefined;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.dataset.revealed = 'true'; observer.unobserve(entry.target); }
    }), { threshold: .12 });
    const ambient = new IntersectionObserver(entries => entries.forEach(entry => {
      entry.target.dataset.visible = String(entry.isIntersecting);
    }));
    document.querySelectorAll('.ls-marquee, .tg-analytics, .tg-workflows, .tg-finale').forEach(target => ambient.observe(target));
    targets.forEach(target => { delete target.dataset.revealed; observer.observe(target); });
    return () => { observer.disconnect(); ambient.disconnect(); };
  }, [level]);
  useEffect(() => {
    if (level === "off") { setSceneReady(false); setVisualReady(true); return undefined; }
    let stopped = false, dispose = null;
    setSceneReady(false);
    const fallback = () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timeout);
      dispose?.(); renderer.current = null;
      setSceneReady(false); setVisualReady(true);
      setNotice("Showing the static illustration. All page features remain available.");
    };
    const timeout = setTimeout(fallback, 7000);
    const start = async () => {
      try {
        const { createSignalRenderer } = await import(/* webpackChunkName: "living-signal-scene" */ "./world/renderer");
        if (stopped) return;
        const scene = createSignalRenderer(canvasHost.current, level, fallback,
          () => { setNotice("Lite mode enabled for smoother performance."); motion.degrade(); },
          () => { if (!stopped) { clearTimeout(timeout); setSceneReady(true); setVisualReady(true); } });
        renderer.current = scene; dispose = scene.dispose;
      } catch { fallback(); }
    };
    // Start immediately: the loader covers shader compilation and the first paint.
    start();
    return () => { stopped = true; clearTimeout(timeout); dispose?.(); renderer.current = null; };
  // Only recreate the scene when the chosen quality changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);
  useEffect(() => {
    if (level === "off") return undefined;
    let wasActive = true;
    return createChoreographer(track.current, setChapter, (progress, time, dt) => {
      const active = progress < .13;
      if (active !== wasActive) { wasActive = active; setHeroActive(active); }
      renderer.current?.render(progress, time, dt);
    });
  }, [level]);
  useEffect(() => { if (!menu) return undefined; const close = e => { if (e.key === "Escape") { setMenu(false); document.getElementById("tg-menu-button")?.focus(); } }; document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, [menu]);
  const routeTransition = e => {
    const link = e.target.closest("a"); const path = link?.getAttribute("href");
    if (level === "off" || !document.startViewTransition || !["/register", "/login"].includes(path) || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const html = document.documentElement; html.style.setProperty("--tg-route-x", `${e.clientX || window.innerWidth / 2}px`); html.style.setProperty("--tg-route-y", `${e.clientY || window.innerHeight / 2}px`); html.classList.add("tg-route-transition");
    const transition = document.startViewTransition(() => flushSync(() => navigate(path)));
    transition.ready.catch(() => {}); transition.finished.catch(() => {}).finally(() => { html.classList.remove("tg-route-transition"); html.style.removeProperty("--tg-route-x"); html.style.removeProperty("--tg-route-y"); });
  };
  return <div className="trust-gate" aria-busy={!pageReady} data-motion={level} onClickCapture={routeTransition} style={{ "--tg-ease": motionTokens.ease, "--tg-ui": `${motionTokens.ui}ms` }}>
    {process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).has("perf") && <SceneInspector track={track} renderer={renderer}/>}
    <a className="tg-skip" href="#main">Skip to content</a>
    <header className="tg-header"><Brand/><nav className="tg-desktop-nav" aria-label="Main navigation"><a href="#platform">Platform</a><a href="#developers">Developers</a><a href="#questions">Questions</a></nav><div className="tg-header-actions"><Link className="tg-signin" to="/login">Sign in</Link><Link className="tg-button tg-button-small" to="/register">Get started <span>↗</span></Link><button id="tg-menu-button" className="tg-menu-toggle" aria-expanded={menu} aria-controls="tg-mobile-nav" onClick={() => setMenu(!menu)}>{menu ? "Close" : "Menu"}</button></div>{menu && <nav id="tg-mobile-nav" className="tg-mobile-nav" aria-label="Mobile navigation">{[["Platform","#platform"],["Developers","#developers"],["Questions","#questions"]].map(([name,url])=><a key={name} href={url} onClick={()=>setMenu(false)}>{name} ↗</a>)}<Link to="/login">Sign in ↗</Link></nav>}</header>
    <main id="main">
      <section className="tg-story" ref={track} id="platform" aria-label="The Living Signal story">
        <div className="tg-stage" data-chapter={chapter}>
          <div className="tg-scene" aria-hidden="true" data-ready={sceneReady}><SignalPoster/><div ref={canvasHost} className="tg-canvas"/><div className="ls-coordinate ls-coordinate-top">SIGNAL / CONNECTED<span>↗</span></div><div className="ls-coordinate ls-coordinate-bottom"><span className="tg-dot"/> ONE CONTINUOUS CONNECTION</div></div>
          <div className="tg-hero-copy" data-active={heroActive || level === "off"}><span className="tg-eyebrow"><span className="tg-dot"/> VERIFICATION INFRASTRUCTURE</span><h1>Trust opens<br/><em>everything.</em></h1><p>A clear connection between your product<br className="tg-desktop-break"/> and the people behind every interaction.</p><div className="tg-hero-actions"><Link to="/register" className="tg-button" tabIndex={heroActive || level === "off" ? 0 : -1}>Build with Nexus <span>↗</span></Link><a href="#demo" className="tg-secondary" tabIndex={heroActive || level === "off" ? 0 : -1}>Try the experience <span>↓</span></a></div><div className="tg-hero-caption"><span>EMAIL + PHONE</span><span>ONE CONNECTED WORKSPACE</span></div></div>
          <div className="tg-scene-label"><span className="tg-dot"/> THE LIVING SIGNAL <span>Illustrative 3D story</span></div>
          <div className="tg-chapter-copy" aria-hidden="true"><span className="tg-eyebrow">0{chapter+1} / {chapters[chapter][0]}</span><div className="tg-chapter-title" key={chapter}>{chapters[chapter][1]}</div><p>{chapters[chapter][2]}</p><span className="tg-note">{chapters[chapter][3]}</span></div>
          <div className="tg-stage-bottom"><span className="tg-note">SCROLL TO DISCOVER ↓</span><div className="tg-progress"><span/></div><nav className="tg-chapter-nav" aria-label="Story chapters">{chapters.map(([name],i)=><button key={name} aria-label={`Scene: ${name.toLowerCase()}`} aria-current={chapter===i && level!=="off"?"step":undefined} onClick={()=>{if(level==="off"){document.getElementById(`story-${i}`)?.scrollIntoView({block:"start"});return;}const el=track.current;window.scrollTo({top:el.getBoundingClientRect().top+window.scrollY+(el.offsetHeight-window.innerHeight)*[.16,.38,.64,.9][i],behavior:"instant"});}}>0{i+1}</button>)}</nav></div>
        </div>
        <div className="tg-story-accessible">{chapters.map(([label,title,body],i)=><article key={label} id={`story-${i}`}><span className="tg-eyebrow">0{i+1} / {label}</span><h2>{title}</h2><p>{body}</p></article>)}</div>
      </section>
      <div className="tg-motion-bar"><CommandMenu/><label>Cinematic <select value={level} disabled={motion.reduced} onChange={e=>motion.select(e.target.value)} aria-label="Cinematic quality"><option value="full">Full</option><option value="lite">Lite</option><option value="off">Off</option></select></label><button className="tg-text-button" onClick={motion.pause} disabled={level === "off"}>{level === "off" ? "Paused" : "Pause Ⅱ"}</button>{motion.reduced && <span className="tg-reduced-label">Reduced motion</span>}</div>
      {notice && <div role="status" className="tg-notice">{notice}<button className="tg-text-button" onClick={()=>setNotice("")}>Dismiss</button></div>}
      <div className="ls-marquee" aria-hidden="true"><div>{[0,1].map(i=><span key={i}>VERIFY <b>✳</b> UNDERSTAND <b>✳</b> CONNECT <b>✳</b> CONTROL <b>✳</b> </span>)}</div></div>
      <div className="tg-intro tg-wide"><span className="tg-eyebrow">LESS FRICTION. MORE POSSIBILITY.</span><h2>Not just a check.<br/>The start of <em>what’s next.</em></h2><p>Verify identities. Understand outcomes. Connect your tools.<br/>Keep your team moving with a foundation built around trust.</p><div className="tg-capabilities">{["Email & phone", "Test environments", "Workspace analytics", "Webhooks & workflows"].map((x,i)=><span key={x}><b>0{i+1}</b>{x}</span>)}</div></div>
      <Simulator/><DeveloperCode/>
      <section className="tg-band tg-analytics" id="understand"><div className="tg-wide"><div className="tg-centered"><span className="tg-eyebrow">02 / UNDERSTAND</span><h2>Clarity, from<br/><em>every angle.</em></h2><p>A shared view of verification outcomes, usage and activity.</p></div><div className="tg-dashboard-preview"><div className="tg-preview-sidebar"><img src="/assets/nexus-mark.svg" alt="" width="28" height="28"/><span>Overview</span><b>Analytics</b><span>Verification</span><span>Workflows</span></div><div className="tg-preview-main"><div className="tg-card-top"><h3>Verification activity</h3><span className="tg-tag">Illustrative preview</span></div><div className="tg-preview-metrics"><div><span>Outcomes</span><strong>A clearer picture.</strong></div><div><span>Environment</span><strong>Test + live</strong></div></div><div className="tg-chart" aria-label="Decorative chart, not live customer data">{[25,38,31,52,45,61,48,67,59,78,68,86,72,90,83,96,87,100].map((height,i)=><i key={i} style={{"--bar-height":`${height}%`,"--bar-index":i}}/>)}</div><div className="tg-chart-legend"><span><i/> Verified</span><span>Illustrative data · Your actual activity appears in your workspace</span></div></div></div></div></section>
      <WorkflowGraph/><RolesMatrix/>
      <section className="tg-security tg-wide"><div><span className="tg-eyebrow">CONFIDENCE IN THE DETAILS</span><h2>A foundation<br/><em>you can build on.</em></h2></div><div className="tg-security-grid">{[["01","Separate environments","Build with test keys before configuring live verification."],["02","Scoped access","Workspace roles determine the actions available to each teammate."],["03","Traceable activity","Review workspace activity and audit logs where your role permits."],["04","A plan for your product","Compare current plans, quotas and pricing in Billing."]].map(([n,title,body])=><article key={n}><span className="tg-eyebrow">{n} /</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>
      <section className="tg-faq tg-wide" id="questions"><div><span className="tg-eyebrow">A LITTLE MORE CLARITY</span><h2>Good questions.<br/><em>Clear answers.</em></h2></div><div>{faq.map(([q,a])=><details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div></section>
      <section className="tg-finale"><div className="tg-finale-aperture" aria-hidden="true"><span/><span/></div><div><span className="tg-eyebrow">YOUR NEXT CHAPTER STARTS HERE</span><h2>Open the door<br/>to <em>what’s possible.</em></h2><p>Build something people can trust.</p><Link to="/register" className="tg-button">Create your workspace <span>↗</span></Link></div></section>
    </main>
    <footer className="tg-footer tg-wide"><div><Brand/><p>Verification. Connection. Possibility.</p></div><nav aria-label="Footer navigation">{[["Developer portal","/developer"],["Status","/status"],["Privacy","/privacy"],["Terms","/terms"]].map(([label,path])=><Link key={path} to={path}>{label}</Link>)}</nav><div className="tg-footer-bottom"><span>© {new Date().getFullYear()} Nexus</span><a href="#platform">Back to the beginning ↑</a></div><div className="tg-wordmark" aria-hidden="true">Nexus</div></footer>
  </div>;
}
