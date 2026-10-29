import { useState } from 'react'
import { ArrowUpRight, Menu, Moon, Sun, X } from 'lucide-react'
import { MagneticButton } from './Primitives'

export function Brand() {
  return <a href="#top" className="brand" aria-label="job-hunter. home"><span className="brand-icon" aria-hidden="true">j<span>h</span></span><span>job-hunter<span className="brand-period">.</span></span></a>
}
export function Navigation({ light, onTheme, onStart, onExplore }: { light: boolean; onTheme: () => void; onStart: () => void; onExplore: (tab: number) => void }) {
  const [open, setOpen] = useState(false)
  function go(tab: number) { onExplore(tab); setOpen(false) }
  return <header id="top" className="site-header"><div className="nav-shell">
    <Brand />
    <nav aria-label="Main navigation" className="desktop-nav">
      <button onClick={() => go(0)}>Discover</button><button onClick={() => go(1)}>Resume studio</button><button onClick={() => go(2)}>How it works <ArrowUpRight size={13} /></button>
    </nav>
    <div className="nav-actions"><button className="icon-button theme-toggle" onClick={onTheme} aria-label={`Switch to ${light ? 'dark' : 'light'} mode`}>{light ? <Moon size={18} /> : <Sun size={18} />}</button>
      <MagneticButton className="small" onClick={onStart}>Start your search <ArrowUpRight size={16} /></MagneticButton>
      <button className="icon-button menu-toggle" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button></div>
    {open && <nav id="mobile-nav" className="mobile-nav" aria-label="Mobile navigation"><button onClick={() => go(0)}>Discover</button><button onClick={() => go(1)}>Resume studio</button><button onClick={() => go(2)}>How it works</button><button onClick={() => { setOpen(false); onStart() }}>Start your search <ArrowUpRight size={16} /></button></nav>}
  </div></header>
}
