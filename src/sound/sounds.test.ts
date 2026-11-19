// Step 9a: the everyday sound recipes (approved prototype, design/mockups/sounds.html).
// Pure: a recipe returns the notes to play, it never touches Web Audio.
import { describe, expect, it } from 'vitest'
import { EVERYDAY, sound, type Note } from './sounds'

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
