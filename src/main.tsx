// Montserrat: only the weights the design uses (self-hosted, OFL).
import '@fontsource/montserrat/700.css'
import '@fontsource/montserrat/800.css'
import '@fontsource/montserrat/800-italic.css'
import '@fontsource/montserrat/900-italic.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { localDay } from './engine/scoring'
import { openDb } from './storage/db'
import { registerServiceWorker } from './pwa/register'
import { createPlayer } from './sound/player'
import { createStore } from './storage/store'
import { App } from './ui/App'
import './ui/app.css'
import './ui/themes.css'
import { bootTheme } from './ui/themes'

// PR previews build with their own VITE_DB_NAME, so they never touch the real habit data.
// The database keeps its first name, 'habit-stats', after the rename to Meta Log: renaming it
// would leave everyone's data behind.
const db = openDb(import.meta.env.VITE_DB_NAME || 'habit-stats')
const store = createStore(db, () => localDay(new Date()))

// Offline and installable (step 7). Not in PR previews.
registerServiceWorker()
// Ask the phone to keep this app's storage permanently. Installed iPhone apps already are;
// this also helps in a browser tab.
void navigator.storage?.persist?.()

// Sounds (step 9), made in code with Web Audio. Phones allow audio only after a tap, so every tap
// makes (or wakes) it. 'ambient' follows the silent switch and never pauses the user's music.
const sfx = createPlayer({
  makeContext: () => new AudioContext(),
  session: (navigator as Navigator & { audioSession?: { type: string } }).audioSession,
})
// On a touch screen only the finger lifting counts as a gesture that may start audio.
for (const event of ['pointerdown', 'pointerup', 'keydown']) addEventListener(event, () => sfx.unlock(), { capture: true })

// Apply the saved theme (step 8) before the app shows, so it never flashes the wrong colours.
void bootTheme(store).then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App store={store} sfx={sfx} />
    </StrictMode>,
  ),
)
