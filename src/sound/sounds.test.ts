// Step 9a: the everyday sound recipes (approved prototype, design/mockups/sounds.html).
// Pure: a recipe returns the notes to play, it never touches Web Audio.
import { describe, expect, it } from 'vitest'
import { bead, beadStep, EVERYDAY, hits, SCALE_STEPS, sound, STINGERS, type Note } from './sounds'

// A fixed "random" so every run gives the same notes.
const fixed = (value: number) => () => value

const clicks = (notes: Note[]) => notes.filter((n) => n.kind === 'click')
const freqs = (notes: Note[]) => clicks(notes).map((n) => n.freq)
const end = (n: Note) => n.at + n.dur
const rising = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1])
const falling = (xs: number[]) => xs.every((x, i) => i === 0 || x < xs[i - 1])

describe('sound recipes (step 9a)', () => {
  it('has the twelve everyday sounds', () => {
    expect([...EVERYDAY].sort()).toEqual(
      ['tap', 'select', 'back', 'bubble', 'wipe', 'swipe', 'sheetUp', 'sheetDown', 'remove', 'undo', 'switch', 'error'].sort(),
    )
  })

  it.each([...EVERYDAY])('%s: some notes, at sane times, quiet, only slightly panned, and short', (name) => {
    const notes = sound(name, Math.random)
    expect(notes.length).toBeGreaterThan(0)
    for (const n of notes) {
      expect(n.at).toBeGreaterThanOrEqual(0)
      expect(n.dur).toBeGreaterThan(0)
      expect(Math.abs(n.pan)).toBeLessThanOrEqual(0.25)
      const level = n.kind === 'tone' ? n.gain : n.level
      expect(level).toBeGreaterThan(0)
      expect(level).toBeLessThanOrEqual(1)
    }
    // Crisp and snappy: every everyday sound is over within 0.4 s.
    expect(Math.max(...notes.map(end))).toBeLessThanOrEqual(0.4)
  })

  it('gives the same notes for the same random numbers', () => {
    for (const name of EVERYDAY) expect(sound(name, fixed(0.3))).toEqual(sound(name, fixed(0.3)))
  })

  it('pans clicks a touch left or right, from the random number', () => {
    const left = clicks(sound('tap', fixed(0)))[0].pan
    const right = clicks(sound('tap', fixed(1)))[0].pan
    expect(left).toBeLessThan(0)
    expect(right).toBeGreaterThan(0)
  })

  it('tap is one crisp "chick"', () => {
    const c = clicks(sound('tap', fixed(0.5)))
    expect(c).toHaveLength(1)
    expect(c[0].freq).toBeGreaterThan(4000)
  })

  it('select is "ka-chick": a low click, then a high one about 30 ms later', () => {
    const [ka, chick] = clicks(sound('select', fixed(0.5)))
    expect(ka.freq).toBeLessThan(chick.freq)
    expect(chick.at - ka.at).toBeCloseTo(0.032, 3)
  })

  it('back is "chick-ka": high, then low', () => {
    const [chick, ka] = clicks(sound('back', fixed(0.5)))
    expect(chick.freq).toBeGreaterThan(ka.freq)
    expect(ka.at).toBeGreaterThan(chick.at)
  })

  it('bubble is a round "tok": a click and a quick falling tone', () => {
    const notes = sound('bubble', fixed(0.5))
    expect(clicks(notes)).toHaveLength(1)
    const tone = notes.find((n) => n.kind === 'tone')
    expect(tone && tone.kind === 'tone' && tone.f1 < tone.f0).toBe(true)
  })

  it('wipe is a rising ratchet that ends on its highest click', () => {
    const f = freqs(sound('wipe', fixed(0.5)))
    expect(f.length).toBeGreaterThanOrEqual(4)
    expect(rising(f)).toBe(true)
  })

  it('swipe is a short falling ratchet, quicker than the wipe', () => {
    const swipe = sound('swipe', fixed(0.5))
    expect(freqs(swipe).length).toBeGreaterThanOrEqual(3)
    expect(falling(freqs(swipe))).toBe(true)
    expect(Math.max(...swipe.map(end))).toBeLessThan(Math.max(...sound('wipe', fixed(0.5)).map(end)))
  })

  it('sheets slide like paper: up brightens, down darkens, each ending on a soft flap', () => {
    const up = sound('sheetUp', fixed(0.5))
    const down = sound('sheetDown', fixed(0.5))
    const paperUp = up.find((n) => n.kind === 'paper')
    const paperDown = down.find((n) => n.kind === 'paper')
    expect(paperUp && paperUp.kind === 'paper' && paperUp.up).toBe(true)
    expect(paperDown && paperDown.kind === 'paper' && !paperDown.up).toBe(true)
    // The flap: a soft click after the slide starts.
    expect(clicks(up).at(-1)!.at).toBeGreaterThan(0.1)
    expect(clicks(down).at(-1)!.at).toBeGreaterThan(0.1)
  })

  it('remove falls; undo rises, then latches', () => {
    expect(falling(freqs(sound('remove', fixed(0.5))))).toBe(true)
    const undo = freqs(sound('undo', fixed(0.5)))
    expect(undo.length).toBeGreaterThanOrEqual(4)
    expect(rising(undo.slice(0, -1))).toBe(true)
  })

  it('switch is a latch: two clicks about 22 ms apart', () => {
    const c = clicks(sound('switch', fixed(0.5)))
    expect(c).toHaveLength(2)
    expect(c[1].at - c[0].at).toBeCloseTo(0.022, 3)
  })

  it('error is "tuk-tuk": two dull, low taps about 90 ms apart', () => {
    const c = clicks(sound('error', fixed(0.5)))
    expect(c).toHaveLength(2)
    expect(c.every((n) => n.freq < 1000)).toBe(true)
    expect(c[1].at - c[0].at).toBeCloseTo(0.09, 3)
  })
})

// ---- Step 9b: LOG, beads, rank-up and graduation ----

const tones = (notes: Note[]) => notes.filter((n) => n.kind === 'tone')
const level = (n: Note) => (n.kind === 'click' || n.kind === 'paper' ? n.level : n.gain)
const hall = (n: Note) => ('hall' in n ? (n.hall ?? 0) : 0)
// The hit's punchy body: a short tone falling from ~210 Hz.
const bodies = (notes: Note[]) => tones(notes).filter((n) => n.kind === 'tone' && n.f0 < 300 && n.f1 < n.f0)
// Mallet notes: bright struck triangle tones (the "da-da-da").
const mallets = (notes: Note[]) => tones(notes).filter((n) => n.kind === 'tone' && n.wave === 'triangle')

describe('LOG and bead recipes (step 9b)', () => {
  it('LOG is "ka-chick-chick", then a soft two-note chime going up', () => {
    const notes = sound('log', fixed(0.5))
    const c = clicks(notes)
    expect(c).toHaveLength(3)
    expect(c.map((n) => n.at)).toEqual([0, 0.03, 0.065])
    expect(c[0].freq).toBeLessThan(c[1].freq)
    // Two chime notes after the clicks (each with a quiet octave): the second is higher.
    const starts = [...new Set(tones(notes).map((n) => n.at))].sort((a, b) => a - b)
    expect(starts).toHaveLength(2)
    const root = (at: number) => Math.min(...tones(notes).filter((n) => n.at === at).map((n) => (n.kind === 'tone' ? n.f0 : Infinity)))
    expect(root(starts[1])).toBeGreaterThan(root(starts[0]))
    expect(Math.max(...notes.map(end))).toBeLessThanOrEqual(0.6)
  })

  it('a bead is a tiny tick and a small glass note; a higher step is a higher note', () => {
    const low = bead(0, fixed(0.5))
    const high = bead(5, fixed(0.5))
    expect(clicks(low)).toHaveLength(1)
    const pitch = (notes: Note[]) => Math.min(...tones(notes).map((n) => (n.kind === 'tone' ? n.f0 : Infinity)))
    expect(pitch(high)).toBeGreaterThan(pitch(low))
    // Past the top of the scale it stays on the top note.
    expect(bead(SCALE_STEPS + 5, fixed(0.5))).toEqual(bead(SCALE_STEPS - 1, fixed(0.5)))
    expect(Math.max(...high.map(end))).toBeLessThanOrEqual(0.2)
  })

  it("a stat's beads start at the bottom of the scale and climb, never past the top", () => {
    for (const n of [1, 2, 5, 12, 40]) {
      const steps = Array.from({ length: n }, (_, k) => beadStep(k, n))
      expect(steps[0]).toBe(0)
      expect(steps.every((x, i) => i === 0 || x >= steps[i - 1])).toBe(true)
      expect(Math.max(...steps)).toBeLessThan(SCALE_STEPS)
    }
    expect(beadStep(4, 5)).toBeGreaterThan(beadStep(0, 5))
  })

  it('LOG and beads are quiet and only slightly panned', () => {
    for (const notes of [sound('log', Math.random), bead(3, Math.random)]) {
      for (const n of notes) {
        expect(Math.abs(n.pan)).toBeLessThanOrEqual(0.25)
        expect(level(n)).toBeGreaterThan(0)
        expect(level(n)).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('achievement stingers (step 9b)', () => {
  it('are rank-up and graduation', () => {
    expect([...STINGERS]).toEqual(['rankUp', 'graduate'])
  })

  it('only the stingers use the hall echo', () => {
    for (const name of [...EVERYDAY, 'log'] as const) expect(sound(name, Math.random).every((n) => hall(n) === 0)).toBe(true)
    expect(bead(3, Math.random).every((n) => hall(n) === 0)).toBe(true)
    for (const name of STINGERS) expect(sound(name, Math.random).some((n) => hall(n) > 0)).toBe(true)
  })

  it.each([...STINGERS])('%s: every note at a sane time, level and pan', (name) => {
    for (const n of sound(name, Math.random)) {
      expect(n.at).toBeGreaterThanOrEqual(0)
      expect(n.dur).toBeGreaterThan(0)
      expect(Math.abs(n.pan)).toBeLessThanOrEqual(0.25)
      expect(level(n)).toBeGreaterThan(0)
      expect(level(n)).toBeLessThanOrEqual(1)
    }
  })

  it('rank-up: a rising wind-up, a 40 ms beat of silence, then the first hit', () => {
    const notes = sound('rankUp', fixed(0.5))
    const [first] = hits('rankUp')
    const windUp = clicks(notes).filter((n) => n.at < first)
    expect(windUp.length).toBeGreaterThanOrEqual(6)
    expect(rising(windUp.map((n) => n.freq))).toBe(true)
    // Nothing starts in the beat before the hit.
    expect(notes.some((n) => n.at > first - 0.04 + 0.001 && n.at < first)).toBe(false)
    expect(Math.max(...windUp.map((n) => n.at))).toBeLessThan(first - 0.04 + 0.001)
  })

  it('rank-up: two hits, each a punchy body; between them a rising "da-da-da"', () => {
    const notes = sound('rankUp', fixed(0.5))
    const [h1, h2] = hits('rankUp')
    expect(hits('rankUp')).toHaveLength(2)
    expect(bodies(notes).map((n) => n.at)).toEqual([h1, h2])
    const run = mallets(notes).filter((n) => n.at > h1 && n.at < h2)
    expect(run).toHaveLength(3)
    expect(rising(run.map((n) => (n.kind === 'tone' ? n.f0 : 0)))).toBe(true)
  })

  it('rank-up: the second hit holds a swelling chord, with a clap and sparkles after', () => {
    const notes = sound('rankUp', fixed(0.5))
    const [, h2] = hits('rankUp')
    const chord = notes.filter((n) => n.kind === 'brass' && n.at === h2)
    expect(chord.length).toBeGreaterThanOrEqual(3)
    expect(chord.every((n) => n.kind === 'brass' && n.swell && n.dur >= 1)).toBe(true)
    // The clap: low, quick noise slaps right on the hit.
    expect(clicks(notes).filter((n) => n.at >= h2 && n.at < h2 + 0.05 && n.freq < 2000).length).toBeGreaterThanOrEqual(3)
    // Sparkles: a run of tiny, high clicks after it.
    expect(clicks(notes).filter((n) => n.at > h2 + 0.05 && n.freq > 6000).length).toBeGreaterThanOrEqual(8)
  })

  it('graduation: a longer wind-up, three hits, two claps, a longer chord, and it ends later', () => {
    const grad = sound('graduate', fixed(0.5))
    const up = sound('rankUp', fixed(0.5))
    const [g1, , top] = hits('graduate')
    expect(hits('graduate')).toHaveLength(3)
    expect(bodies(grad).map((n) => n.at)).toEqual(hits('graduate'))
    expect(clicks(grad).filter((n) => n.at < g1).length).toBeGreaterThan(clicks(up).filter((n) => n.at < hits('rankUp')[0]).length)
    const longest = (notes: Note[]) => Math.max(...notes.filter((n) => n.kind === 'brass').map((n) => n.dur))
    expect(longest(grad)).toBeGreaterThan(longest(up))
    expect(clicks(grad).filter((n) => n.at >= top && n.at < top + 0.2 && n.freq < 2000).length).toBeGreaterThanOrEqual(6)
    expect(Math.max(...grad.map(end))).toBeGreaterThan(Math.max(...up.map(end)))
  })

  it("the hit times the screens line up with: rank-up's big hit ~0.74 s, graduation's first ~0.39 s", () => {
    expect(hits('rankUp')[1]).toBeCloseTo(0.735, 2)
    expect(hits('graduate')[0]).toBeCloseTo(0.39, 2)
  })
})
