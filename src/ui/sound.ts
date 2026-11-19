// Sound for the screens (step 9): the player, handed down through React context (dependency
// injection), so tests can pass a fake one. The app also shares the Sound setting here, for the
// switch in Settings.

import { createContext, useContext } from 'react'
import type { Sfx } from '../sound/player'
import type { SoundName } from '../sound/sounds'

export const SILENT: Sfx = { play: () => () => {}, bead() {}, setOn() {}, unlock() {} }

interface Sound {
  // Hands back a stop that fades that sound out.
  play: (name: SoundName) => () => void
  bead: (step: number) => void
  // The saved setting; null until it has loaded.
  soundOn: boolean | null
  setSoundOn: (on: boolean) => void
}

export const SoundContext = createContext<Sound>({ play: () => () => {}, bead() {}, soundOn: null, setSoundOn() {} })

export const useSound = () => useContext(SoundContext)
