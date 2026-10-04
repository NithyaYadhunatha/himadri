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
using System.Linq;
using System.Runtime.InteropServices;
using Maitri.DigitalTwin;
using Maitri.SystemFlow;
using UnityEngine;

public class WebBridge : MonoBehaviour
{
    [DllImport("__Internal")] private static extern void PolarTwinEmit(string json);

    private Camera cam;
    private FirstPersonController player;
    private Vector3 homePosition;
    private Quaternion homeRotation;

    private readonly Dictionary<string, Renderer[]> cache = new();
    // Commands the dashboard may send; announced so the UI knows what really works.
    private static readonly string[] Capabilities =
        { "focusAsset", "focusRoom", "setAssetHighlight", "setRoomState", "resetCamera", "toggleLayer",
          "setSystemFlow", "setSystemFlowFilter", "setSystemFlowFocus" };
    // Add "setHeatmapMode" / "setHeatmapValue" once the overlay shader below is implemented.

    [System.Serializable] private class Cmd
    {
        public string type, assetId, roomId, state, layer, variable, filter, componentId;
        public bool on, enabled; public float opacity;
    }

    private void Start()
    {
        cam = Camera.main;
        player = FirstPersonController.Instance != null ? FirstPersonController.Instance : FindAnyObjectByType<FirstPersonController>();
        if (player != null)
        {
            homePosition = player.transform.position;
            homeRotation = player.transform.rotation;
        }
        Emit("{\"type\":\"capabilities\",\"list\":[\"" + string.Join("\",\"", Capabilities) + "\"]}");
    }

    // Called by index.html via unityInstance.SendMessage("WebBridge","OnWebCommand",json)
    public void OnWebCommand(string json)
    {
        var c = JsonUtility.FromJson<Cmd>(json);
        switch (c.type)
        {
            case "focusAsset": Focus(FindAsset(c.assetId)); break;
            case "focusRoom": FocusRoom(c.roomId); break;
            case "resetCamera": Teleport(homePosition, homeRotation.eulerAngles.y); break;
            case "setAssetHighlight": Highlight(c.assetId, c.state); break;
            case "setRoomState": break; // TODO(scene): outline room volume by c.state (normal/warning/critical/offline)
            case "toggleLayer": break;  // TODO(scene): show/hide labels|rooms|sensors roots
            case "setSystemFlow": if (SystemFlowManager.Instance) SystemFlowManager.Instance.SetVisible(c.enabled); break;
            case "setSystemFlowFilter": if (SystemFlowManager.Instance) SystemFlowManager.Instance.SetFilter(c.filter); break;
            case "setSystemFlowFocus": if (SystemFlowManager.Instance) SystemFlowManager.Instance.SetFocus(c.componentId); break;
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
    private void FocusRoom(string roomId)
    {
        var monitored = FindObjectsByType<RoomController>().FirstOrDefault(r => r.roomId == roomId);
        if (monitored != null)
        {
            Teleport(monitored.navigationPoint, monitored.navigationYaw);
            return;
        }

        if (!TryDoorName(roomId, out var doorName)) return;
        var door = FindObjectsByType<AutoDoor>().FirstOrDefault(d => d.name == doorName);
        if (door == null) return;
        float side = Mathf.Sign(door.transform.position.z);
        float floorY = door.transform.position.y - door.doorHeight * 0.5f;
        var inside = new Vector3(door.transform.position.x, floorY + 0.1f, door.transform.position.z + side * 1.6f);
        Teleport(inside, side > 0f ? 0f : 180f);
    }

    private static bool TryDoorName(string roomId, out string doorName)
    {
        doorName = null;
        if (string.IsNullOrEmpty(roomId)) return false;
        var parts = roomId.Split('-');
        if (parts.Length != 3 || parts[0] != "maitri" || !int.TryParse(parts[2], out var number) || number < 1 || number > 8) return false;
        string side = parts[1] == "north" ? "N" : parts[1] == "south" ? "S" : null;
        if (side == null) return false;
        doorName = $"Door_Corr_{side}_{number - 1:00}";
        return true;
    }

    private void Teleport(Vector3 position, float yaw)
    {
        if (player == null) return;
        var controller = player.GetComponent<CharacterController>();
        if (controller != null) controller.enabled = false;
        player.transform.SetPositionAndRotation(position, Quaternion.Euler(0f, yaw, 0f));
        if (controller != null) controller.enabled = true;
    }

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
