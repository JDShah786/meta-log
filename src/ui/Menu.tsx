// Command-menu home: big stacked italic words, one per section. The last section is marked.
// A card below previews today's list and opens Today. On an iPhone not yet installed, a
// one-time hint explains how to add the app to the Home Screen.

import { motion } from 'motion/react'
import { useEffect, useState, type MouseEvent } from 'react'
import { isIOS, isStandalone, shouldShowInstallHint } from '../pwa/installHint'
import type { Store } from '../storage/store'
import { GhostWord } from './Decor'
import { SettingsSheet } from './Settings'
import { useSound } from './sound'
import { burst, SECTIONS, SNAP, SOFT, tapPoint } from './motionKit'
import { minutesOn, useTodayData } from './todayData'
import { listOrder } from './todayView'

interface Props {
  store: Store
  current: number
  reduced: boolean
  // A wipe is covering the menu: the cog ignores taps (like a second menu tap mid-wipe).
  covered: boolean
  now: () => Date
  dataVersion: number
  onDataChange: () => void
  onChoose: (index: number) => void
}

export function Menu({ store, current, reduced, covered, now, dataVersion, onDataChange, onChoose }: Props) {
  const [settings, setSettings] = useState(false)
  const { play } = useSound()
  const choose = (index: number, e: MouseEvent<HTMLButtonElement>) => {
    if (!reduced) burst(tapPoint(e), 12, 90)
    onChoose(index)
  }

  return (
    <div className="menu-view">
      <GhostWord word="HABITS" />
      <p className="tagline">What will you do today?</p>
      <nav className="menu" aria-label="Menu">
        {SECTIONS.map((name, i) => {
          const selected = i === current
          return (
            <motion.button
              key={name}
              className={selected ? 'sel' : undefined}
              aria-current={selected ? 'true' : undefined}
              initial={{ x: 160, opacity: 0 }}
              // The selected word jolts as the highlight lands on it.
              animate={{ x: 0, opacity: 1, rotate: selected ? [-8, 0] : 0, scale: selected ? [1.15, 1] : 1 }}
              transition={{ ...SNAP, delay: i * 0.05 }}
              whileTap={{ scale: 0.93 }}
              onClick={(e) => choose(i, e)}
            >
              {name}
            </motion.button>
          )
        })}
      </nav>
      <motion.button
        className="card"
        initial={{ y: 90, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SOFT, delay: 0.1 }}
        whileTap={{ scale: 0.96 }}
        onClick={(e) => choose(0, e)}
      >
        <TodayCard store={store} dataVersion={dataVersion} />
      </motion.button>
      {/* Settings cog: bottom right, where a right thumb rests. Same sheet as My habits' SETTINGS. */}
      <motion.button
        className="menu-cog"
        aria-label="Settings"
        aria-hidden={covered || undefined}
        tabIndex={covered ? -1 : undefined}
        initial={{ scale: 0, rotate: -90 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ ...SNAP, delay: 0.15 }}
        whileTap={{ scale: 0.88, rotate: 45 }}
        onClick={(e) => {
          if (covered) return
          if (!reduced) burst(tapPoint(e), 8, 60)
          play('tap')
          play('sheetUp')
          setSettings(true)
        }}
      >
        <CogIcon />
      </motion.button>
      <InstallHint store={store} />
      {settings && (
        <SettingsSheet store={store} now={now} reduced={reduced} onRestored={onDataChange} onClose={() => setSettings(false)} />
      )}
    </div>
  )
}

// An original cog: eight square teeth round a ring, drawn in the theme's colours by CSS.
function CogIcon() {
  const teeth = Array.from({ length: 8 }, (_, i) => i * 45)
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {teeth.map((deg) => (
        <rect key={deg} x="19.5" y="3" width="9" height="11" rx="2" transform={`rotate(${deg} 24 24)`} />
      ))}
      <circle cx="24" cy="24" r="14" />
      <circle className="menu-cog-hole" cx="24" cy="24" r="5.5" />
    </svg>
  )
}

// On an iPhone or iPad, until installed or dismissed: how to add Meta Log to the Home Screen.
function InstallHint({ store }: { store: Store }) {
  const [show, setShow] = useState(false)
  const { play } = useSound()

  useEffect(() => {
    const ios = isIOS(navigator.userAgent, navigator.maxTouchPoints ?? 0)
    const standalone = isStandalone(window as unknown as Parameters<typeof isStandalone>[0])
    if (!ios || standalone) return
    let showing = true
    void store.installHintDismissed().then((dismissed) => showing && setShow(shouldShowInstallHint({ ios, standalone, dismissed })))
    return () => {
      showing = false
    }
  }, [store])

  if (!show) return null
  return (
    <motion.aside
      className="install-hint"
      aria-label="Install Meta Log"
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ ...SOFT, delay: 0.25 }}
    >
      <p>
        <b>Add Meta Log to your Home Screen:</b> tap Share, then Add to Home Screen. The installed app keeps its own
        data, so export a backup here first if you've logged in Safari.
      </p>
      <button
        className="install-x"
        aria-label="Dismiss install hint"
        onClick={() => {
          play('back')
          setShow(false)
          void store.dismissInstallHint()
        }}
      >
        ✕
      </button>
    </motion.aside>
  )
}

const CARD_ROWS = 3

function TodayCard({ store, dataVersion }: { store: Store; dataVersion: number }) {
  const [data] = useTodayData(store, dataVersion)
  const title = <span className="card-title">Today's list</span>
  if (!data) return title

  const nameOf = (habitId: string) => data.habits.get(habitId)?.name ?? habitId
  const list = listOrder(data.active, nameOf)
  const daily = list.filter((a) => a.kind === 'daily')
  const dailyDone = daily.filter((a) => minutesOn(data, a.habitId) > 0).length

  return (
    <>
      {title}
      {list.length === 0 && <span className="card-row">Nothing on your list yet.</span>}
      {list.slice(0, CARD_ROWS).map(({ habitId }) => {
        const minutes = minutesOn(data, habitId)
        return (
          <span key={habitId} className="card-row">
            <i className={minutes > 0 ? 'on' : undefined} aria-hidden="true" />
            <span className="nm">{nameOf(habitId)}</span>
            <em>{minutes}m</em>
          </span>
        )
      })}
      {list.length > CARD_ROWS && <span className="card-more">+{list.length - CARD_ROWS} more</span>}
      {daily.length > 0 && (
        <span className="card-count">
          {dailyDone} of {daily.length} daily done
        </span>
      )}
    </>
  )
}
