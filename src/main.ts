import './style.css'
import { start } from './app'
import { loadRuntimeSettings } from './settings'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('Missing #app element')

// Runtime settings first: the Pubky client and every share URL depend on them,
// and a Docker deployment configures them through /config.json rather than a
// rebuild. `loadRuntimeSettings` never throws, so a missing file just means
// the build-time defaults stand.
await loadRuntimeSettings()

start(app)
