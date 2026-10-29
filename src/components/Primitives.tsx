import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion'
import type { PropsWithChildren, MouseEvent, ButtonHTMLAttributes } from 'react'
import { motionTokens } from '../motion'

export function MagneticButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const reduced = useReducedMotion()
  const x = useSpring(0, motionTokens.spring), y = useSpring(0, motionTokens.spring)
  function follow(event: MouseEvent<HTMLDivElement>) {
    if (reduced || !matchMedia('(pointer: fine)').matches) return
    const box = event.currentTarget.getBoundingClientRect()
    x.set((event.clientX - box.left - box.width / 2) * motionTokens.magnetic)
    y.set((event.clientY - box.top - box.height / 2) * motionTokens.magnetic)
  }
  return <motion.div className="magnetic" style={{ x, y }} onMouseMove={follow} onMouseLeave={() => { x.set(0); y.set(0) }}>
    <button className={`glossy-button ${className}`} {...props}>{children}</button>
  </motion.div>
}
export function GlassCard({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <div className={`glass-card ${className}`}>{children}</div>
}
export function TiltCard({ children }: PropsWithChildren) {
  const reduced = useReducedMotion()
  const rawX = useMotionValue(0), rawY = useMotionValue(0)
  const rotateX = useSpring(rawX, motionTokens.spring), rotateY = useSpring(rawY, motionTokens.spring)
  function tilt(event: MouseEvent<HTMLDivElement>) {
    if (reduced || !matchMedia('(pointer: fine)').matches) return
    const box = event.currentTarget.getBoundingClientRect()
    rawX.set(-(event.clientY - box.top - box.height / 2) / box.height * motionTokens.tilt)
    rawY.set((event.clientX - box.left - box.width / 2) / box.width * motionTokens.tilt)
  }
  return <motion.div className="tilt-card" style={{ rotateX, rotateY }} onMouseMove={tilt} onMouseLeave={() => { rawX.set(0); rawY.set(0) }}>{children}</motion.div>
}
