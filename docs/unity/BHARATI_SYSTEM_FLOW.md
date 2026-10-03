# System flow (Bharati + Maitri)

Both WebGL twins expose a data-driven dependency overlay through the existing `WebBridge`.
The dashboard camera bar sends `setSystemFlow`, `setSystemFlowFilter`, and `setSystemFlowFocus`
commands. Bharati focuses on the equipment selected in the scene; Maitri focuses on the asset
selected in the dashboard.

## Look

- Dependencies are thin glowing tubes with beads travelling source → target, coloured by type:
  `power` orange, `data` green, `control` indigo, `safety` red. The dashboard filter chips use
  the same colours.
- Nodes get a navy pill label with a status dot. Nodes with `"card": true` get a white status card
  (status · title · live value · `detail`).
- The building goes almost invisible so paths read across rooms and floors. Everything structural
  (walls, ceilings, cladding, glass, doors, stilts, beams, stairs, rails, light fittings and room
  props) becomes a flat, unlit ghost tint at `structuralOpacity` (default 0.015). Only the snow
  ground, Bharati's solar array and Maitri's devices stay solid, because they are flow nodes. Floors stay at `floorOpacity` (default 0.06) so levels still read. Faded parts
  cast no shadows, and the ground stays solid. Both values are clamped (walls ≤ 0.10, floors ≤ 0.15);
  set either to `0` to hide that part completely. The scene's own world-space labels hide while the
  overlay is on.
- Selecting a node keeps its connected chain bright, dims the rest, and shows the dependency
  names along that chain.

Status is never invented. Bharati shows the state the dashboard pushes for that equipment, or
`NO DATA`. Maitri devices show their live status and value. Maitri infrastructure nodes (gateway,
backend, power bus) show `ACTIVE` only while a device they link to is reporting, and `NO SIGNAL`
otherwise.

## Data files

| Station | Graph | Served from |
|---|---|---|
| Bharati | `Bharthi/Assets/StreamingAssets/system-flow.json` (symlink) | `frontend/public/unity/bharati/StreamingAssets/system-flow.json` |
| Maitri | `MaitriGame/Assets/StreamingAssets/system-flow.json` | `frontend/public/unity/StreamingAssets/system-flow.json` |

```json
{ "id": "SYS_RPI_01", "label": "Pi Gateway", "card": true, "detail": "COMMS RACK" }
{ "source": "SYS_ARDUINO_01", "target": "SYS_RPI_01", "type": "data", "label": "Serial Telemetry" }
```

Node resolution:
- Bharati: `id` must exist in `scientific-equipment.json` (`ScientificEquipmentManager.Find`).
- Maitri: `id` is a device id (`DeviceRegistry`). Infrastructure with no scene object gives a
  world `position` (`[x, y, z]`; floor ≈ 3.5, corridor at z = 0). `anchor` (device / room id /
  GameObject name) and `offset` are optional.

## Adding a dependency

1. Make sure both endpoints are listed in `nodes`.
2. Add a dependency with one of the four types.
3. JSON-only changes are served from `StreamingAssets` and need no Unity rebuild.
   Rebuild the player only when C# changes:
   - Bharati: `Unity -batchmode -quit -projectPath Bharthi -executeMethod Bharati.EditorTools.BharatiBuilder.BuildWebGL`,
     then copy `Build/WebGL/Build/*` to `frontend/public/unity/bharati/Build/`.
   - Maitri: `Unity -batchmode -quit -projectPath MaitriGame -executeMethod CIWebGLBuild.BuildWebGL`,
     then copy `/tmp/maitri-webgl-export/Build/*` to `frontend/public/unity/Build/`.

The overlay is built once at load. Lines, beads and transparent shell materials are created once,
after which they are only switched on and off. In Maitri the manager bootstraps itself at runtime
(`RuntimeInitializeOnLoadMethod`), so the generated scene does not need rebuilding.
