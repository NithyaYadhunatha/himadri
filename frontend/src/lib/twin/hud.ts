// Overlay state for the 3D console. Room navigation lives in the Unity Esc menu,
// so the only web overlay is the controls help (H).
import { create } from 'zustand'

export type Overlay = 'none' | 'help'

interface HudState {
  overlay: Overlay
  toggleHelp: () => void
  close: () => void
  /** ESC: closes the open overlay. Returns true if it consumed the key. */
  escape: () => boolean
}

export const useHud = create<HudState>((set, get) => ({
  overlay: 'none',
  toggleHelp: () => set({ overlay: get().overlay === 'help' ? 'none' : 'help' }),
  close: () => set({ overlay: 'none' }),
  escape: () => {
    if (get().overlay === 'none') return false
    set({ overlay: 'none' })
    return true
  },
}))
