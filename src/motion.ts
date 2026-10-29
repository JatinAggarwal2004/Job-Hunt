export const motionTokens = {
  spring: { type: 'spring' as const, stiffness: 240, damping: 28 },
  reveal: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const },
  stagger: 0.09,
  tilt: 4,
  magnetic: 0.12,
}
