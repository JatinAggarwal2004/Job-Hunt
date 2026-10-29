function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((value) => {
      const channel = parseInt(value, 16) / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}
function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
export function workspaceColors(color: string, light: boolean) {
  const accent = /^#[a-f0-9]{6}$/i.test(color) ? color : '#f3d86a',
    bg = light ? '#e8ebdf' : '#252a23'
  let text = accent
  if (contrast(text, bg) < 4.5) {
    const channels = accent
      .slice(1)
      .match(/../g)!
      .map((v) => parseInt(v, 16))
    for (let step = 1; step <= 20; step++) {
      const amount = step / 20
      text =
        '#' +
        channels
          .map((v) =>
            Math.round(v + (light ? -v : 255 - v) * amount)
              .toString(16)
              .padStart(2, '0'),
          )
          .join('')
      if (contrast(text, bg) >= 4.5) break
    }
  }
  return {
    '--ws-accent': text,
    '--ws-button': accent,
    '--ws-button-ink':
      contrast(accent, '#151714') >= contrast(accent, '#f5f6ef') ? '#151714' : '#f5f6ef',
  }
}
