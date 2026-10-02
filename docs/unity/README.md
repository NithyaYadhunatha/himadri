# Unity ↔ dashboard bridge

The dashboard (`frontend/src/lib/twin/bridge.ts`) talks to the Unity WebGL build over `postMessage`.
`frontend/public/unity/**/index.html` already contains the browser half. The Unity half (`WebBridge.cs` +
`WebBridge.jslib`) must be added in the Unity project and the WebGL build re-exported — the Unity project is not in
this repo, so the compiled build under `frontend/public/unity/Build` does **not** contain it yet.

Until then the dashboard works fully (live data, charts, alerts, selection from panels) but: 3D clicks don't select
assets, camera/highlight/heat-map commands are no-ops, and the UI states "3D bridge not in this build".

Web → 3D commands: `focusAsset`, `focusRoom`, `setAssetHighlight`, `setRoomState`, `setHeatmapMode`,
`setHeatmapValue`, `resetCamera`, `toggleLayer`. 3D → web: `assetSelected`, `roomSelected`, `sceneLoaded`,
`assetStatusChanged`, `capabilities` (the list of commands the build really implements — the UI enables features from it).

TODO in the scene (stubs marked in `WebBridge.cs`): room outline states, layer toggles, heat-map overlay shader
(add `setHeatmapMode`/`setHeatmapValue` to `Capabilities` once done), a raycast click handler calling `NotifyAssetClicked`.

## Navigate To / teleport

Room navigation is in the 3D scene itself, not the dashboard: **Esc → "Navigate to…"** opens the NAVIGATE TO list
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
