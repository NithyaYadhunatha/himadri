// Controls shown in the H overlay, per station build. Verified against the Unity
// sources: Bharati (PlayerController, PlayerInteraction, PauseMenu, WaypointHUD,
// HUDController, MinimapUI, PlayerSpawnManager, EquipmentSelector) and Maitri (FirstPersonController,
// RoomNavigationMenu, DeviceInteraction). Both builds share the same Esc menu,
// Navigate list (Tab), Clear route (X) and H = this panel. Unsupported rows are never
// rendered, so set `supported: false` if a binding is removed from a build.
import type { StationId } from '@/lib/constants'

export interface ControlRow { keys: string[]; action: string; supported: boolean }
export interface ControlGroup { title: string; rows: ControlRow[] }

export const CONTROL_GROUPS: Record<StationId, ControlGroup[]> = {
  bharati: [
    {
      title: 'Movement',
      rows: [
        { keys: ['W', 'A', 'S', 'D'], action: 'Move', supported: true },
        { keys: ['Mouse'], action: 'Look around', supported: true },
        { keys: ['Shift'], action: 'Sprint', supported: true },
        { keys: ['Space'], action: 'Jump', supported: true },
        { keys: ['Ctrl'], action: 'Crouch', supported: true },
        { keys: ['E'], action: 'Interact', supported: true },
      ],
    },
    {
      title: 'Navigation',
      rows: [
        { keys: ['Esc'], action: 'Menu → Navigate to… → Teleport', supported: true },
        { keys: ['Tab'], action: 'Navigate list', supported: true },
        { keys: ['X'], action: 'Clear route', supported: true },
        { keys: ['M'], action: 'Map (+/- zoom)', supported: true },
        { keys: ['F5'], action: 'Return to entrance', supported: true },
      ],
    },
    {
      title: 'Scientific equipment',
      rows: [
        { keys: ['Aim', 'E'], action: 'Inspect equipment (or click)', supported: true },
        { keys: ['E', 'Esc'], action: 'Resume after inspecting', supported: true },
        { keys: ['Tab'], action: 'Navigate → Scientific equipment → Locate / Teleport', supported: true },
      ],
    },
    { title: 'Interface', rows: [{ keys: ['H'], action: 'Controls', supported: true }] },
  ],
  maitri: [
    {
      title: 'Movement',
      rows: [
        { keys: ['W', 'A', 'S', 'D'], action: 'Move', supported: true },
        { keys: ['Mouse'], action: 'Look around', supported: true },
        { keys: ['Shift'], action: 'Sprint', supported: true },
        { keys: ['Ctrl'], action: 'Walk', supported: true },
        { keys: ['C'], action: 'Crouch', supported: true },
        { keys: ['Space'], action: 'Jump', supported: true },
        { keys: ['Q', 'E'], action: 'Lean', supported: true },
        { keys: ['Alt'], action: 'Free look', supported: true },
        { keys: ['E', 'Click'], action: 'Inspect device', supported: true },
      ],
    },
    {
      title: 'Navigation',
      rows: [
        { keys: ['Esc'], action: 'Menu → Navigate to… → Teleport', supported: true },
        { keys: ['Tab'], action: 'Navigate list', supported: true },
        { keys: ['X'], action: 'Clear route', supported: true },
      ],
    },
    {
      title: 'Room 3 robotics',
      rows: [
        { keys: ['R'], action: 'Open or close arm controls near the robot', supported: true },
        { keys: ['Mouse'], action: 'Move the arm and elbow servo sliders', supported: true },
      ],
    },
    { title: 'Interface', rows: [{ keys: ['H'], action: 'Controls', supported: true }] },
  ],
}
