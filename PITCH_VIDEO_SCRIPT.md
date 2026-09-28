# HIMADRI: 7-Minute Pitch Video Script
**Team Who Let the Bugs Out · SIH 2026 · PS 26060 · Smart Automation**

**Tone:** a pitch, not a trailer. You are talking *to the judges*: confident, clear, conversational. Think founder demo day, not movie teaser. Speak in first person plural ("we built", "watch what happens"). Keep the energy up but never shout.

| Block | Time | Who | On screen |
|---|---|---|---|
| Hook | 0:00–0:25 | Speaker 1 | Face cam |
| Problem statement | 0:25–1:20 | Speaker 1 | Face cam + slides |
| Our answer: HIMADRI | 1:20–2:00 | Speaker 1 | Face cam + montage |
| Demo 1: Command center | 2:00–2:25 | Speaker 2 | Screen |
| **Demo 2: Unity 3D twin** ⭐ | 2:25–3:35 | Speaker 2 | Screen (Unity) |
| **Demo 3: PolarTwin hardware ↔ Unity** ⭐ | 3:35–4:55 | Speaker 2 (+ Speaker 3 at the board) | Unity + board PiP |
| Demo 4: Fault + diagnosis | 4:55–5:20 | Speaker 2 | Screen |
| **Demo 5: Cut the link** ⭐ | 5:20–5:55 | Speaker 2 | Screen |
| Demo 6: What-if simulation | 5:55–6:20 | Speaker 2 | Screen |
| Demo 7: Sync restore | 6:20–6:40 | Speaker 2 | Screen |
| Agent + QR, close | 6:40–7:00 | Speaker 1 | Screen, then face cam |

> Only one person? Read every speaker's lines yourself. Two or three people keeps it lively, and a teammate standing at the hardware looks great on camera.

**Audio:** one low, modern instrumental bed under the whole thing (search "corporate tech ambient" or "startup pitch background" on YouTube Audio Library or Pixabay Music), at roughly −25 dB so it never fights the voice. **No trailer sound effects.** The only "sound effect" is the **real buzzer** from the hardware, which is the one moment the music dips to silence.

---

## PART 1: INTRO + PROBLEM STATEMENT (0:00–2:00)

### 0:00–0:25 · THE HOOK
🎬 **Face cam**, Speaker 1 centred, looking straight into the lens. No logo yet.

🎙️ **Speaker 1:**
"Quick question. How do you think India checks how much fuel is left at its Antarctic research station?

*(beat)*

Sensors? Dashboards? Some satellite system?

*(beat, small smile)*

**A stick.**"

🎬 Cut to the documentary still of the **dip-stick fuel check** for 2 seconds, then back to face cam.

🎙️ "Someone walks out in minus-thirty, dips a stick into the tank, and writes the number down. That's the station that keeps twenty-five people alive through an Antarctic winter. **We're here to change that.**"

### 0:25–0:40 · WHO WE ARE
🎬 Lower third: *Team Who Let the Bugs Out · NHCE-SIH-1*. Title card: **HIMADRI: Remote Intelligence for Maitri & Bharati**
🎙️ **Speaker 1:**
"We're Team **Who Let the Bugs Out**, and this is **HIMADRI**, our answer to problem statement **26060**: a digital platform for efficient remote management of India's Antarctic research stations."

### 0:40–1:20 · THE PROBLEM
🎬 Slide: a map of Antarctica with **Maitri** (Schirmacher Oasis, 1989) and **Bharati** (Larsemann Hills, 2012) marked.
🎙️ **Speaker 1:**
"India runs two stations down there. **Maitri**, operating since 1989, and **Bharati**, built out of a hundred and thirty-four shipping containers."

🎬 Slide: three pain points appear one at a time, each with a photo from the footage (dip-stick, paper notice board, a thermometer).
🎙️ "When we went through expedition footage from both stations, three things stood out.
**One:** almost everything is manual. Fuel is dipped by hand, freezers are read off thermometers, and duty rosters are paper on a notice board.
**Two:** every lab and every system keeps its data in its own silo. Nobody has the full picture.
**Three,** and this is the big one: **the link to India is fragile.** Around thirty kilobits per second over satellite on a good day. And in winter, the station can be cut off for long stretches."

🎬 Slide: **"Most digital twins assume the internet is always on. Antarctica doesn't."**
🎙️ "So a normal cloud dashboard fails at exactly the moment the station needs it most. That's the gap we built for."

### 1:20–2:00 · OUR ANSWER: HIMADRI
🎬 Face cam, with a quick montage cut in behind or beside Speaker 1: Unity 3D station → dashboard → hardware board → QR scan.
🎙️ **Speaker 1:**
"HIMADRI is a **live digital twin** of Maitri and Bharati. It does four things.

It **mirrors** the station: a 3D replica in Unity, bound to live data.
It **warns** you: predictive alerts and risk maps that catch failures before they happen.
It **acts**: operators can control real equipment remotely, with two-person approval for anything critical.
And it **survives**: when the satellite link dies, the station keeps running on its own and syncs back when the link returns.

And we didn't want to just *say* it controls real hardware. So we built a working **hardware twin** too. Let us show you."

🎬 Hard cut to screen.

---

## PART 2: LIVE DEMO (2:00–7:00)

> Speaker 2 narrates everything below while driving the screen. The pace is relaxed but never idle: **every sentence should match something happening on screen.**

### 2:00–2:25 · COMMAND CENTER
🎬 Home dashboard (`/`), **Maitri** selected. The numbers update live.
🎙️ **Speaker 2:**
"This is the command center for Maitri. Every subsystem in one view: fuel endurance, power, food, weather, and open alerts. These values are streaming in live, and every number shows its unit and how fresh it is, because in Antarctica, a five-hour-old reading can be dangerous."

🎬 Click the station switcher to show **Bharati** exists, then switch back.
🎙️ "One platform, both stations. Switch with a single click."

### 2:25–3:35 · THE UNITY 3D TWIN ⭐
🎬 Sidebar → **Twin → 3D** (`/twin/3d`). Switch the station to **Bharati**. Wait for the Unity scene to fully load **before you start talking** (preload it; see the setup checklist below). Click the fullscreen button.
🎙️ **Speaker 2:**
"This is the heart of HIMADRI: a **3D digital twin built in Unity**. This is Bharati, recreated from the station's real layout: container modules, the garage and power plant on the ground floor, labs above, living quarters on top."

🎬 **Slowly** orbit the exterior for 5–6 seconds, then move in and walk through the rooms. Slow camera moves read far better on video than fast ones.
🎙️ "You can move through it the way a crew member would walk the station. For someone at headquarters in India who has never set foot here, this is the station."

🎬 Exit fullscreen and switch the station to **Maitri**. The Maitri Unity scene loads, and the **BUZZER ON/OFF controls appear in the header**.
🎙️ "And this is Maitri. This one isn't just a model. **It's wired to real sensors.** Every room here has devices with live values: temperature, gas, presence, vibration. When the value changes in the real world, the room changes here. Let us prove it."

### 3:35–4:55 · POLARTWIN: HARDWARE ↔ UNITY ⭐⭐ (THE SHOWSTOPPER)
🎬 **Picture-in-picture:** Maitri Unity twin full screen, with a live camera feed of the PolarTwin board in a corner box (about 30% of the frame). Speaker 3 stands at the board with their hands in shot.

🎙️ **Speaker 2:**
"This is **PolarTwin**, our hardware twin. An **Arduino Uno** reads every sensor, a **Raspberry Pi gateway** validates the data and pushes it to our backend, and the backend streams it into the Unity scene over WebSocket, in real time. It's laid out as three rooms, just like a station module."

🎬 Callout labels on the camera feed:
- **Room 1: Environment**: DHT11 (temperature + humidity), MQ-2 (gas)
- **Room 2: Safety & Occupancy**: IR presence, HC-SR04 ultrasonic distance, Hall-effect door sensor
- **Room 3: Machine Health**: ADXL335 accelerometer (vibration)

**3:55 · Gas leak**
🎬 Speaker 3 releases a little gas from an **unlit** lighter near the MQ-2. In Unity, **Room 1 turns to alert**. On the board, the **RGB LED turns red**.
🎙️ "Let's simulate a gas leak on the real sensor... and there it is. Room 1 in the twin goes into alert, and the status light on the hardware turns red. Same event, both worlds, within a second."

**4:10 · Someone enters**
🎬 Speaker 3 waves a hand past the IR sensor, then brings a magnet to the Hall sensor. In Unity, **Room 2 shows Occupied and Door open**.
🎙️ "Someone walks in and opens a door. The twin knows the room is occupied. At a station where you do headcounts during blizzards, that matters."

**4:20 · Machine fault**
🎬 Speaker 3 shakes the board near the ADXL335. In Unity, Room 3's vibration value spikes and the **Failure Indicator flips from HEALTHY to FAULT**.
🎙️ "Now a generator starts vibrating out of spec. The accelerometer catches it, and the twin flags a fault before anyone on the floor would notice."

**4:32 · Control from the twin** *(the "whoa" moment)*
🔊 The music bed dips to silence.
🎙️ "So far, data has been flowing from the hardware to the screen. Now let's go the other way."
🎬 Click **BUZZER ON** in the 3D twin header. **The real buzzer sounds** on camera. Hold for 1–2 seconds, then click **OFF**.
🎙️ "One click in the twin, and a **real alarm** goes off on the physical device. That command is authenticated, queued, picked up by the gateway, and acknowledged. It isn't fire-and-forget."
🔊 The music comes back.

**4:48**
🎙️ "To be upfront: the station telemetry in the rest of this demo is simulated, because there's no public live feed from Maitri or Bharati. But **this pipeline is real.** Plugging in real station sensors is a device registration, not a rewrite."

### 4:55–5:20 · A FAULT, DETECTED AND DIAGNOSED
🎬 Trigger **fuel_leak** in the simulator. The alert fires and the fuel endurance projection drops.
🎙️ **Speaker 2:**
"Back to the full station. A fuel transfer line at Maitri starts leaking. HIMADRI catches it, grades its severity, ties it to the exact location, and if nobody acknowledges it, escalates automatically."
🎬 Open the alert → **Diagnose** (`/diagnosis`).
🎙️ "Hit Diagnose, and you get the most likely causes ranked, the evidence for each, and a step-by-step check sequence, built from the maintenance procedures expedition teams actually follow."

### 5:20–5:55 · CUT THE LINK ⭐
🎬 Admin → **Cut link**. The banner switches to **PNR-ISOLATED**.
🎙️ **Speaker 2:**
"Now the part that matters most. It's winter, and the satellite link to India drops. Most platforms stop working right here. Watch what happens."
🎬 Click through quickly: dashboard still live → alerts still firing → a remote-control command still going through → forecast still running.
🎙️ "Dashboard: still live. Alerts: still firing. Remote control: still working. Forecasts: still running. **Nothing here depends on India.** The station is the source of truth, and headquarters is just a mirror. That's the design decision everything else is built on."

### 5:55–6:20 · WHAT-IF SIMULATION
🎬 **Simulation** (`/simulation`). Run the scenario **"Resupply ship cannot arrive."**
🎙️ **Speaker 2:**
"While isolated, the station leader faces the real question: *what if the resupply ship can't make it?* The simulation sandbox answers it: how many days of fuel and food are left, what fails first and when, and what it costs in rupees. It never touches live data, so you can test any decision safely."

### 6:20–6:40 · LINK RESTORED
🎬 Click **Reconnect**. The sync queue drains, then zoom in on the row-count match.
🎙️ **Speaker 2:**
"Link's back, but it's still only thirty kilobits. So HIMADRI syncs smart: **alerts first, then summaries, raw data last.** And the counts match: **zero records lost.**"

### 6:40–7:00 · AGENT, QR, AND CLOSE
🎬 Quick cuts: type *"How many days of fuel do we have at Maitri?"* into the assistant and show the cited answer → a phone scans a printed **QR equipment passport** from `/assets/qr-sheet`.
🎙️ **Speaker 1:**
"Crew can ask questions in plain language and get answers grounded in live data, or scan any machine to see its full history, even offline."

🎬 Final cut back to face cam, or to the Unity twin slowly rotating with the HIMADRI logo.
🎙️ **Speaker 1:**
"From a dip-stick to a live 3D twin that keeps working when the world goes quiet. **That's HIMADRI.** Thank you."

🎬 End card: *HIMADRI · Team Who Let the Bugs Out · SIH 2026 · PS 26060*

---

## ARRANGEMENTS: GETTING THE UNITY 3D TWIN ON VIDEO

### Where it lives
- Page: **`/twin/3d`** in the frontend. The station switcher picks which Unity build loads:
  - **Maitri** → `public/unity/index.html`. **Connected to the live hardware** via the backend digital-twin bridge. The **BUZZER ON/OFF** buttons appear only in this view.
  - **Bharati** → `public/unity/bharati/index.html`. The architectural walkthrough (no live hardware link).
- Fallback if Unity won't load: **`/twin/floorplan`** (2D twin).

### Setup checklist (do this before you hit record)
1. **Run the full stack**: backend, frontend, and the PolarTwin serial gateway (see `PolarTwinDualBoard/server/README.md`). Check that the Uno shows up on the Pi or laptop and that telemetry is reaching the backend *before* opening Unity.
2. **Preload both Unity builds.** The first load downloads the WebGL `.wasm` and `.data` files and can take 10–30 seconds. Open `/twin/3d`, load **Bharati**, then **Maitri**, and let each finish. Second loads are much faster, so never let the judges watch a loading bar.
3. **Test the Bharati build on the exact machine and server you'll record on.** Its files are gzipped (`WebGL.*.gz`). `next.config.ts` already sends the `Content-Encoding: gzip` headers, but if you serve it any other way (a static host, `npx serve`, etc.) it can get stuck or throw a decompression error. Check this a day early, not an hour before.
4. **Use Chrome with hardware acceleration on** (Settings → System). Close other tabs. Plug in the laptop, since WebGL throttles on battery.
5. **Rehearse the camera path** in each Unity scene. Decide in advance which rooms you'll enter and in what order. Slow, deliberate moves, with no spinning or overshooting.
6. **Record at 1080p, 60 fps if possible** (OBS works well). Use 60 fps for the Unity segments so the 3D motion looks smooth.
7. **Hardware prep**:
   - Warm up the MQ-2 for 2–3 minutes before the take.
   - Keep the ADXL335 still for 3 seconds after power-on, then hit **Zero ADXL335** before the shake beat.
   - Point a mic at the buzzer so it's clearly audible.
8. **Reset the demo state** before every take (`pnpm demo:reset`) so the alerts and history look clean.

### How to shoot the hardware + Unity segment
- **Best option:** OBS with two sources. **Display capture** of the Unity twin (full frame) plus a **phone as a webcam** (DroidCam / Camo / Iriun) filming the board from above, placed as a picture-in-picture box in the bottom-right corner. Everything is recorded in **one take**, so cause and effect are visible at the same moment. That's what makes it believable.
- **Backup option:** record the screen and the phone separately, then sync them in the edit using the buzzer sound as the clap marker.
- Label the board: small printed tags saying **ROOM 1 / ROOM 2 / ROOM 3** make the mapping to the Unity rooms obvious on camera.

---

## TELEPROMPTER (LINES ONLY)

**SPEAKER 1 (0:00)**
Quick question. How do you think India checks how much fuel is left at its Antarctic research station? Sensors? Dashboards? Some satellite system? A stick. Someone walks out in minus-thirty, dips a stick into the tank, and writes the number down. That's the station that keeps twenty-five people alive through an Antarctic winter. We're here to change that.

We're Team Who Let the Bugs Out, and this is HIMADRI, our answer to problem statement 26060: a digital platform for efficient remote management of India's Antarctic research stations.

India runs two stations down there. Maitri, operating since 1989, and Bharati, built out of a hundred and thirty-four shipping containers. When we went through expedition footage from both stations, three things stood out. One: almost everything is manual. Fuel is dipped by hand, freezers are read off thermometers, and duty rosters are paper on a notice board. Two: every lab and every system keeps its data in its own silo. Nobody has the full picture. Three, and this is the big one: the link to India is fragile. Around thirty kilobits per second over satellite on a good day. And in winter, the station can be cut off for long stretches. So a normal cloud dashboard fails at exactly the moment the station needs it most. That's the gap we built for.

HIMADRI is a live digital twin of Maitri and Bharati. It does four things. It mirrors the station: a 3D replica in Unity, bound to live data. It warns you: predictive alerts and risk maps that catch failures before they happen. It acts: operators can control real equipment remotely, with two-person approval for anything critical. And it survives: when the satellite link dies, the station keeps running on its own and syncs back when the link returns. And we didn't want to just say it controls real hardware. So we built a working hardware twin too. Let us show you.

**SPEAKER 2 (2:00)**
This is the command center for Maitri. Every subsystem in one view: fuel endurance, power, food, weather, and open alerts. These values are streaming in live, and every number shows its unit and how fresh it is, because in Antarctica, a five-hour-old reading can be dangerous. One platform, both stations. Switch with a single click.

This is the heart of HIMADRI: a 3D digital twin built in Unity. This is Bharati, recreated from the station's real layout: container modules, the garage and power plant on the ground floor, labs above, living quarters on top. You can move through it the way a crew member would walk the station. For someone at headquarters in India who has never set foot here, this is the station.

And this is Maitri. This one isn't just a model. It's wired to real sensors. Every room here has devices with live values: temperature, gas, presence, vibration. When the value changes in the real world, the room changes here. Let us prove it.

This is PolarTwin, our hardware twin. An Arduino Uno reads every sensor, a Raspberry Pi gateway validates the data and pushes it to our backend, and the backend streams it into the Unity scene over WebSocket, in real time. It's laid out as three rooms, just like a station module.

Let's simulate a gas leak on the real sensor... and there it is. Room 1 in the twin goes into alert, and the status light on the hardware turns red. Same event, both worlds, within a second.

Someone walks in and opens a door. The twin knows the room is occupied. At a station where you do headcounts during blizzards, that matters.

Now a generator starts vibrating out of spec. The accelerometer catches it, and the twin flags a fault before anyone on the floor would notice.

So far, data has been flowing from the hardware to the screen. Now let's go the other way. *[BUZZER]* One click in the twin, and a real alarm goes off on the physical device. That command is authenticated, queued, picked up by the gateway, and acknowledged. It isn't fire-and-forget.

To be upfront: the station telemetry in the rest of this demo is simulated, because there's no public live feed from Maitri or Bharati. But this pipeline is real. Plugging in real station sensors is a device registration, not a rewrite.

Back to the full station. A fuel transfer line at Maitri starts leaking. HIMADRI catches it, grades its severity, ties it to the exact location, and if nobody acknowledges it, escalates automatically. Hit Diagnose, and you get the most likely causes ranked, the evidence for each, and a step-by-step check sequence, built from the maintenance procedures expedition teams actually follow.

Now the part that matters most. It's winter, and the satellite link to India drops. Most platforms stop working right here. Watch what happens. Dashboard: still live. Alerts: still firing. Remote control: still working. Forecasts: still running. Nothing here depends on India. The station is the source of truth, and headquarters is just a mirror. That's the design decision everything else is built on.

While isolated, the station leader faces the real question: what if the resupply ship can't make it? The simulation sandbox answers it: how many days of fuel and food are left, what fails first and when, and what it costs in rupees. It never touches live data, so you can test any decision safely.

Link's back, but it's still only thirty kilobits. So HIMADRI syncs smart: alerts first, then summaries, raw data last. And the counts match: zero records lost.

**SPEAKER 1 (6:40)**
Crew can ask questions in plain language and get answers grounded in live data, or scan any machine to see its full history, even offline. From a dip-stick to a live 3D twin that keeps working when the world goes quiet. That's HIMADRI. Thank you.
