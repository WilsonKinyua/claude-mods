const W = 1600
const H = 1000

function seeded(seed: number): () => number {
  let s = seed >>> 0

  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0

    return s / 4294967296
  }
}

const r1 = (n: number): string => n.toFixed(1)

type Waves = Array<[number, number, number]>

const FRONT_BASE = 905
const FRONT: Waves = [[18, 1300, 1.0], [10, 520, 2.6], [4, 110, 0.2]]

function heightAt(x: number, base: number, waves: Waves): number {
  let y = base

  for (const [amp, len, phase] of waves) {
    y -= amp * Math.sin((x / len) * Math.PI * 2 + phase)
  }

  return y
}

function ridge(base: number, waves: Waves, step = 20): string {
  const points: string[] = []

  for (let x = -20; x <= W + 20; x += step) {
    points.push(`${r1(x)},${r1(heightAt(x, base, waves))}`)
  }

  return `M-20,${H + 20} L${points.join(' L')} L${W + 20},${H + 20} Z`
}

function trail(from: number, to: number, sink: number): string {
  const points: string[] = []
  const step = from < to ? 10 : -10

  for (let x = from; step > 0 ? x <= to : x >= to; x += step) {
    const y = x < -20 || x > W + 20 ? heightAt(Math.max(-20, Math.min(W + 20, x)), FRONT_BASE, FRONT) : heightAt(x, FRONT_BASE, FRONT)

    points.push(`${r1(x)},${r1(y + sink)}`)
  }

  return `M${points.join(' L')}`
}

const INK = '#02050a'

function lion(): string {
  return `<g class="lion" style="offset-path:path('${trail(-160, W + 160, 3)}')"><g transform="scale(0.9)" fill="${INK}">
<path d="M-36,-34 C-48,-32 -54,-22 -58,-10" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>
<ellipse cx="-60" cy="-8" rx="4" ry="5"/>
<g class="gait"><rect class="leg a" x="-32" y="-26" width="7" height="26" rx="3"/><rect class="leg b" x="-22" y="-26" width="7" height="26" rx="3"/><rect class="leg b" x="16" y="-26" width="7" height="26" rx="3"/><rect class="leg a" x="25" y="-26" width="7" height="26" rx="3"/></g>
<ellipse cx="-4" cy="-31" rx="36" ry="13"/>
<circle cx="28" cy="-40" r="15"/>
<ellipse cx="40" cy="-37" rx="10" ry="8"/>
<ellipse cx="48" cy="-33" rx="6" ry="4.5"/>
<circle cx="34" cy="-48" r="3.5"/>
</g></g>`
}

function elephant(scale: number, cls: string): string {
  return `<g class="${cls}" style="offset-path:path('${trail(W + 220, -220, 4)}')"><g transform="scale(${-scale} ${scale})" fill="${INK}">
<path d="M-46,-50 C-54,-44 -56,-34 -55,-24" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
<g class="gait slow"><rect class="leg a" x="-38" y="-36" width="14" height="36" rx="4"/><rect class="leg b" x="-20" y="-36" width="14" height="36" rx="4"/><rect class="leg b" x="16" y="-36" width="14" height="36" rx="4"/><rect class="leg a" x="32" y="-36" width="14" height="36" rx="4"/></g>
<ellipse cx="0" cy="-56" rx="50" ry="31"/>
<circle cx="50" cy="-66" r="21"/>
<ellipse cx="38" cy="-62" rx="15" ry="22"/>
<path d="M64,-62 C74,-48 72,-28 70,-12 C69,-6 74,-4 76,-8" stroke="${INK}" stroke-width="10" fill="none" stroke-linecap="round"/>
</g></g>`
}

function birds(): string {
  const flock: Array<[number, number, number]> = [[0, 0, 1], [26, 10, 0.85], [-24, 12, 0.9], [48, 22, 0.75], [-46, 24, 0.8]]

  return `<g class="flock">${flock
    .map(
      ([dx, dy, s], i) =>
        `<g transform="translate(${dx} ${dy}) scale(${s})"><path class="wing" style="animation-delay:-${(i * 0.17).toFixed(2)}s" d="M-9,0 Q-4,-6 0,0 Q4,-6 9,0" stroke="#02050a" stroke-width="2" fill="none" stroke-linecap="round"/></g>`,
    )
    .join('')}</g>`
}

function stars(): string {
  const rand = seeded(7)
  const out: string[] = []

  for (let i = 0; i < 170; i++) {
    const x = rand() * W
    const y = rand() * H * 0.72
    const inMiddle = x > 470 && x < 1130 && y > 180
    const base = (inMiddle ? 0.18 : 0.35) + rand() * 0.45
    const r = 0.5 + rand() * rand() * 1.6
    const tw = rand() < 0.45 ? ` class="tw t${i % 4}"` : ''

    out.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${r.toFixed(2)}" fill-opacity="${base.toFixed(2)}"${tw}/>`)
  }

  return `<g fill="#d6e6ff">${out.join('')}</g>`
}

function acacia(x: number, ground: number, scale: number, flip = false): string {
  const k = scale
  const t = `translate(${x} ${ground}) scale(${flip ? -k : k} ${k})`

  return `<g transform="${t}" fill="#03070d">
<path d="M-5,0 C-4,-40 -2,-70 -3,-95 C-14,-112 -34,-120 -52,-128 L-49,-132 C-30,-125 -12,-118 -1,-104 C2,-120 10,-134 26,-146 L29,-142 C16,-130 8,-116 6,-98 C20,-110 40,-118 62,-124 L63,-120 C42,-112 22,-102 8,-86 C6,-60 7,-30 6,0 Z"/>
<ellipse cx="-58" cy="-136" rx="58" ry="11"/>
<ellipse cx="-10" cy="-150" rx="66" ry="12"/>
<ellipse cx="50" cy="-132" rx="52" ry="10"/>
<ellipse cx="18" cy="-158" rx="38" ry="8"/>
<ellipse cx="-36" cy="-146" rx="44" ry="7"/>
</g>`
}

function giraffe(x: number, ground: number, scale: number): string {
  return `<g transform="translate(${x} ${ground}) scale(${scale})" fill="#040912">
<path d="M-38,-62 C-30,-72 10,-76 30,-70 C38,-90 46,-120 52,-150 C53,-156 58,-160 64,-159 L80,-154 C84,-153 84,-148 80,-147 L66,-146 C62,-118 54,-88 44,-62 C46,-56 44,-50 40,-48 L38,0 L33,0 L31,-46 L22,-46 L20,0 L15,0 L13,-48 L-18,-50 L-20,0 L-25,0 L-27,-50 L-32,-50 L-34,0 L-39,0 L-40,-54 C-44,-50 -50,-40 -52,-30 L-55,-31 C-52,-44 -46,-56 -38,-62 Z"/>
<path d="M58,-160 L56,-170 L59,-170 L61,-160 Z M64,-160 L64,-170 L67,-170 L67,-159 Z"/>
<ellipse class="head" cx="60" cy="-156" rx="3" ry="2" fill="#040912"/>
</g>`
}

function fireflies(): string {
  const rand = seeded(23)
  const out: string[] = []
  const spots: Array<[number, number]> = []

  for (let i = 0; i < 9; i++) {
    spots.push([60 + rand() * 360, 840 + rand() * 120])
  }
  for (let i = 0; i < 9; i++) {
    spots.push([1180 + rand() * 380, 830 + rand() * 130])
  }
  spots.forEach(([x, y]) => {
    const dur = (7 + rand() * 6).toFixed(1)
    const delay = (-rand() * 10).toFixed(1)

    out.push(
      `<g class="fly" style="animation-duration:${dur}s;animation-delay:${delay}s"><circle cx="${r1(x)}" cy="${r1(y)}" r="7" fill="url(#ffglow)"/><circle cx="${r1(x)}" cy="${r1(y)}" r="1.6" fill="#ffe3a0"/></g>`,
    )
  })

  return out.join('')
}

const STYLE = `
.tw{animation:tw 6s ease-in-out infinite}
.t1{animation-delay:-1.5s;animation-duration:7.5s}
.t2{animation-delay:-3s;animation-duration:5s}
.t3{animation-delay:-4.5s;animation-duration:9s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:.25}}
.fly{animation-name:fly;animation-timing-function:ease-in-out;animation-iteration-count:infinite}
@keyframes fly{0%{transform:translate(0,0);opacity:0}20%{opacity:.9}50%{transform:translate(18px,-26px);opacity:.35}80%{opacity:.85}100%{transform:translate(-6px,-48px);opacity:0}}
.moonglow{animation:glow 12s ease-in-out infinite}
@keyframes glow{0%,100%{opacity:.55}50%{opacity:.8}}
.meteor{animation:meteor 19s linear infinite;opacity:0}
@keyframes meteor{0%,86%{transform:translate(0,0);opacity:0}87%{opacity:.9}92%{transform:translate(-340px,190px);opacity:0}100%{opacity:0}}
.haze{animation:drift 60s ease-in-out infinite alternate}
@keyframes drift{from{transform:translateX(-30px)}to{transform:translateX(30px)}}
.lion,.calf,.cow{offset-rotate:0deg;offset-anchor:0 0;animation-timing-function:linear;animation-iteration-count:infinite}
.lion{animation-name:walk;animation-duration:110s;animation-delay:-20s}
.cow{animation-name:walk;animation-duration:170s;animation-delay:-120s}
.calf{animation-name:walk;animation-duration:170s;animation-delay:-116.5s}
@keyframes walk{from{offset-distance:0%}to{offset-distance:100%}}
.leg{transform-box:fill-box;transform-origin:50% 0;animation:swing 1.1s ease-in-out infinite alternate}
.slow .leg{animation-duration:1.7s}
.leg.b{animation-direction:alternate-reverse}
@keyframes swing{from{transform:rotate(-14deg)}to{transform:rotate(14deg)}}
.flock{offset-path:path('M1750,150 C1300,90 900,170 500,110 S-100,140 -200,120');offset-rotate:0deg;animation:walk 48s linear infinite;animation-delay:-30s}
.wing{transform-box:fill-box;transform-origin:50% 100%;animation:flap .7s ease-in-out infinite alternate}
@keyframes flap{from{transform:scaleY(1)}to{transform:scaleY(-.6)}}
@media (prefers-reduced-motion:reduce){.tw,.fly,.moonglow,.meteor,.haze,.lion,.cow,.calf,.leg,.flock,.wing{animation:none}.fly{opacity:.6}.lion{offset-distance:22%}.cow{offset-distance:62%}.calf{offset-distance:60%}.flock{offset-distance:70%}}
`

export const SAVANNAH_NIGHT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<style>${STYLE}</style>
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#050913"/><stop offset=".55" stop-color="#0a1426"/><stop offset=".82" stop-color="#11223a"/><stop offset="1" stop-color="#1a2a3f"/>
</linearGradient>
<radialGradient id="moonhalo"><stop offset="0" stop-color="#f6ecd0" stop-opacity=".35"/><stop offset=".4" stop-color="#9fb8e0" stop-opacity=".1"/><stop offset="1" stop-color="#9fb8e0" stop-opacity="0"/></radialGradient>
<radialGradient id="ffglow"><stop offset="0" stop-color="#ffd27a" stop-opacity=".7"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
<linearGradient id="trail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset="1" stop-color="#9fc6ff" stop-opacity="0"/></linearGradient>
<linearGradient id="horizon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a4a6e" stop-opacity="0"/><stop offset="1" stop-color="#2a4a6e" stop-opacity=".35"/></linearGradient>
<filter id="soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="28"/></filter>
<mask id="crescent"><rect width="${W}" height="${H}" fill="#fff"/><circle cx="1282" cy="172" r="44" fill="#000"/></mask>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<g class="haze" filter="url(#soft)" opacity=".16"><ellipse cx="420" cy="260" rx="560" ry="70" transform="rotate(-18 420 260)" fill="#5a7fb8"/><ellipse cx="1180" cy="120" rx="380" ry="50" transform="rotate(-18 1180 120)" fill="#6a7fc8"/></g>
${stars()}
<line class="meteor" x1="1180" y1="120" x2="1300" y2="52" stroke="url(#trail)" stroke-width="1.6" stroke-linecap="round"/>
<circle class="moonglow" cx="1260" cy="190" r="190" fill="url(#moonhalo)"/>
<circle cx="1260" cy="190" r="46" fill="#f3ead2" mask="url(#crescent)"/>
<rect y="640" width="${W}" height="200" fill="url(#horizon)"/>
<path d="${ridge(770, [[38, 900, 0.4], [22, 380, 1.9], [9, 170, 0.7]])}" fill="#0c1829"/>
<path d="${ridge(835, [[30, 1100, 2.2], [16, 420, 0.3], [6, 140, 1.1]])}" fill="#08111f"/>
${birds()}
<path d="${ridge(FRONT_BASE, FRONT)}" fill="#050b15"/>
${elephant(0.62, 'cow')}
${elephant(0.36, 'calf')}
${lion()}
${acacia(300, 905, 1.25)}
${acacia(1350, 902, 1.05, true)}
${acacia(1085, 897, 0.55)}
${giraffe(1200, 906, 0.85)}
${fireflies()}
</svg>`
