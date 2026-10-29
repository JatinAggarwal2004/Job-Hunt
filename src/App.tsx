import { lazy, Suspense, useEffect, useState } from 'react'
import { motion, MotionConfig, useReducedMotion } from 'framer-motion'
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Compass, MousePointer2 } from 'lucide-react'
import { Navigation } from './components/Navigation'
import { MagneticButton } from './components/Primitives'
import { WorkflowPreview } from './components/WorkflowPreview'
import { readSaved, saveLocal } from './hooks/storage'
import { motionTokens } from './motion'

const Workspace = lazy(() => import('./workspace/Workspace'))

function Hero({
  onStart,
  active,
  setActive,
}: {
  onStart: () => void
  active: number
  setActive: (tab: number) => void
}) {
  const reduced = useReducedMotion()
  const reveal = (delay: number) => ({
    initial: { opacity: 1, y: reduced ? 0 : 18 },
    animate: { opacity: 1, y: 0 },
    transition: { ...motionTokens.reveal, delay: reduced ? 0 : delay },
  })
  return (
    <main id="main">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-content">
          <motion.div className="hero-eyebrow" {...reveal(0)}>
            <span className="status-dot" />A new way to find your next
          </motion.div>
          <h1 id="hero-title">
            <motion.span {...reveal(0.08)}>Your next role.</motion.span>
            <motion.span className="serif-line" {...reveal(0.17)}>
              A little closer<span className="title-period">.</span>
            </motion.span>
          </h1>
          <motion.p className="hero-description" {...reveal(0.24)}>
            Big ambitions. Small teams. Unexpected possibilities.
            <br className="desktop-break" /> Find the work that fits you, and make your next
            <br className="desktop-break" /> move with a little more confidence.
          </motion.p>
          <motion.div className="hero-actions" {...reveal(0.31)}>
            <MagneticButton onClick={onStart}>
              Find my next chapter <ArrowUpRight size={19} />
            </MagneticButton>
            <button
              className="text-button"
              onClick={() => {
                setActive((active + 1) % 3)
                document
                  .getElementById('preview')
                  ?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' })
              }}
            >
              <span className="play-symbol">
                <ArrowRight size={15} />
              </span>
              Take a look around
            </button>
          </motion.div>
          <motion.div className="hero-assurance" {...reveal(0.38)}>
            <span>
              <Check size={13} />
              Your interests, your direction
            </span>
            <span>
              <Check size={13} />
              Always your final call
            </span>
          </motion.div>
          <motion.div className="personal-note" {...reveal(0.45)}>
            <Compass size={19} />
            <p>
              For the next step.
              <br />
              <strong>And the one you didn’t see coming.</strong>
            </p>
          </motion.div>
        </div>
        <motion.div className="hero-visual" {...reveal(0.22)}>
          <WorkflowPreview active={active} setActive={setActive} />
        </motion.div>
      </section>
      <section className="chapter-strip" aria-label="Our approach">
        <div>
          <span className="chapter-marker">
            <ArrowDown size={16} />
          </span>
          <p>
            Less busywork.
            <br />
            <strong>More possibility.</strong>
          </p>
        </div>
        <p>
          From the team of five to the name you know.
          <br />
          <span>Your search should leave room for both.</span>
        </p>
        <button onClick={onStart}>
          Make it your search <ArrowUpRight size={17} />
        </button>
      </section>
      <footer className="preview-footer">
        <span>Thoughtfully built for your next chapter.</span>
        <span>
          <MousePointer2 size={12} />
          Try the tabs. This preview is interactive.
        </span>
      </footer>
    </main>
  )
}
export default function App() {
  const [light, setLight] = useState(() => readSaved<string>('jh-theme', 'dark') === 'light')
  const [active, setActive] = useState(0)
  const [inWorkspace, setInWorkspace] = useState(() => location.pathname.startsWith('/app'))
  useEffect(() => {
    const sync = () => setInWorkspace(location.pathname.startsWith('/app'))
    addEventListener('popstate', sync)
    return () => removeEventListener('popstate', sync)
  }, [])
  function enterWorkspace() {
    history.pushState({}, '', '/app')
    setInWorkspace(true)
    window.scrollTo(0, 0)
  }
  const reduced = useReducedMotion()
  useEffect(() => {
    document.documentElement.dataset.theme = light ? 'light' : 'dark'
    saveLocal('jh-theme', light ? 'light' : 'dark')
  }, [light])
  function explore(tab: number) {
    setActive(tab)
    document
      .getElementById('preview')
      ?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' })
    document.getElementById(`workflow-tab-${tab}`)?.focus({ preventScroll: true })
  }
  if (inWorkspace)
    return (
      <MotionConfig reducedMotion="user">
        <Suspense
          fallback={
            <div className="workspace-loading" role="status">
              Opening your workspace…
            </div>
          }
        >
          <Workspace />
        </Suspense>
      </MotionConfig>
    )
  return (
    <MotionConfig reducedMotion="user">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="ambient" aria-hidden="true" />
      <Navigation
        light={light}
        onTheme={() => setLight(!light)}
        onStart={enterWorkspace}
        onExplore={explore}
      />
      <Hero onStart={enterWorkspace} active={active} setActive={setActive} />
    </MotionConfig>
  )
}
