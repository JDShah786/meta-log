// The sound player (step 9): turns a sound's notes (sounds.ts) into Web Audio. Starts on the first
// tap (phones only allow audio after one), follows the iPhone silent switch, and never breaks the
// app: without Web Audio it just stays quiet.
//
// Routing: each sound gets its own voice (dry, plus a wet send for the hall echo) so it can be
// faded out alone; voices and the echo meet at the master volume, then a gentle limiter.

import { bead, sound, type Note, type SoundName } from './sounds'

export interface Sfx {
  // Hands back a stop that fades just that sound out (~0.1 s).
  play(name: SoundName): () => void
  // One bead landing on the points chart, on step `step` of the scale.
  bead(step: number): void
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
const HALL = 0.3
const FADE = 0.1
const nothing = () => {}

interface Voice {
  dry: GainNode
  // The echo send, made the first time a note needs it.
  wet: () => GainNode
  // Every level this voice has: what a stop fades.
  levels: () => GainNode[]
}

export function createPlayer({ makeContext, session, random = Math.random }: Options): Sfx {
  let on = true
  let broken = false
  let ctx: AudioContext | null = null
  let limiter: DynamicsCompressorNode
  let noise: AudioBuffer
  let room: AudioBuffer
  // The master volume and the echo feeding it. Remade after Sound is turned off, which
  // disconnects the old master and so cuts everything still playing.
  let bus: { master: GainNode; hall: GainNode } | null = null

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
        // The hall's echo: 1.4 s of decaying noise.
        const len = Math.floor(c.sampleRate * 1.4)
        room = c.createBuffer(2, len, c.sampleRate)
        for (let ch = 0; ch < 2; ch++) {
          const r = room.getChannelData(ch)
          for (let i = 0; i < len; i++) r[i] = (random() * 2 - 1) * Math.pow(1 - i / len, 2.6)
        }
        // A gentle limiter only, so stacked sounds never spike. No boost.
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

  const busOf = (c: AudioContext) => {
    if (!bus) {
      const master = c.createGain()
      master.gain.value = MASTER
      master.connect(limiter)
      const hall = c.createGain()
      hall.gain.value = HALL
      const verb = c.createConvolver()
      verb.buffer = room
      hall.connect(verb).connect(master)
      bus = { master, hall }
    }
    return bus
  }

  const voiceOf = (c: AudioContext): Voice => {
    const { master, hall } = busOf(c)
    const dry = c.createGain()
    dry.gain.value = 1
    dry.connect(master)
    let wet: GainNode | null = null
    return {
      dry,
      wet: () => {
        if (!wet) {
          wet = c.createGain()
          wet.gain.value = 1
          wet.connect(hall)
        }
        return wet
      },
      levels: () => (wet ? [dry, wet] : [dry]),
    }
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

  // Sends a note's level into the hall echo too.
  const echo = (c: AudioContext, v: Voice, g: GainNode, amount: number) => {
    if (!amount) return
    const send = c.createGain()
    send.gain.value = amount
    g.connect(send).connect(v.wet())
  }

  const tone = (c: AudioContext, v: Voice, t: number, wave: OscillatorType, f0: number, f1: number, dur: number, gain: number, attack: number, pan: number) => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = wave
    o.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur)
    envelope(g, t, gain, attack, dur)
    o.connect(g).connect(panned(c, v.dry, pan))
    o.start(t)
    o.stop(t + dur + 0.03)
  }

  const render = (c: AudioContext, v: Voice, n: Note) => {
    const t = c.currentTime + n.at
    switch (n.kind) {
      case 'tone':
        return tone(c, v, t, n.wave, n.f0, n.f1, n.dur, n.gain, n.attack, n.pan)

      case 'click': {
        const s = c.createBufferSource()
        s.buffer = noise
        const bp = c.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = n.freq
        bp.Q.value = n.q
        const g = c.createGain()
        envelope(g, t, 0.32 * n.level, 0.0005, n.dur)
        s.connect(bp).connect(g).connect(panned(c, v.dry, n.pan))
        s.start(t, random() * 0.8)
        s.stop(t + n.dur + 0.02)
        // The faint glassy ping that makes a click feel finished.
        return tone(c, v, t, 'sine', n.freq * 0.82, n.freq * 0.82, 0.018, 0.025 * n.level, 0.0005, n.pan)
      }

      case 'paper': {
        // Noise through a sweeping bandpass, with a fast random flutter on its level.
        const s = c.createBufferSource()
        s.buffer = noise
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
        s.connect(hp).connect(bp).connect(crinkle).connect(g).connect(panned(c, v.dry, n.pan))
        s.start(t, random() * 0.5)
        s.stop(t + n.dur + 0.02)
        return
      }

      case 'noise': {
        const s = c.createBufferSource()
        s.buffer = noise
        const f = c.createBiquadFilter()
        f.type = n.filter
        f.Q.value = n.q
        f.frequency.setValueAtTime(n.f0, t)
        if (n.f1 !== n.f0) f.frequency.exponentialRampToValueAtTime(n.f1, t + n.dur)
        const g = c.createGain()
        envelope(g, t, n.gain, n.attack, n.dur)
        s.connect(f).connect(g).connect(panned(c, v.dry, n.pan))
        echo(c, v, g, n.hall)
        s.start(t, random() * 0.4)
        s.stop(t + n.dur + 0.02)
        return
      }

      case 'brass': {
        for (const [wave, detune, mul] of [
          ['sawtooth', -8, 1],
          ['sawtooth', 8, 1],
          ['square', 0, 0.6],
        ] as const) {
          const o = c.createOscillator()
          o.type = wave
          o.frequency.value = n.freq
          o.detune.value = detune
          const lp = c.createBiquadFilter()
          lp.type = 'lowpass'
          lp.Q.value = 1.4
          if (n.swell) {
            lp.frequency.setValueAtTime(1600, t)
            lp.frequency.exponentialRampToValueAtTime(7500, t + n.dur * 0.35)
            lp.frequency.exponentialRampToValueAtTime(2400, t + n.dur)
          } else {
            lp.frequency.setValueAtTime(1400, t)
            lp.frequency.exponentialRampToValueAtTime(8500, t + 0.02)
            lp.frequency.exponentialRampToValueAtTime(1800, t + n.dur)
          }
          const g = c.createGain()
          g.gain.setValueAtTime(0.0001, t)
          g.gain.linearRampToValueAtTime(n.gain * mul, t + 0.004)
          g.gain.setValueAtTime(n.gain * mul * 0.85, t + n.dur * 0.6)
          g.gain.exponentialRampToValueAtTime(0.0001, t + n.dur)
          o.connect(lp).connect(g).connect(panned(c, v.dry, n.pan))
          echo(c, v, g, n.hall)
          o.start(t)
          o.stop(t + n.dur + 0.03)
        }
        return
      }
    }
  }

  // Plays notes on a fresh voice; hands back a stop that fades that voice out.
  const perform = (notes: () => Note[]) => {
    if (!on) return nothing
    try {
      const c = audio()
      if (!c) return nothing
      const v = voiceOf(c)
      for (const n of notes()) render(c, v, n)
      return () => {
        try {
          const now = c.currentTime
          for (const g of v.levels()) {
            g.gain.cancelScheduledValues(now)
            g.gain.setValueAtTime(g.gain.value, now)
            g.gain.linearRampToValueAtTime(0.0001, now + FADE)
          }
        } catch {
          // Stopping is never worth breaking the app for either.
        }
      }
    } catch {
      // A sound is never worth breaking the app for.
      return nothing
    }
  }

  return {
    play: (name) => perform(() => sound(name, random)),
    bead: (step) => void perform(() => bead(step, random)),
    setOn(next) {
      on = next
      if (!on && bus) {
        bus.master.disconnect()
        bus = null
      }
    },
    unlock() {
      if (on) audio()
    },
  }
}
