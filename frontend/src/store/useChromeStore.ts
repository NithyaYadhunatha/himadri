// src/store/useChromeStore.ts
//
// Whether the app chrome (top nav, status strip, chat button) is hidden — used
// by the 3D twin's fullscreen mode so only the scene, its side panel and the
// controls remain.
import { create } from 'zustand'

interface ChromeState {
  hidden: boolean
  setHidden: (hidden: boolean) => void
}

export const useChromeStore = create<ChromeState>((set) => ({
  hidden: false,
  setHidden: (hidden) => set({ hidden }),
}))
