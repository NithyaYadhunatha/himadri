// PolarTwin web <-> 3D bridge (Unity side).
//
// Setup: add this script to an empty GameObject NAMED EXACTLY "WebBridge" in the
// Maitri scene, put WebBridge.jslib under Assets/Plugins/WebGL/, rebuild WebGL
// and replace frontend/public/unity/Build/*. The dashboard host page
// (public/unity/index.html) already forwards commands to this object.
//
// ASSUMPTION: scene objects are named after the backend device ids
// (sensor-dht-01, sensor-mq2-01, buzzer-01 ...), matching the Data(...) calls in
// DigitalTwinSceneBuilder.cs. Adjust FindAsset() if your hierarchy differs.
using System.Collections.Generic;
using System.Runtime.InteropServices;
using UnityEngine;

public class WebBridge : MonoBehaviour
{
    [DllImport("__Internal")] private static extern void PolarTwinEmit(string json);

    [SerializeField] private Camera cam;
    [SerializeField] private Transform homePose;
    [SerializeField] private Transform[] roomPoses = new Transform[3]; // room-01..03 camera anchors

    private readonly Dictionary<string, Renderer[]> cache = new();
    private GameObject selected;

    // Commands the dashboard may send; announced so the UI knows what really works.
    private static readonly string[] Capabilities =
        { "focusAsset", "focusRoom", "setAssetHighlight", "setRoomState", "resetCamera", "toggleLayer" };
    // Add "setHeatmapMode" / "setHeatmapValue" once the overlay shader below is implemented.

    [System.Serializable] private class Cmd
    {
        public string type, assetId, roomId, state, layer, variable;
        public bool on; public float opacity;
    }

    private void Start()
    {
        if (cam == null) cam = Camera.main;
        Emit("{\"type\":\"capabilities\",\"list\":[\"" + string.Join("\",\"", Capabilities) + "\"]}");
    }

    // Called by index.html via unityInstance.SendMessage("WebBridge","OnWebCommand",json)
    public void OnWebCommand(string json)
    {
        var c = JsonUtility.FromJson<Cmd>(json);
        switch (c.type)
        {
            case "focusAsset": Focus(FindAsset(c.assetId)); break;
            case "focusRoom": FocusPose(RoomIndex(c.roomId)); break;
            case "resetCamera": if (homePose) Snap(homePose); break;
            case "setAssetHighlight": Highlight(c.assetId, c.state); break;
            case "setRoomState": break; // TODO(scene): outline room volume by c.state (normal/warning/critical/offline)
            case "toggleLayer": break;  // TODO(scene): show/hide labels|rooms|sensors roots
        }
    }

    // Call from your click handler (raycast hit) so the dashboard selects the asset.
    public void NotifyAssetClicked(string assetId) =>
        Emit("{\"type\":\"assetSelected\",\"assetId\":\"" + assetId + "\"}");
    public void NotifyRoomClicked(string roomId) =>
        Emit("{\"type\":\"roomSelected\",\"roomId\":\"" + roomId + "\"}");

    private static void Emit(string json)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        PolarTwinEmit(json);
#endif
    }

    private GameObject FindAsset(string id) => string.IsNullOrEmpty(id) ? null : GameObject.Find(id);
    private static int RoomIndex(string roomId) => roomId switch { "room-01" => 0, "room-02" => 1, "room-03" => 2, _ => -1 };
    private void FocusPose(int i) { if (i >= 0 && i < roomPoses.Length && roomPoses[i]) Snap(roomPoses[i]); }
    private void Snap(Transform t) { if (cam) cam.transform.SetPositionAndRotation(t.position, t.rotation); }

    private void Focus(GameObject go)
    {
        if (go == null || cam == null) return;
        var p = go.transform.position;
        cam.transform.position = p + (cam.transform.position - p).normalized * 2.0f; // keeps the user's viewing direction
        cam.transform.LookAt(p);
    }

    private static readonly Dictionary<string, Color> Tint = new()
    {
        ["selected"] = new Color(0.52f, 0.8f, 0.09f), ["normal"] = new Color(0.13f, 0.77f, 0.37f),
        ["warning"] = new Color(0.96f, 0.62f, 0.04f), ["critical"] = new Color(0.94f, 0.27f, 0.27f),
        ["offline"] = new Color(0.42f, 0.45f, 0.5f),
    };

    private void Highlight(string id, string state)
    {
        var go = FindAsset(id);
        if (go == null || !Tint.TryGetValue(state, out var col)) return;
        if (!cache.TryGetValue(id, out var rs)) cache[id] = rs = go.GetComponentsInChildren<Renderer>();
        // Emission glow (needs an emission-capable material, e.g. URP/Lit or Standard). Keeps the base colour: no full recolour.
        foreach (var r in rs)
        {
            r.material.EnableKeyword("_EMISSION");
            r.material.SetColor("_EmissionColor", state == "normal" || state == "offline" ? Color.black : col * 1.5f);
        }
    }
}
