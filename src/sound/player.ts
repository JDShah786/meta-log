// The sound player (step 9): turns a sound's notes (sounds.ts) into Web Audio. Starts on the first
// tap (phones only allow audio after one), follows the iPhone silent switch, and never breaks the
// app: without Web Audio it just stays quiet.

import { sound, type Note, type SoundName } from './sounds'

export interface Sfx {
  play(name: SoundName): void
  // Off cuts off anything still playing.
  setOn(on: boolean): void
  // Called on every tap: makes (or wakes) the audio while the phone allows it.
  unlock(): void
}

interface Options {
  makeContext: () => AudioContext
  // navigator.audioSession where the phone has it (Safari 16.4+).
  session?: { type: string }
  random?: () => number
}

const MASTER = 0.78

export function createPlayer({ makeContext, session, random = Math.random }: Options): Sfx {
  let on = true
  let broken = false
  let ctx: AudioContext | null = null
  let limiter: DynamicsCompressorNode
  let noise: AudioBuffer
  // The master volume. Remade after Sound is turned off, which disconnects the old one.
  let master: GainNode | null = null

  const audio = () => {
    if (broken) return null
    if (!ctx) {
      try {
        // Follow the silent switch and mix with the user's music.
        if (session) session.type = 'ambient'
        const c = makeContext()
        noise = c.createBuffer(1, c.sampleRate, c.sampleRate)
        const d = noise.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = random() * 2 - 1
        // A gentle limiter only, so stacked clicks never spike. No boost.
        limiter = c.createDynamicsCompressor()
        limiter.threshold.value = -6
        limiter.knee.value = 4
        limiter.ratio.value = 3
        limiter.attack.value = 0.001
        limiter.release.value = 0.08
        limiter.connect(c.destination)
        ctx = c
      } catch {
        broken = true
        return null
      }
    }
    // The iPhone suspends audio in the background; wake it.
    if (ctx.state !== 'running') void ctx.resume().catch(() => {})
    return ctx
  }

  const bus = (c: AudioContext) => {
    if (!master) {
      master = c.createGain()
      master.gain.value = MASTER
      master.connect(limiter)
    }
    return master
  }

  const panned = (c: AudioContext, out: AudioNode, pan: number): AudioNode => {
    if (!c.createStereoPanner) return out
    const p = c.createStereoPanner()
    p.pan.value = pan
    p.connect(out)
    return p
  }

  const envelope = (g: GainNode, t: number, peak: number, attack: number, dur: number) => {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  }

  const tone = (c: AudioContext, out: AudioNode, t: number, f0: number, f1: number, dur: number, gain: number, attack: number, pan: number) => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur)
    envelope(g, t, gain, attack, dur)
    o.connect(g).connect(panned(c, out, pan))
    o.start(t)
    o.stop(t + dur + 0.03)
  }

  const render = (c: AudioContext, out: AudioNode, n: Note) => {
    const t = c.currentTime + n.at
    if (n.kind === 'tone') return tone(c, out, t, n.f0, n.f1, n.dur, n.gain, n.attack, n.pan)
    const s = c.createBufferSource()
    s.buffer = noise
    if (n.kind === 'click') {
      const bp = c.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = n.freq
      bp.Q.value = n.q
      const g = c.createGain()
      envelope(g, t, 0.32 * n.level, 0.0005, n.dur)
      s.connect(bp).connect(g).connect(panned(c, out, n.pan))
      s.start(t, random() * 0.8)
      s.stop(t + n.dur + 0.02)
      // The faint glassy ping that makes a click feel finished.
      tone(c, out, t, n.freq * 0.82, n.freq * 0.82, 0.018, 0.025 * n.level, 0.0005, n.pan)
      return
    }
    // Paper: noise through a sweeping bandpass, with a fast random flutter on its level.
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1200
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 0.9
    bp.frequency.setValueAtTime(n.up ? 2200 : 5200, t)
    bp.frequency.exponentialRampToValueAtTime(n.up ? 5600 : 2000, t + n.dur)
    const crinkle = c.createGain()
    crinkle.gain.setValueAtTime(0.4, t)
    for (let x = 0; x < n.dur; x += 0.007) crinkle.gain.setValueAtTime(0.35 + random() * 0.65, t + x)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.28 * n.level, t + n.dur * (n.up ? 0.6 : 0.25))
    g.gain.exponentialRampToValueAtTime(0.0001, t + n.dur)
    s.connect(hp).connect(bp).connect(crinkle).connect(g).connect(panned(c, out, n.pan))
    s.start(t, random() * 0.5)
    s.stop(t + n.dur + 0.02)
  }

  return {
    play(name) {
      if (!on) return
      try {
        const c = audio()
        if (!c) return
        const out = bus(c)
        for (const n of sound(name, random)) render(c, out, n)
      } catch {
        // A sound is never worth breaking the app for.
      }
    },
    setOn(next) {
      on = next
      if (!on && master) {
        master.disconnect()
        master = null
      }
    },
    unlock() {
      if (on) audio()
    },
  }
}
