// Sound recipes (step 9), from the approved prototype (design/mockups/sounds.html). Pure: each
// recipe returns the notes to play and never touches Web Audio; the player (player.ts) plays them.
// Everyday sounds are tiny clicks (a few milliseconds of filtered noise), soft sine tones and a
// paper slide: quiet, crisp, close to the ear, a touch left or right. Only the two achievement
// stingers (rank-up, graduation) add hits, brass, mallets, claps and the hall echo.

type EverydayNote =
  // A click: noise through a resonant bandpass at `freq` (~1.5 kHz a soft "ka", ~6 kHz a sharp
  // "chick"). The player adds its faint glassy ping.
  | { kind: 'click'; at: number; freq: number; level: number; dur: number; q: number; pan: number }
  // A tone gliding from f0 to f1: sine (soft) or triangle (a struck mallet).
  | { kind: 'tone'; at: number; wave: 'sine' | 'triangle'; f0: number; f1: number; dur: number; gain: number; attack: number; pan: number }
  // Paper sliding: brightening (a sheet coming up) or darkening (a sheet going away).
  | { kind: 'paper'; at: number; dur: number; up: boolean; level: number; pan: number }

type StingerNote =
  // A noise burst with its own filter sweep: a crack, a crash or a whoosh.
  | {
      kind: 'noise'
      at: number
      dur: number
      gain: number
      filter: 'bandpass' | 'highpass'
      f0: number
      f1: number
      q: number
      attack: number
      pan: number
      hall: number
    }
  // A brass "blat": detuned saws and a square through a lowpass that snaps open (or swells, for a
  // held victory chord).
  | { kind: 'brass'; at: number; freq: number; dur: number; gain: number; swell: boolean; pan: number; hall: number }

export type Note = EverydayNote | StingerNote

export const EVERYDAY = ['tap', 'select', 'back', 'bubble', 'wipe', 'swipe', 'sheetUp', 'sheetDown', 'remove', 'undo', 'switch', 'error'] as const
export const STINGERS = ['rankUp', 'graduate'] as const
type Everyday = (typeof EVERYDAY)[number] | 'log'
type Stinger = (typeof STINGERS)[number]
export type SoundName = Everyday | Stinger

// A note from C6, `semis` semitones up.
const note = (semis: number) => 1046.5 * Math.pow(2, semis / 12)

// Pentatonic steps keep any bead run musical.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31]
export const SCALE_STEPS = SCALE.length

// Builds one sound's notes. `random` (0–1) sets pans and the sparkles' pitch.
function recipe(random: () => number) {
  const notes: Note[] = []
  // When each hit lands (stingers only): the screens line their visuals up with these.
  const hits: number[] = []

  const click = (at: number, freq = 5500, level = 1, dur = 0.012, q = 3) =>
    notes.push({ kind: 'click', at, freq, level, dur, q, pan: (random() * 2 - 1) * 0.18 })

  const tone = (at: number, f0: number, f1: number, dur: number, gain: number, attack: number, pan = 0, wave: 'sine' | 'triangle' = 'sine') =>
    notes.push({ kind: 'tone', at, wave, f0, f1, dur, gain, attack, pan })

  // Soft glass chime: a sine with a quick ring, plus a quiet octave.
  const chime = (at: number, f: number, gain: number, dur: number) => {
    const pan = (random() * 2 - 1) * 0.25
    tone(at, f, f, dur, gain, 0.003, pan)
    tone(at, f * 2, f * 2, dur * 0.5, gain * 0.3, 0.002, pan)
  }

  // n clicks over `span` seconds, pitch f0 → f1, speeding up (accel < 1) or slowing (accel > 1).
  // Returns when the run ends.
  const ratchet = (at: number, n: number, span: number, f0: number, f1: number, level: number, accel: number) => {
    const steps = Array.from({ length: n }, (_, i) => Math.pow(accel, i))
    const total = steps.reduce((a, b) => a + b, 0)
    let t = 0
    for (let i = 0; i < n; i++) {
      click(at + t, f0 * Math.pow(f1 / f0, n === 1 ? 0 : i / (n - 1)), level * (0.75 + 0.25 * (i / Math.max(1, n - 1))), 0.009)
      t += (steps[i] / total) * span
    }
    return at + span
  }

  const paper = (at: number, dur: number, up: boolean) => notes.push({ kind: 'paper', at, dur, up, level: 1, pan: up ? 0.08 : -0.08 })

  // ---- Achievement kit: only the stingers use these. ----

  const burst = (at: number, dur: number, gain: number, filter: 'bandpass' | 'highpass', f0: number, f1 = f0, q = 0.9, attack = 0.001, hall = 0, pan = 0) =>
    notes.push({ kind: 'noise', at, dur, gain, filter, f0, f1, q, attack, pan, hall })

  // The hit: a short punchy body (mid-low, not a sub thunk), a snare-like crack and a crash.
  const hit = (at: number, level = 1, crashDur = 1.1) => {
    hits.push(at)
    tone(at, 210, 75, 0.14, 0.5 * level, 0.001)
    burst(at, 0.13, 0.55 * level, 'bandpass', 1900, 1900, 0.8, 0.001, 0.35)
    burst(at, 0.03, 0.4 * level, 'highpass', 3000)
    burst(at, crashDur, 0.22 * level, 'highpass', 5200, 4000, 0.9, 0.002, 0.5, 0.1)
  }

  const brass = (at: number, semis: number[], dur: number, gain: number, swell = false) => {
    for (const s of semis) notes.push({ kind: 'brass', at, freq: note(s), dur, gain, swell, pan: (s % 2 ? 1 : -1) * 0.2, hall: 0.35 })
  }

  // Mallet: a bouncy, bright struck note (the "da-da-da").
  const mallet = (at: number, f: number, gain = 0.11, dur = 0.2) => {
    const pan = (random() * 2 - 1) * 0.2
    tone(at, f, f, dur, gain, 0.0015, pan, 'triangle')
    tone(at, f * 2, f * 2, dur * 0.45, gain * 0.45, 0.001, pan)
    tone(at, f * 4, f * 4, 0.03, gain * 0.3, 0.0008, pan)
    click(at, 6000, 0.35, 0.006)
  }

  // A clap: three quick noise slaps and a short tail.
  const clap = (at: number, level = 1) => {
    for (const d of [0, 0.011, 0.022]) click(at + d, 1300, 0.9 * level, 0.02, 1)
    click(at + 0.03, 1500, 0.5 * level, 0.09, 0.8)
  }

  return { notes, hits, random, click, tone, chime, ratchet, paper, burst, hit, brass, mallet, clap }
}

type Recipe = ReturnType<typeof recipe>

function build(name: SoundName, r: Recipe) {
  switch (name) {
    case 'tap': // one crisp "chick"
      r.click(0, 5800, 1)
      break
    case 'select': // "ka-chick"
      r.click(0, 1700, 0.6, 0.01, 2)
      r.click(0.032, 6200, 1)
      r.chime(0.032, note(19), 0.025, 0.12)
      break
    case 'back': // "chick-ka"
      r.click(0, 5600, 0.85)
      r.click(0.03, 1600, 0.55, 0.01, 2)
      break
    case 'bubble': // a round, wet "tok"
      r.click(0, 2600, 0.8, 0.014, 5)
      r.tone(0, 1900, 950, 0.03, 0.05, 0.0008)
      break
    case 'wipe': // a fast rising ratchet, "chk-chk-chk-chick"
      r.click(r.ratchet(0, 5, 0.1, 2400, 6800, 0.65, 0.75), 7000, 0.9)
      break
    case 'swipe': // a short falling ratchet
      r.ratchet(0, 3, 0.06, 6000, 3000, 0.6, 1.1)
      break
    case 'sheetUp': // paper sliding up, then a soft flap as it settles
      r.paper(0, 0.17, true)
      r.click(0.17, 2600, 0.55, 0.02, 1.2)
      break
    case 'sheetDown': // the paper sliding away, ending on a softer flap
      r.paper(0, 0.15, false)
      r.click(0.14, 2000, 0.45, 0.02, 1.2)
      break
    case 'remove': // "chick-chk", falling
      r.ratchet(0, 3, 0.07, 5200, 2200, 0.7, 1.2)
      break
    case 'undo': // the same, rising, then a latch
      r.click(r.ratchet(0, 3, 0.06, 2200, 5200, 0.7, 0.8), 6400, 0.9)
      break
    case 'switch': // a latch, "click-clack"
      r.click(0, 4200, 0.8)
      r.click(0.022, 6200, 0.7)
      break
    case 'error': // two dull taps, "tuk-tuk"
      r.click(0, 700, 0.9, 0.018, 4)
      r.click(0.09, 650, 0.9, 0.018, 4)
      break
    case 'log': // "ka-chick-chick", then a soft two-note chime
      r.click(0, 1700, 0.7, 0.01, 2)
      r.click(0.03, 6200, 1)
      r.click(0.065, 7000, 0.85)
      r.chime(0.07, note(7), 0.06, 0.3)
      r.chime(0.13, note(12), 0.06, 0.4)
      break
    case 'rankUp': {
      // Wind-up: a click run and a whoosh, then a beat of silence.
      r.burst(0, 0.22, 0.22, 'bandpass', 900, 8000, 1.1, 0.15)
      const h1 = r.ratchet(0, 8, 0.22, 2000, 7500, 0.55, 0.8) + 0.04
      // Hit 1: a brass blat.
      r.hit(h1, 1)
      r.brass(h1, [-24, -17, -12, -8], 0.32, 0.045)
      r.chime(h1, note(12), 0.07, 0.4)
      // "da-da-da": a bouncy run up.
      ;[4, 7, 12].forEach((s, i) => r.mallet(h1 + 0.2 + i * 0.085, note(s), 0.12, 0.16))
      // Hit 2, "DAAA": the held, swelling victory chord with a clap and sparkles.
      const h2 = h1 + 0.2 + 3 * 0.085 + 0.02
      r.hit(h2, 0.85, 1.3)
      r.clap(h2, 1)
      r.brass(h2, [-12, -8, -5, 0, 4], 1.0, 0.04, true)
      r.mallet(h2, note(16), 0.12, 0.6)
      r.chime(h2, note(24), 0.06, 0.9)
      for (let i = 0; i < 10; i++) r.click(h2 + 0.1 + i * 0.055, 6500 + r.random() * 2800, 0.4, 0.006)
      break
    }
    case 'graduate': {
      // Wind-up: a longer run and whoosh, then a beat of silence.
      r.burst(0, 0.34, 0.25, 'bandpass', 700, 9000, 1.1, 0.25)
      const h1 = r.ratchet(0, 12, 0.34, 1600, 8000, 0.55, 0.84) + 0.05
      r.hit(h1, 1.1)
      r.brass(h1, [-24, -17, -12, -8], 0.3, 0.05)
      // Fanfare, part one: "ta-ta-ta-TAA".
      ;[-5, 0, 4].forEach((s, i) => r.mallet(h1 + 0.18 + i * 0.085, note(s), 0.12, 0.15))
      const h2 = h1 + 0.18 + 3 * 0.085
      r.hit(h2, 0.8, 0.6)
      r.brass(h2, [-17, -10, -5, 2], 0.3, 0.045)
      r.mallet(h2, note(7), 0.12, 0.25)
      // Part two: a quick run to the top.
      ;[7, 12, 16].forEach((s, i) => r.mallet(h2 + 0.2 + i * 0.075, note(s), 0.12, 0.13))
      // The finish: the biggest hit, claps and a long swelling victory chord.
      const top = h2 + 0.2 + 3 * 0.075 + 0.03
      r.hit(top, 1.15, 1.8)
      r.clap(top, 1.1)
      r.clap(top + 0.16, 0.8)
      r.brass(top, [-24, -12, -8, -5, 0, 4, 7], 1.6, 0.035, true)
      r.mallet(top, note(19), 0.13, 0.9)
      r.chime(top, note(24), 0.07, 1.4)
      for (let i = 0; i < 18; i++) r.click(top + 0.12 + i * 0.05, 6000 + r.random() * 3200, 0.4, 0.006)
      break
    }
  }
}

export function sound(name: Everyday, random?: () => number): EverydayNote[]
export function sound(name: Stinger, random?: () => number): Note[]
export function sound(name: SoundName, random?: () => number): Note[]
export function sound(name: SoundName, random: () => number = Math.random): Note[] {
  const r = recipe(random)
  build(name, r)
  return r.notes
}

// When a stinger's hits land, in seconds from its start.
export function hits(name: Stinger): number[] {
  const r = recipe(() => 0.5)
  build(name, r)
  return r.hits
}

// One bead landing: a tiny tick and a small glass note on step `step` of the scale.
export function bead(step: number, random: () => number = Math.random): EverydayNote[] {
  const r = recipe(random)
  r.click(0, 6500, 0.45, 0.007)
  r.chime(0, note(SCALE[Math.min(step, SCALE_STEPS - 1)] - 12), 0.035, 0.12)
  return r.notes as EverydayNote[]
}

// Which scale step bead k (of n in one stat) plays: from the bottom, climbing through the scale.
export const beadStep = (k: number, n: number) => Math.floor((k / n) * SCALE_STEPS)
