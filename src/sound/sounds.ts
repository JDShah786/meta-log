// Sound recipes (step 9), from the approved prototype (design/mockups/sounds.html). Pure: each
// recipe returns the notes to play and never touches Web Audio; the player (player.ts) plays them.
// Everything is made of tiny clicks (a few milliseconds of filtered noise), soft sine tones and
// a paper slide. Quiet, crisp, close to the ear, a touch left or right.

export type Note =
  // A click: noise through a resonant bandpass at `freq` (~1.5 kHz a soft "ka", ~6 kHz a sharp
  // "chick"). The player adds its faint glassy ping.
  | { kind: 'click'; at: number; freq: number; level: number; dur: number; q: number; pan: number }
  // A sine tone gliding from f0 to f1.
  | { kind: 'tone'; at: number; f0: number; f1: number; dur: number; gain: number; attack: number; pan: number }
  // Paper sliding: brightening (a sheet coming up) or darkening (a sheet going away).
  | { kind: 'paper'; at: number; dur: number; up: boolean; level: number; pan: number }

export const EVERYDAY = ['tap', 'select', 'back', 'bubble', 'wipe', 'swipe', 'sheetUp', 'sheetDown', 'remove', 'undo', 'switch', 'error'] as const
export type SoundName = (typeof EVERYDAY)[number]

// A note from C6, `semis` semitones up.
const note = (semis: number) => 1046.5 * Math.pow(2, semis / 12)

// Builds one sound's notes. `random` (0–1) sets each click's and chime's pan.
function recipe(random: () => number) {
  const notes: Note[] = []

  const click = (at: number, freq = 5500, level = 1, dur = 0.012, q = 3) =>
    notes.push({ kind: 'click', at, freq, level, dur, q, pan: (random() * 2 - 1) * 0.18 })

  const tone = (at: number, f0: number, f1: number, dur: number, gain: number, attack: number, pan = 0) =>
    notes.push({ kind: 'tone', at, f0, f1, dur, gain, attack, pan })

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

  return { notes, click, tone, chime, ratchet, paper }
}

export function sound(name: SoundName, random: () => number = Math.random): Note[] {
  const r = recipe(random)
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
  }
  return r.notes
}
