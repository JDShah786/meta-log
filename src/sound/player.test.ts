// Step 9a: the player turns a sound's notes into Web Audio. Tests use a fake AudioContext that
// records what was made, connected and started.
import { describe, expect, it } from 'vitest'
import { createPlayer } from './player'

class FakeParam {
  value = 0
  // Every scheduled change: [what, value, time].
  events: [string, number, number][] = []
  setValueAtTime(v: number, t = 0) {
    this.value = v
    this.events.push(['set', v, t])
    return this
  }
  linearRampToValueAtTime(v: number, t = 0) {
    this.value = v
    this.events.push(['linear', v, t])
    return this
  }
  exponentialRampToValueAtTime(v: number, t = 0) {
    this.value = v
    this.events.push(['exponential', v, t])
    return this
  }
  cancelScheduledValues() {
    return this
  }
}

class FakeNode {
  out: FakeNode[] = []
  disconnected = false
  readonly ctx: FakeContext
  readonly kind: string
  constructor(ctx: FakeContext, kind: string) {
    this.ctx = ctx
    this.kind = kind
  }
  connect(n: FakeNode) {
    this.out.push(n)
    return n
  }
  disconnect() {
    this.disconnected = true
    this.out = []
  }
}

class FakeSource extends FakeNode {
  buffer: unknown = null
  type = 'sine'
  frequency = new FakeParam()
  detune = new FakeParam()
  started: number[] = []
  start(at = 0) {
    this.started.push(at)
  }
  stop() {}
}

class FakeContext {
  state: 'suspended' | 'running' = 'suspended'
  currentTime = 5
  sampleRate = 8000
  resumes = 0
  destination = new FakeNode(this, 'destination')
  nodes: FakeNode[] = []
  private add<T extends FakeNode>(n: T) {
    this.nodes.push(n)
    return n
  }
  resume() {
    this.resumes++
    this.state = 'running'
    return Promise.resolve()
  }
  createGain() {
    return this.add(Object.assign(new FakeNode(this, 'gain'), { gain: new FakeParam() }))
  }
  createStereoPanner() {
    return this.add(Object.assign(new FakeNode(this, 'panner'), { pan: new FakeParam() }))
  }
  createBiquadFilter() {
    return this.add(Object.assign(new FakeNode(this, 'filter'), { type: 'lowpass', frequency: new FakeParam(), Q: new FakeParam() }))
  }
  createDynamicsCompressor() {
    const c = new FakeNode(this, 'compressor')
    return this.add(
      Object.assign(c, { threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam() }),
    )
  }
  createConvolver() {
    return this.add(Object.assign(new FakeNode(this, 'convolver'), { buffer: null }))
  }
  createOscillator() {
    return this.add(new FakeSource(this, 'oscillator'))
  }
  createBufferSource() {
    return this.add(new FakeSource(this, 'buffer-source'))
  }
  createBuffer(channels: number, length: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length))
    return { getChannelData: (ch: number) => data[ch] }
  }
  sources() {
    return this.nodes.filter((n): n is FakeSource => n instanceof FakeSource)
  }
  starts() {
    return this.sources().flatMap((s) => s.started)
  }
}

// Does sound from `node` reach the speakers?
const reaches = (node: FakeNode, target: FakeNode): boolean => node === target || node.out.some((n) => reaches(n, target))

const setup = (session?: { type: string }) => {
  const made: FakeContext[] = []
  const player = createPlayer({
    makeContext: () => {
      const c = new FakeContext()
      made.push(c)
      return c as unknown as AudioContext
    },
    session,
    random: () => 0.5,
  })
  return { player, made, ctx: () => made[0] }
}

describe('sound player (step 9a)', () => {
  it('makes no audio until the first tap, then only one context', () => {
    const { player, made } = setup()
    expect(made).toHaveLength(0)
    player.unlock()
    player.unlock()
    player.play('tap')
    expect(made).toHaveLength(1)
  })

  it('wakes a sleeping context (the iPhone suspends it in the background)', () => {
    const { player, ctx } = setup()
    player.unlock()
    expect(ctx().resumes).toBe(1)
    ctx().state = 'suspended'
    player.play('tap')
    expect(ctx().resumes).toBe(2)
  })

  it('asks for "ambient" audio: follows the silent switch and never pauses music', () => {
    const session = { type: 'auto' }
    const { player } = setup(session)
    player.unlock()
    expect(session.type).toBe('ambient')
  })

  it('works on phones without audioSession', () => {
    const { player } = setup(undefined)
    expect(() => player.unlock()).not.toThrow()
  })

  it('sends everything through a master volume of 0.78, then a gentle limiter, to the speakers', () => {
    const { player, ctx } = setup()
    player.play('select')
    const c = ctx()
    const limiter = c.nodes.find((n) => n.kind === 'compressor') as FakeNode & { threshold: FakeParam; ratio: FakeParam }
    expect(limiter.out).toContain(c.destination)
    expect(limiter.threshold.value).toBeLessThan(0)
    expect(limiter.ratio.value).toBeGreaterThan(1)
    expect(limiter.ratio.value).toBeLessThanOrEqual(4)
    const master = c.nodes.find((n) => n.kind === 'gain' && n.out.includes(limiter)) as FakeNode & { gain: FakeParam }
    expect(master.gain.value).toBeCloseTo(0.78)
    // Every sound source ends up at the master.
    expect(c.sources().length).toBeGreaterThan(0)
    for (const s of c.sources()) expect(reaches(s, master)).toBe(true)
  })

  it("plays each note at its time: select's second click starts ~32 ms after the first", () => {
    const { player, ctx } = setup()
    player.play('select')
    const starts = ctx().starts()
    expect(Math.min(...starts)).toBeCloseTo(5, 3)
    expect(starts.some((t) => Math.abs(t - 5.032) < 0.001)).toBe(true)
  })

  it('a bigger sound makes more sources than a tap', () => {
    const { player, ctx } = setup()
    player.play('tap')
    const tap = ctx().sources().length
    player.play('wipe')
    expect(ctx().sources().length - tap).toBeGreaterThan(tap)
  })

  it('plays nothing when Sound is off', () => {
    const { player, ctx } = setup()
    player.unlock()
    player.setOn(false)
    player.play('select')
    expect(ctx().sources()).toHaveLength(0)
  })

  it('turning Sound off cuts off a sound that is still playing; on again, sounds play again', () => {
    const { player, ctx } = setup()
    player.play('wipe')
    const c = ctx()
    const playing = c.sources()
    player.setOn(false)
    // Nothing that was playing can reach the speakers any more.
    for (const s of playing) expect(reaches(s, c.destination)).toBe(false)
    player.setOn(true)
    player.play('tap')
    const fresh = c.sources().filter((s) => !playing.includes(s))
    expect(fresh.length).toBeGreaterThan(0)
    for (const s of fresh) expect(reaches(s, c.destination)).toBe(true)
  })

  it('never breaks the app, even with no Web Audio at all', () => {
    const player = createPlayer({
      makeContext: () => {
        throw new Error('no Web Audio')
      },
    })
    expect(() => player.unlock()).not.toThrow()
    expect(() => player.play('tap')).not.toThrow()
  })
})

describe('sound player: stingers, beads and stopping (step 9b)', () => {
  const voices = (c: FakeContext, master: FakeNode) => c.nodes.filter((n) => n.kind === 'gain' && n.out.includes(master)) as (FakeNode & { gain: FakeParam })[]
  const masterOf = (c: FakeContext) => {
    const limiter = c.nodes.find((n) => n.kind === 'compressor')!
    return c.nodes.find((n) => n.kind === 'gain' && n.out.includes(limiter))!
  }

  it('stingers ring in the hall echo; everyday sounds stay dry', () => {
    const { player, ctx } = setup()
    player.play('tap')
    const c = ctx()
    const hall = c.nodes.find((n) => n.kind === 'convolver')
    const dry = c.sources()
    expect(hall === undefined || dry.every((s) => !reaches(s, hall))).toBe(true)
    player.play('rankUp')
    const echo = c.nodes.find((n) => n.kind === 'convolver')!
    expect(c.sources().filter((s) => !dry.includes(s)).some((s) => reaches(s, echo))).toBe(true)
    // The echo goes through the master volume too.
    expect(reaches(echo, masterOf(c))).toBe(true)
  })

  it('turning Sound off cuts a stinger, echo and all', () => {
    const { player, ctx } = setup()
    player.play('graduate')
    const c = ctx()
    const playing = [...c.sources(), ...c.nodes.filter((n) => n.kind === 'convolver')]
    player.setOn(false)
    for (const s of playing) expect(reaches(s, c.destination)).toBe(false)
  })

  it('play hands back a stop that fades just that sound out within ~0.1 s', () => {
    const { player, ctx } = setup()
    const stop = player.play('rankUp')
    player.play('tap')
    const c = ctx()
    const [stinger, tap] = voices(c, masterOf(c))
    stop()
    const fade = stinger.gain.events.filter(([what]) => what !== 'set')
    expect(fade.length).toBeGreaterThan(0)
    const [, to, at] = fade.at(-1)!
    expect(to).toBeLessThanOrEqual(0.001)
    expect(at).toBeGreaterThan(c.currentTime)
    expect(at).toBeLessThanOrEqual(c.currentTime + 0.12)
    expect(tap.gain.events.filter(([what]) => what !== 'set')).toHaveLength(0)
  })

  it('stop is safe to call when nothing played (Sound off, or no Web Audio)', () => {
    const { player } = setup()
    player.setOn(false)
    expect(() => player.play('rankUp')()).not.toThrow()
    const broken = createPlayer({
      makeContext: () => {
        throw new Error('no Web Audio')
      },
    })
    expect(() => broken.play('graduate')()).not.toThrow()
  })

  it('a bead plays its tick and note; nothing when off', () => {
    const { player, ctx } = setup()
    player.bead(3)
    expect(ctx().sources().length).toBeGreaterThan(0)
    const before = ctx().sources().length
    player.setOn(false)
    player.bead(4)
    expect(ctx().sources()).toHaveLength(before)
  })
})
