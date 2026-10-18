import { useEffect, useState } from "react";
export function SceneInspector({ track, renderer }) {
  const [metrics, setMetrics] = useState("Waiting for the scene");
  useEffect(() => { const timer=setInterval(()=>{const m=renderer.current?.metrics?.();setMetrics(m?`${m.tier} · ${m.particles} points · ${m.calls} draws · p95 ${m.p95} ms`:'Static illustration');},1000);return()=>clearInterval(timer);},[renderer]);
  const seek=(percent,scene)=>{const el=track.current;const top=scene?el.getBoundingClientRect().top+window.scrollY+(el.offsetHeight-window.innerHeight)*percent/100:(document.documentElement.scrollHeight-window.innerHeight)*percent/100;window.scrollTo({top,behavior:'instant'});};
  return <aside className="tg-inspector" aria-label="Development scene inspector"><span>{metrics}</span><label>Page position<select aria-label="Page position" defaultValue="0" onChange={e=>seek(Number(e.target.value),false)}>{[0,10,25,40,55,70,85,100].map(p=><option key={p} value={p}>{p}%</option>)}</select></label><label>Scene position<input aria-label="Scene position" type="number" min="0" max="100" defaultValue="0" onChange={e=>seek(Math.min(100,Math.max(0,Number(e.target.value))),true)}/></label></aside>;
}
