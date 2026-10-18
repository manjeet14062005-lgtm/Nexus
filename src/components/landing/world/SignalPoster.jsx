export function SignalPoster() {
  return <svg className="tg-poster ls-poster" viewBox="0 0 800 800" role="presentation" aria-hidden="true">
    <defs><linearGradient id="ls-foil" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#b8cbff"/><stop offset=".35" stopColor="#5a78ca"/><stop offset=".6" stopColor="#e0d9ff"/><stop offset="1" stopColor="#796bc5"/></linearGradient></defs>
    {[0,1,2,3,4].map(i=><ellipse key={i} cx="400" cy="400" rx={180+i*12} ry={100+i*10} fill="none" stroke="url(#ls-foil)" strokeWidth="18" transform={`rotate(${i*36-35} 400 400)`}/>)}
  </svg>;
}
