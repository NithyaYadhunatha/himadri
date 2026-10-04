# Unity ↔ dashboard bridge

The Bharati system-flow overlay, bridge commands, dependency schema, and extension steps are documented in
[`BHARATI_SYSTEM_FLOW.md`](./BHARATI_SYSTEM_FLOW.md).

The dashboard (`frontend/src/lib/twin/bridge.ts`) talks to the Unity WebGL build over `postMessage`.
`frontend/public/unity/**/index.html` contains the browser half. The Maitri Unity half (`WebBridge.cs` +
`WebBridge.jslib`) is installed in the Unity project and included in the compiled build under
`frontend/public/unity/Build`. The dashboard can navigate directly to all 16 corridor rooms: North N01–N08 and
South S01–S08. N04, N05 and S04 retain the three PolarTwin telemetry-room assignments; the other rooms are clearly
marked as physical rooms without fabricated hardware data.

Web → 3D commands: `focusAsset`, `focusRoom`, `setAssetHighlight`, `setRoomState`, `setHeatmapMode`,
`setHeatmapValue`, `resetCamera`, `toggleLayer`. 3D → web: `assetSelected`, `roomSelected`, `sceneLoaded`,
`assetStatusChanged`, `capabilities` (the list of commands the build really implements — the UI enables features from it).

TODO in the scene (stubs marked in `WebBridge.cs`): room outline states, layer toggles, heat-map overlay shader
(add `setHeatmapMode`/`setHeatmapValue` to `Capabilities` once done), a raycast click handler calling `NotifyAssetClicked`.

## Navigate To / teleport

Room navigation is available both from the station-specific dashboard bar and in the 3D scene. **Esc → "Navigate
to…"** opens the NAVIGATE TO list
(`Assets/Scripts/UI/WaypointHUD.cs` in the Bharati Unity project). It lists every destination in the building, grouped
by floor (all `RoomDatabase` rooms with `isDestination` plus scene `Waypoint`s). Each row has ROUTE (on-floor directions)
and **TELEPORT**. Rooms with no walkable route from the entrance show `NO ROUTE` and are reached with TELEPORT.

Both stations use the same menu layout and keys: Esc menu (Resume, Navigate to…, Return to entrance, look settings),
Tab opens the Navigate list, X clears the route, and H opens the dashboard's Controls panel (H no longer hides the
Bharati HUD). Each station lists its own rooms. Maitri's version is `Assets/Scripts/RoomNavigationMenu.cs` (IMGUI,
styled by `StationUI.cs` with Bharati's colours, font and 1920x1080 scaling). It builds its list at runtime from
`RoomController`s, the `Door_Corr_*` corridor doors, the stair doors and the outside spawn. Rebuild Maitri with
`CIWebGLBuild.BuildWebGL`, then copy `/tmp/maitri-webgl-export/Build/maitri-webgl-export.{data,wasm,framework.js,loader.js}`
into `frontend/public/unity/Build/` renamed to `WebGL.*`. Unity names the files after the output folder.

Teleport (`WaypointHUD.TeleportTo`): the target is the room's NavMesh point, snapped to solid ground and checked clear of
colliders by `PlayerSpawnManager.FindValidPosition`; `PlayerController.Teleport` disables the CharacterController, moves,
re-enables it and zeroes velocity; the player faces into the room; the menu closes and the cursor re-locks.

Railings (`COL_*RAIL*` colliders) are never ground in Bharati. `PlayerController` slides the player off any railing
they land on. Before this fix, jumping on the main stair could leave the player standing on the handrail with the
camera inside the floor slab above, so rooms looked like they were floating. Play Mode tests T18/T19 cover it.

To change destinations: edit the `BharatiRooms` RoomDatabase asset (names, `isDestination`, room volume), or drop a
`Waypoint` component on an empty GameObject for a custom spot. Then rebuild WebGL (`Bharati > Build WebGL`) and copy
`Build/WebGL/Build/*` into `frontend/public/unity/bharati/Build/`.

Keys: the host page forwards only `H` and `Esc` to the dashboard (capture phase, never consumed, Unity still sees them).

## Scientific equipment (Bharati)

The Bharati twin shows NPDC-listed scientific instruments around the station in six areas (geomagnetic, geodesy/GPS,
atmospheric electricity, weather, energy, radiation). **One config drives both sides:**
`frontend/public/unity/bharati/StreamingAssets/scientific-equipment.json`.

- **Unity** downloads it at runtime from `/unity/bharati/StreamingAssets/` (the WebGL `streamingAssetsUrl`), so
  positions (`position`), facing/scale (`rotation`, `scale`), `zone`, models and teleport anchors (`teleport.position`,
  optional `teleport.yaw`) change **without a Unity rebuild**. Positions are Unity world metres (station spans x −51…9,
  z −32…3; walkable snowfield x −62…20, z −46…14; north = −z). `groundSnap` drops items onto the snow; give an explicit
  `y` with `groundSnap: false` to stand an item on something (the radiation meters on the shelter bench).
- **Dashboard** imports the same file (`src/lib/twin/equipment/catalog.ts`) for names, descriptions and telemetry
  bindings (`telemetry.sources` / `telemetry.fields`; labels/units in `src/lib/twin/equipment/fields.ts`).

Unity side (Bharati project, `Assets/Scripts/Equipment/`): `ScientificEquipmentBootstrap` adds everything at scene
load (the saved scene and FBX are untouched); `ScientificEquipmentManager` spawns the items, colliders (one simplified
box each, plus NavMesh carving), ground cables, zone marker stakes and a `Waypoint` (kind `Equipment`) per item;
`EquipmentModelFactory` builds the procedural stand-in models; `EquipmentSelector` = aim + E/click to inspect;
`EquipmentLabelUI` = distance-tiered labels; `EquipmentRotor` = anemometer/vane/turbine animation from wind telemetry.
Navigate menu (Tab) lists them under **SCIENTIFIC EQUIPMENT** (row = LOCATE route, button = TELEPORT); the minimap
shows `minimap: true` items in their area colour. To replace a procedural model, import the GLB/FBX as a prefab under
`Assets/Resources/` and set `"prefab": "<path under Resources, no extension>"` on the item.

Bridge (`Assets/Scripts/Web/WebBridge.cs` + `Assets/Plugins/WebGL/WebBridge.jslib`): web → 3D `hostReady`,
`selectEquipment`, `clearEquipmentSelection`, `locateEquipment`, `teleportToEquipment`, `setEquipmentState`,
`setEquipmentTelemetry`; 3D → web `capabilities`, `equipmentSelected`, `equipmentCleared`. When the dashboard is the host,
selecting equipment frees the cursor so its Equipment Details panel (right column) can be used; E/Esc resumes.

Telemetry (`src/lib/twin/equipment/telemetry.ts`, `getEquipmentTelemetry`): no Bharati instrument feed reaches HIMADRI,
so AWS/wind fields use the existing `/api/environment/weather?station=bharati` (Open-Meteo **regional model**, labelled
as such) and GPS latitude/longitude use the station **reference** coordinates. Everything else is "Data unavailable"
unless `NEXT_PUBLIC_ENABLE_EQUIPMENT_SIMULATION=true` or the console is in DEMO mode; simulated values are labelled
SIMULATED. Only simulation sets an equipment state (green LEDs); otherwise LEDs show dim standby.

Rebuild after C# changes: `Bharati > Equipment > Create Materials` (only when `EquipmentMaterials.Specs` change; the
assets under `Assets/Resources/BharatiEquipment/Materials` keep their shader variants in WebGL), then
`Bharati > Build WebGL` and copy `Build/WebGL/Build/*` into `frontend/public/unity/bharati/Build/`. Do not copy the
build's `StreamingAssets/` over the frontend one: in the Unity project `Assets/StreamingAssets/scientific-equipment.json`
is a symlink to the frontend file. `Bharati > Equipment > Capture Previews` renders review shots of every area.

## Robotic arm (Maitri, Room 3)

A two-servo arm stands in Room 3's robotics test cell. Its base plate (bolted at four corners)
and pedestal are static. Two pivots move: **Servo 1** at the shoulder (lower arm) and
**Servo 2** at the elbow (upper arm). A palm-and-two-finger gripper sits on the end.

| Joint | Backend device | Joint angle | Limit |
|---|---|---|---|
| Servo 1, lower arm | `servo-01` (Pi PWM, BCM18) | servo − 45° | −25° … 85° |
| Servo 2, upper arm | `servo-02` (software only) | servo − 165° | −130° … 15° |

Servo values are raw 0–180°. A reading of 90°/90° is the home pose. Values outside a joint's
mechanical limit are clamped in Unity. Joints move with `SmoothDamp` (0.25 s, top speed 90°/s),
so a jump in the value shows as a sweep, not a snap.

Data path: `DEVICE_UPDATE` on `/ws/digital-twin` → `WebSocketLiveDataProvider.DeviceUpdated` →
`RoboticArmController`. The backend's initial `OFFLINE` placeholder is ignored. Once a joint
has a server value it follows the server, and the R panel shows that joint read-only. A joint
with no server value can still be posed locally.

Set the angles from the server:

```bash
# servo-02 has no hardware: the commanded angle becomes its state and is broadcast at once.
curl -X POST "$API/api/v1/devices/servo-02/command" -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' -d '{"command":"SET_ANGLE","value":120}'
# servo-01 is queued for the Pi (SERVO:<deg>). The arm moves when the Pi reports the angle back.
curl -X POST "$API/api/v1/devices/servo-01/command" -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' -d '{"command":"SET_ANGLE","value":60}'
# Either servo can also arrive as telemetry, like any other device:
curl -X POST "$API/api/v1/telemetry/ingest" -H "X-Device-Key: $KEY" -H 'Content-Type: application/json' \
     -d '{"gatewayId":"test","readings":[{"deviceId":"servo-01","value":60},{"deviceId":"servo-02","value":120}]}'
```

The arm geometry is generated by `DigitalTwinSceneBuilder.PopulateRoboticArm`. To replace just
the arm in the saved scene, run
`-executeMethod DigitalTwinSceneBuilder.RebuildRoboticArmInSavedScene` (menu: *Maitri → Digital
Twin → Rebuild Robotic Arm Only*). It leaves the rooms and building as they are.

## Chemistry lab arm (Maitri, room S05)

Room S05 (south side, next to Room 3) is a small chemistry lab with a joystick-operated robotic
arm. The arm isn't connected to the backend.

- **Fixed base:** a floor plate bolted down at four corners carries the pedestal. Neither moves.
- **Joints:** a turntable swivels the arm (−160° … 160°; the 40° it can't reach faces the back
  wall). Servo 1 pitches the lower arm (−15° … 120°). Servo 2 pitches the upper arm (−150° … 0°).
  A parallel link keeps the gripper hanging straight down; the wrist joint tilts it from there
  (−110° … 110°).
- **Lab:** a bench of glassware with CuSO4, NaOH, phenolphthalein, FeCl3, KSCN and KMnO4, plus one
  empty beaker. A fixed mixing beaker sits on a stirrer. Floating labels show what each container
  holds.

Walk to the console by the door and either click the joystick (or press E at it) or right-click
the arm itself to take the controls. The lever is an arcade-style stick: a chrome shaft with a red grip and an amber thumb
button, set in a base ring with direction chevrons. The ring and collar pulse cyan while idle,
brighten when you look at the stick, and turn green while you're using it.

At the controls the mouse cursor is free and two tall sliders sit on the sides of the screen:

- **Arm angle** (left, cyan): the shoulder angle, −15° … 120°. The elbow bends to keep the hand
  where the joystick put it, so this raises and lowers the hand. If the angle can't be reached
  there, the hand slides along the arm until it can. The slider snaps back if the gripper would
  hit something below.
- **Wrist angle** (right, amber): tilts the gripper, −110° … 110°. Tilt a held container past 70°
  with its mouth over another container and it pours; straighten the wrist to stop.

The joystick only moves the hand over the floor.

| Input | Action |
|---|---|
| WASD / arrows / drag the mouse (off the panels) | joystick: move the hand in the direction you are facing |
| Left slider / R / F / mouse wheel | arm angle |
| Right slider / T / G | wrist angle |
| Click / Space | pick up the targeted container / set the held one down (click again to stop) |
| P | pour: tilt the wrist over, empty into the container below, tilt back |
| X | reset the lab (every container back on the bench, refilled) |
| Esc / E / right-click | leave the controls |

A target ring on the surface below the gripper shows where it is aimed. Once the wrist is tilted,
it follows the held container's mouth instead. It is cyan, turns green when a container is within
18 cm (which also gets a highlight ring), amber while holding, and pink over a container you can
pour into. Clicking with a container targeted makes the arm finish the pick by itself: straighten
the wrist, rise clear of the glassware, centre over the container, lower, grip and lift. Clicking
while holding lowers the container onto whatever is beneath it and lets go, so you can set it down
anywhere: on the bench, the floor, or on another container. A grip or release always finishes, so
pressing R straight after clicking lifts the container rather than dropping it. Once it's gripped
(or let go), the joystick, R/F or T/G hand control back to you. The sliders follow the arm while
it moves itself. The gripper always stops on what's below it. It can't be pushed sideways into
the bench or tables, and it stays 0.16 m inside the walls.

Reactions modelled in `LabChemistry.cs`:
- CuSO4 + NaOH → pale-blue Cu(OH)2 precipitate
- FeCl3 + KSCN → blood-red complex
- NaOH + phenolphthalein → pink

Any other mixture is a colour blend.

The code is in `ChemLabArm.cs`, `LabContainer.cs` and `LabChemistry.cs`.
`DigitalTwinSceneBuilder.PopulateChemLab` builds the room. To rebuild only this lab, run
`-executeMethod DigitalTwinSceneBuilder.RebuildChemLabInSavedScene` (menu: *Maitri → Digital Twin
→ Rebuild Chemistry Lab Arm Only*).
