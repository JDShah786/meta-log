// @vitest-environment jsdom
// Step 9a: which sound each everyday action plays. The app is given a fake player that writes
// down what it was asked to play ('ON' / 'OFF' when it's switched on or off).
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Sfx } from '../sound/player'
import { beadStep } from '../sound/sounds'
import { openDb, type HabitDB } from '../storage/db'
import { createStore, type Store } from '../storage/store'
import { App } from './App'

type User = ReturnType<typeof userEvent.setup>

let dbCount = 0
let db: HabitDB
let store: Store
let reduceMotion = true
let played: string[] = []

const sfx: Sfx = {
  play: (name) => {
    played.push(name)
    // Stopping a sound (a moment tapped away) is written down too.
    return () => void played.push(`stop:${name}`)
  },
  bead: (step) => void played.push(`bead:${step}`),
  setOn: (on) => void played.push(on ? 'ON' : 'OFF'),
  unlock() {},
}

beforeEach(() => {
  db = openDb(`sounds-${dbCount++}`)
  store = createStore(db, () => '2026-10-27')
  reduceMotion = true
  played = []
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('reduce') && reduceMotion,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList
})

afterEach(async () => {
  cleanup()
  await db.delete()
})

const NOW = new Date(2026, 9, 27, 19, 30)
const menu = () => screen.findByRole('navigation', { name: 'Menu' })
const strip = () => screen.getByRole('navigation', { name: 'Sections' })
const wipe = () => document.querySelector('.wipe')
const wipeGone = () => waitFor(() => expect(wipe()).toBeNull(), { timeout: 2000 })

// Opens the app on the menu (motion on unless asked: Reduce Motion means no sounds). Waits until
// the saved Sound setting has reached the player, then forgets everything played so far.
const start = async ({ motion = true, as = store }: { motion?: boolean; as?: Store } = {}) => {
  reduceMotion = !motion
  const user = userEvent.setup()
  render(<App store={as} now={() => NOW} sfx={sfx} />)
  await menu()
  await waitFor(() => expect(played.some((p) => p === 'ON' || p === 'OFF')).toBe(true))
  played = []
  return user
}

// Menu → a section, letting any wipe finish; forgets the sounds of getting there.
const goTo = async (user: User, name: string) => {
  await user.click(within(await menu()).getByRole('button', { name }))
  await wipeGone()
  await screen.findByRole('heading', { level: 1, name })
  played = []
}

const openSettings = async (user: User) => {
  await goTo(user, 'My habits')
  await user.click(await screen.findByRole('button', { name: 'Settings' }))
  const sheet = await screen.findByRole('dialog', { name: 'Settings' })
  played = []
  return sheet
}

describe('sounds: menu, wipe and sections (step 9a)', () => {
  it('a menu word plays select, then the wipe', async () => {
    const user = await start({ motion: true })
    await user.click(within(await menu()).getByRole('button', { name: 'Stats' }))
    expect(played).toEqual(['select', 'wipe'])
  })

  it("the Today's list card plays select, then the wipe", async () => {
    const user = await start({ motion: true })
    await user.click(screen.getByRole('button', { name: /today's list/i }))
    expect(played).toEqual(['select', 'wipe'])
  })

  it('a second menu tap during the wipe is ignored, and silent', async () => {
    const user = await start({ motion: true })
    await user.click(within(await menu()).getByRole('button', { name: 'Stats' }))
    await user.click(within(await menu()).getByRole('button', { name: 'Library' }))
    expect(played).toEqual(['select', 'wipe'])
  })

  it('MENU plays back, then the wipe', async () => {
    const user = await start({ motion: true })
    await goTo(user, 'Stats')
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    expect(played).toEqual(['back', 'wipe'])
    await wipeGone()
  })

  it('a section name on the strip plays tap, then the swipe', async () => {
    const user = await start({ motion: true })
    await goTo(user, 'Today')
    await user.click(within(strip()).getByRole('button', { name: 'Stats' }))
    expect(played).toEqual(['tap', 'swipe'])
  })

  describe('a finger swipe', () => {
    // jsdom lays nothing out; give the sections a phone's width.
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')!
    beforeEach(() => Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => 390 }))
    afterEach(() => Object.defineProperty(Element.prototype, 'clientWidth', original))
    const scrollTo = (left: number) => {
      const viewport = document.querySelector<HTMLElement>('.viewport')!
      viewport.scrollLeft = left
      fireEvent.scroll(viewport)
    }

    it('plays the swipe once it settles on a new section, and nothing while moving or bouncing back', async () => {
      const user = await start({ motion: true })
      await goTo(user, 'Today')
      scrollTo(200) // still moving
      expect(played).toEqual([])
      scrollTo(0) // bounced back to Today
      expect(played).toEqual([])
      scrollTo(390) // settled on Library
      expect(played).toEqual(['swipe'])
      expect(within(strip()).getByRole('button', { name: 'Library' }).getAttribute('aria-current')).toBe('page')
    })
  })

  it('Go to Library (empty Today) plays tap, then the swipe', async () => {
    const user = await start({ motion: true })
    await goTo(user, 'Today')
    await user.click(screen.getByRole('button', { name: 'Go to Library' }))
    expect(played).toEqual(['tap', 'swipe'])
  })

  it("the install hint's ✕ plays back", async () => {
    const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: IPHONE })
    try {
      const user = await start()
      const card = await screen.findByRole('complementary', { name: 'Install Meta Log' })
      played = []
      await user.click(within(card).getByRole('button', { name: 'Dismiss install hint' }))
      expect(played).toEqual(['back'])
    } finally {
      delete (navigator as { userAgent?: string }).userAgent
    }
  })
})

describe('sounds: sheets (step 9a)', () => {
  beforeEach(() => store.addToList('boxing', 'daily'))
  const openLog = async (user: User) => {
    await user.click(await screen.findByRole('button', { name: /^Boxing/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Boxing' })
    return sheet
  }

  it('a habit row plays tap, then the sheet sliding up', async () => {
    const user = await start({ motion: true })
    await goTo(user, 'Today')
    await openLog(user)
    expect(played).toEqual(['tap', 'sheetUp'])
  })

  it('✕ plays back, then the sheet sliding down', async () => {
    const user = await start({ motion: true })
    await goTo(user, 'Today')
    const sheet = await openLog(user)
    played = []
    await user.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(played).toEqual(['back', 'sheetDown'])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 2000 })
  })

  it('a tap outside plays the sheet sliding down only', async () => {
    const user = await start({ motion: true })
    await goTo(user, 'Today')
    await openLog(user)
    played = []
    await user.click(document.querySelector<HTMLElement>('.sheet-backdrop')!)
    expect(played).toEqual(['sheetDown'])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 2000 })
  })

  it('the Settings cog on the menu plays tap, then the sheet sliding up', async () => {
    const user = await start({ motion: true })
    played = []
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(played).toEqual(['tap', 'sheetUp'])
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeTruthy()
  })

  it('SETTINGS and + ADD CUSTOM HABIT play tap, then the sheet sliding up', async () => {
    const user = await start({ motion: true })
    await goTo(user, 'My habits')
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(played).toEqual(['tap', 'sheetUp'])
    await user.click(within(await screen.findByRole('dialog', { name: 'Settings' })).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 2000 })
    played = []
    await user.click(screen.getByRole('button', { name: /add custom habit/i }))
    expect(played).toEqual(['tap', 'sheetUp'])
  })
})

describe('sounds: log sheet (step 9a)', () => {
  beforeEach(() => store.addToList('boxing', 'daily'))
  const openLog = async (user: User) => {
    await goTo(user, 'Today')
    await user.click(await screen.findByRole('button', { name: /^Boxing/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Boxing' })
    played = []
    return sheet
  }

  it('minute bubbles go "tok"; CUSTOM taps; typing digits is silent', async () => {
    const user = await start()
    const sheet = await openLog(user)
    await user.click(within(sheet).getByRole('button', { name: '15' }))
    expect(played).toEqual(['bubble'])
    await user.click(within(sheet).getByRole('button', { name: 'Custom' }))
    expect(played).toEqual(['bubble', 'tap'])
    await user.type(within(sheet).getByLabelText('Minutes'), '25')
    expect(played).toEqual(['bubble', 'tap'])
  })

  it('a refused LOG plays the error only', async () => {
    await store.logSession('boxing', 1440)
    const user = await start()
    const sheet = await openLog(user)
    await user.type(within(sheet).getByLabelText('Minutes'), '5')
    await user.click(within(sheet).getByRole('button', { name: 'Log' }))
    await within(sheet).findByRole('alert')
    expect(played).toEqual(['error'])
  })

  it('a session: Edit taps, Cancel taps, Save selects, Delete removes', async () => {
    await store.logSession('boxing', 20)
    const user = await start()
    const sheet = await openLog(user)
    const sessions = () => within(within(sheet).getByRole('list', { name: "Today's sessions" }))
    await user.click(sessions().getByRole('button', { name: 'Edit' }))
    expect(played).toEqual(['tap'])
    await user.click(sessions().getByRole('button', { name: 'Cancel' }))
    expect(played).toEqual(['tap', 'tap'])
    await user.click(sessions().getByRole('button', { name: 'Edit' }))
    const box = sessions().getByLabelText('Edit minutes')
    await user.clear(box)
    await user.type(box, '30')
    played = []
    await user.click(sessions().getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(sessions().getByText('30 min')).toBeTruthy())
    expect(played).toEqual(['select'])
    played = []
    await user.click(sessions().getByRole('button', { name: 'Delete' }))
    await within(sheet).findByText('No sessions yet today.')
    expect(played).toEqual(['remove'])
  })

  it('a refused edit plays the error only, not select', async () => {
    await store.logSession('boxing', 1000)
    await store.logSession('boxing', 400)
    const user = await start()
    const sheet = await openLog(user)
    const sessions = () => within(within(sheet).getByRole('list', { name: "Today's sessions" }))
    await user.click(sessions().getAllByRole('button', { name: 'Edit' })[1])
    const box = sessions().getByLabelText('Edit minutes')
    await user.clear(box)
    await user.type(box, '500')
    played = []
    await user.click(sessions().getByRole('button', { name: 'Save' }))
    await within(sheet).findByRole('alert')
    expect(played).toEqual(['error'])
  })
})

describe('sounds: Library (step 9a)', () => {
  const libRow = (name: string) =>
    within(screen.getByRole('list', { name: 'Habits' }))
      .getAllByRole('listitem')
      .find((li) => li.querySelector('.name')!.textContent === name)!

  it('a chip taps, + taps, DAILY selects; typing a search is silent', async () => {
    const user = await start()
    await goTo(user, 'Library')
    await user.click(screen.getByRole('button', { name: 'Study' }))
    expect(played).toEqual(['tap'])
    await user.click(screen.getByRole('button', { name: 'Fitness' }))
    played = []
    await user.click(within(libRow('Boxing')).getByRole('button', { name: 'Add Boxing' }))
    expect(played).toEqual(['tap'])
    await user.click(within(libRow('Boxing')).getByRole('button', { name: 'Daily' }))
    await waitFor(() => expect(libRow('Boxing').textContent).toMatch(/On list/))
    expect(played).toEqual(['tap', 'select'])
    played = []
    await user.type(screen.getByRole('searchbox', { name: 'Search habits' }), 'run')
    expect(played).toEqual([])
  })
})

describe('sounds: My habits (step 9a)', () => {
  const listRow = (list: string, name: string) =>
    within(screen.getByRole('list', { name: list }))
      .getAllByRole('listitem')
      .find((li) => li.querySelector('.name')!.textContent === name)!

  it('the DAILY/ANYTIME tag plays the switch', async () => {
    await store.addToList('boxing', 'daily')
    const user = await start()
    await goTo(user, 'My habits')
    await user.click(within(await waitFor(() => listRow('Your list', 'Boxing'))).getByRole('button', { name: /^Daily/ }))
    await waitFor(() => expect(listRow('Your list', 'Boxing').textContent).toMatch(/Anytime/))
    expect(played).toEqual(['switch'])
  })

  it('remove plays tap, then remove; UNDO plays undo', async () => {
    await store.addToList('boxing', 'daily')
    const user = await start()
    await goTo(user, 'My habits')
    await user.click(within(await waitFor(() => listRow('Your list', 'Boxing'))).getByRole('button', { name: 'Remove' }))
    expect(played).toEqual(['tap', 'remove'])
    played = []
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(played).toEqual(['undo'])
  })

  it('adding a custom habit back: + taps, DAILY selects', async () => {
    await store.saveCustomHabit({ name: 'Juggling', category: 'art', weights: { proficiency: 100 } })
    const user = await start()
    await goTo(user, 'My habits')
    await user.click(within(await waitFor(() => listRow('Your custom habits', 'Juggling'))).getByRole('button', { name: 'Add Juggling' }))
    expect(played).toEqual(['tap'])
    await user.click(within(listRow('Your custom habits', 'Juggling')).getByRole('button', { name: 'Daily' }))
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Your custom habits' })).toBeNull())
    expect(played).toEqual(['tap', 'select'])
  })

  describe('new custom habit sheet', () => {
    const openForm = async (user: User) => {
      await goTo(user, 'My habits')
      await user.click(screen.getByRole('button', { name: /add custom habit/i }))
      const sheet = await screen.findByRole('dialog', { name: 'New custom habit' })
      played = []
      return sheet
    }
    const group = (sheet: HTMLElement, name: string) => within(within(sheet).getByRole('group', { name }))

    it('chips and −/+ tap; typing the name is silent', async () => {
      const user = await start()
      const sheet = await openForm(user)
      await user.type(within(sheet).getByLabelText('Name'), 'Juggling')
      expect(played).toEqual([])
      await user.click(group(sheet, 'Category').getByRole('button', { name: 'Art' }))
      await user.click(group(sheet, 'Stats').getByRole('button', { name: 'Courage' }))
      await user.click(within(sheet).getByRole('button', { name: 'More Proficiency' }))
      await user.click(within(sheet).getByRole('button', { name: 'Less Proficiency' }))
      await user.click(group(sheet, 'Show as').getByRole('button', { name: 'Anytime' }))
      expect(played).toEqual(['tap', 'tap', 'tap', 'tap', 'tap'])
    })

    it('Save plays select, then the sheet sliding down', async () => {
      const user = await start({ motion: true })
      const sheet = await openForm(user)
      await user.type(within(sheet).getByLabelText('Name'), 'Juggling')
      await user.click(group(sheet, 'Category').getByRole('button', { name: 'Art' }))
      played = []
      await user.click(within(sheet).getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(played).toEqual(['select', 'sheetDown']))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 2000 })
    })

    it('a Save that storage refuses plays the error only', async () => {
      const failing: Store = { ...store, saveCustomHabit: () => Promise.reject(new Error('disk full')) }
      const user = await start({ as: failing })
      const sheet = await openForm(user)
      await user.type(within(sheet).getByLabelText('Name'), 'Juggling')
      await user.click(group(sheet, 'Category').getByRole('button', { name: 'Art' }))
      played = []
      await user.click(within(sheet).getByRole('button', { name: 'Save' }))
      await within(sheet).findByRole('alert')
      expect(played).toEqual(['error'])
    })
  })
})

describe('sounds: Settings (step 9a)', () => {
  const setShare = (share?: (data: ShareData) => Promise<void>) => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: share ? () => true : undefined })
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
  }
  afterEach(() => setShare(undefined))
  const backupFile = (contents: unknown) =>
    new File([typeof contents === 'string' ? contents : JSON.stringify(contents)], 'meta-log-backup-2026-10-20.json', { type: 'application/json' })
  const goodBackup = {
    app: 'habit-stats',
    version: 1,
    exportedAt: '2026-10-20T12:00:00.000Z',
    data: { customHabits: [], activeHabits: [{ habitId: 'chess', addedOn: '2026-10-03', kind: 'daily' }], sessions: [], awards: [] },
  }
  const soundSwitch = (sheet: HTMLElement) => within(sheet).getByRole('switch', { name: 'Sound' })

  it('Export taps', async () => {
    setShare(async () => {})
    const user = await start()
    const sheet = await openSettings(user)
    await user.click(within(sheet).getByRole('button', { name: 'Export backup' }))
    await within(sheet).findByText(/Last backup/)
    expect(played).toEqual(['tap'])
  })

  it('Import taps once; a bad file plays the error', async () => {
    const user = await start()
    const sheet = await openSettings(user)
    await user.click(within(sheet).getByText('Import backup'))
    expect(played).toEqual(['tap'])
    played = []
    await user.upload(within(sheet).getByLabelText('Import backup'), backupFile('not json'))
    await within(sheet).findByRole('alert')
    expect(played.at(-1)).toBe('error')
    expect(played.filter((p) => p === 'error')).toHaveLength(1)
  })

  it('REPLACE selects; Cancel taps', async () => {
    const user = await start()
    const sheet = await openSettings(user)
    await user.upload(within(sheet).getByLabelText('Import backup'), backupFile(goodBackup))
    await user.click(await within(sheet).findByRole('button', { name: 'Cancel' }))
    expect(played.at(-1)).toBe('tap')
    await user.upload(within(sheet).getByLabelText('Import backup'), backupFile(goodBackup))
    const replace = await within(sheet).findByRole('button', { name: 'Replace' })
    played = []
    await user.click(replace)
    await within(sheet).findByText('Backup restored.')
    expect(played).toEqual(['select'])
  })

  it('a theme tile plays select, then the wipe', async () => {
    const user = await start({ motion: true })
    const sheet = await openSettings(user)
    await user.click(within(sheet).getByRole('radio', { name: 'Royal' }))
    expect(played).toEqual(['select', 'wipe'])
    await wipeGone()
    delete document.documentElement.dataset.theme
  })

  it('taps the theme picker ignores are silent: the current theme, or a second tile mid-wipe', async () => {
    const user = await start({ motion: true })
    const sheet = await openSettings(user)
    await waitFor(() => expect(within(sheet).getByRole('radio', { name: 'Redux' }).getAttribute('aria-checked')).toBe('true'))
    await user.click(within(sheet).getByRole('radio', { name: 'Redux' }))
    expect(played).toEqual([])
    await user.click(within(sheet).getByRole('radio', { name: 'Royal' }))
    await user.click(within(sheet).getByRole('radio', { name: 'Revamp' }))
    expect(played).toEqual(['select', 'wipe'])
    await wipeGone()
    delete document.documentElement.dataset.theme
  })

  it('has a Sound switch, on by default, above the themes', async () => {
    const user = await start()
    const sheet = await openSettings(user)
    const toggle = soundSwitch(sheet)
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'))
    const themes = within(sheet).getByRole('radiogroup', { name: 'Theme' })
    expect(toggle.compareDocumentPosition(themes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('turning Sound off is silent and saved; turning it on plays the switch', async () => {
    const user = await start()
    const sheet = await openSettings(user)
    const toggle = soundSwitch(sheet)
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'))
    await user.click(toggle)
    expect(played).toEqual(['OFF'])
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await waitFor(async () => expect(await store.soundOn()).toBe(false))
    played = []
    await user.click(toggle)
    expect(played).toEqual(['ON', 'switch'])
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    await waitFor(async () => expect(await store.soundOn()).toBe(true))
  })

  it('the app starts with the saved setting: off stays off', async () => {
    await store.setSoundOn(false)
    reduceMotion = false
    const user = userEvent.setup()
    render(<App store={store} now={() => NOW} sfx={sfx} />)
    await waitFor(() => expect(played).toContain('OFF'))
    expect(played).not.toContain('ON')
    await user.click(within(await menu()).getByRole('button', { name: 'My habits' }))
    await user.click(await screen.findByRole('button', { name: 'Settings' }))
    const sheet = await screen.findByRole('dialog', { name: 'Settings' })
    await waitFor(() => expect(soundSwitch(sheet).getAttribute('aria-checked')).toBe('false'))
  })
})


describe('sounds: Reduce Motion means no sounds (step 9a)', () => {
  const soundSwitch = (sheet: HTMLElement) => within(sheet).getByRole('switch', { name: 'Sound' })

  it('switches the player off from the start, even with Sound on, and never on', async () => {
    reduceMotion = true
    const user = userEvent.setup()
    render(<App store={store} now={() => NOW} sfx={sfx} />)
    await waitFor(() => expect(played).toContain('OFF'))
    await user.click(within(await menu()).getByRole('button', { name: 'Today' }))
    await user.click(within(strip()).getByRole('button', { name: 'Stats' }))
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await menu()
    expect(played).not.toContain('ON')
  })

  it('the Sound switch still saves, never switches the player on, and says why', async () => {
    const user = await start({ motion: false })
    await goTo(user, 'My habits')
    await user.click(await screen.findByRole('button', { name: 'Settings' }))
    const sheet = await screen.findByRole('dialog', { name: 'Settings' })
    expect(within(sheet).getByText('Off while Reduce Motion is on.')).toBeTruthy()
    const toggle = soundSwitch(sheet)
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'))
    await user.click(toggle)
    await waitFor(async () => expect(await store.soundOn()).toBe(false))
    await user.click(toggle)
    await waitFor(async () => expect(await store.soundOn()).toBe(true))
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(played).not.toContain('ON')
    expect(played).not.toContain('switch')
  })

  it("with motion on, there's no Reduce Motion line", async () => {
    const user = await start()
    const sheet = await openSettings(user)
    expect(within(sheet).queryByText('Off while Reduce Motion is on.')).toBeNull()
  })
})

describe('sounds: LOG, the points chart and the moments (step 9b)', () => {
  const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))
  // Points from an earlier day.
  const seed = (stat: string, points: number) => db.awards.add({ habitId: 'boxing', date: '2026-10-26', stat: stat as never, points })
  const chart = () => screen.findByRole('status', { name: 'Points earned' })
  const chartGone = () => waitFor(() => expect(screen.queryByRole('status', { name: 'Points earned' })).toBeNull(), { timeout: 5000 })
  const moment = (name: 'Rank up' | 'Graduated') => screen.findByRole('dialog', { name }, { timeout: 6000 })
  const continueIn = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: /continue/i }) as HTMLButtonElement
  const ready = (dialog: HTMLElement) => waitFor(() => expect(continueIn(dialog).disabled).toBe(false), { timeout: 2000 })
  const beads = () => played.filter((p) => p.startsWith('bead:')).map((p) => Number(p.slice(5)))
  const log = async (user: User, habit: string, minutes: string) => {
    await goTo(user, 'Today')
    await user.click(await screen.findByRole('button', { name: new RegExp(`^${habit}`) }))
    const sheet = await screen.findByRole('dialog', { name: habit })
    await user.type(within(sheet).getByLabelText('Minutes'), minutes)
    played = []
    await user.click(within(sheet).getByRole('button', { name: 'Log' }))
    return sheet
  }

  it("LOG plays log, then a bead sound as each bead lands; each stat's beads climb from the bottom", { timeout: 15_000 }, async () => {
    await store.addToList('boxing', 'daily')
    const user = await start()
    await log(user, 'Boxing', '25') // Charm +2, Courage +3, in stat order
    await chart()
    await chartGone()
    expect(played[0]).toBe('log')
    expect(beads()).toEqual([beadStep(0, 2), beadStep(1, 2), beadStep(0, 3), beadStep(1, 3), beadStep(2, 3)])
    // Closing on its own is silent.
    expect(played).toEqual(['log', ...beads().map((b) => `bead:${b}`)])
  })

  it('a LOG that earns nothing plays log only', { timeout: 10_000 }, async () => {
    await seed('charm', 1000)
    await seed('courage', 1000)
    await store.addToList('boxing', 'daily')
    const user = await start()
    await log(user, 'Boxing', '25')
    await waitFor(() => expect(played).toContain('log'))
    await sleep(400)
    expect(played).toEqual(['log'])
  })

  it('skipping the points chart plays back, and no bead sounds after it', { timeout: 15_000 }, async () => {
    await store.addToList('boxing', 'daily')
    const user = await start()
    await log(user, 'Boxing', '120') // 15 beads
    const shown = await chart()
    await waitFor(() => expect(beads().length).toBeGreaterThan(0), { timeout: 3000 })
    await user.click(shown)
    await chartGone()
    await sleep(800)
    const back = played.indexOf('back')
    expect(back).toBeGreaterThan(0)
    expect(played.slice(back + 1).some((p) => p.startsWith('bead:'))).toBe(false)
    expect(beads().length).toBeLessThan(15)
  })

  it('a tap on the chart before it can be skipped is silent', { timeout: 15_000 }, async () => {
    await store.addToList('boxing', 'daily')
    const user = await start()
    await log(user, 'Boxing', '25')
    await user.click(await chart())
    expect(played).not.toContain('back')
    await chartGone()
  })

  it('each rank-up screen plays its own stinger after the beads; tapping it away (or Escape) fades it and plays back', { timeout: 20_000 }, async () => {
    await seed('charm', 58)
    await seed('courage', 58)
    await store.addToList('boxing', 'daily')
    const user = await start()
    await log(user, 'Boxing', '25') // Charm 60 and Courage 61: two rank-ups
    const first = await moment('Rank up')
    await waitFor(() => expect(played).toContain('rankUp'))
    expect(played.indexOf('rankUp')).toBeGreaterThan(played.map((p) => p.startsWith('bead:')).lastIndexOf(true))
    // Too early to tap away: silent.
    await user.click(first)
    expect(played).not.toContain('back')
    await ready(first)
    played = []
    await user.click(continueIn(first))
    expect(played.slice(0, 2)).toEqual(['stop:rankUp', 'back'])
    const second = await waitFor(
      () => {
        const d = screen.getByRole('dialog', { name: 'Rank up' })
        expect(d).not.toBe(first)
        return d
      },
      { timeout: 3000 },
    )
    await waitFor(() => expect(played).toContain('rankUp'))
    await ready(second)
    played = []
    await user.keyboard('{Escape}')
    expect(played.slice(0, 2)).toEqual(['stop:rankUp', 'back'])
  })

  it('graduation plays its stinger after the rank-up; tapping it away fades it and plays back', { timeout: 20_000 }, async () => {
    await seed('charm', 1000)
    await seed('courage', 1000)
    await seed('intelligence', 1000)
    await seed('proficiency', 999)
    await store.addToList('calligraphy', 'daily')
    const user = await start()
    await log(user, 'Calligraphy', '10')
    const up = await moment('Rank up')
    await ready(up)
    await user.click(continueIn(up))
    const grad = await moment('Graduated')
    await waitFor(() => expect(played).toContain('graduate'))
    expect(played.indexOf('graduate')).toBeGreaterThan(played.indexOf('rankUp'))
    await ready(grad)
    played = []
    await user.click(continueIn(grad))
    expect(played.slice(0, 2)).toEqual(['stop:graduate', 'back'])
  })

  it('an edit that crosses a rank plays select, then the stinger; no LOG and no beads', { timeout: 15_000 }, async () => {
    await seed('courage', 57)
    await store.addToList('boxing', 'daily')
    await store.logSession('boxing', 5) // Courage 59
    const user = await start()
    await goTo(user, 'Today')
    await user.click(await screen.findByRole('button', { name: /^Boxing/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Boxing' })
    const sessions = () => within(within(sheet).getByRole('list', { name: "Today's sessions" }))
    await user.click(sessions().getByRole('button', { name: 'Edit' }))
    const box = sessions().getByLabelText('Edit minutes')
    await user.clear(box)
    await user.type(box, '25') // Courage 60
    played = []
    await user.click(sessions().getByRole('button', { name: 'Save' }))
    await moment('Rank up')
    await waitFor(() => expect(played).toContain('rankUp'))
    expect(played).toEqual(['select', 'rankUp'])
  })
})
