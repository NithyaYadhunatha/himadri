# HIMADRI: 7-Minute Pitch (Final)
**Team Who Let the Bugs Out · SIH 2026 · PS 26060**

**The idea:** the demo isn't a list of pages. It's **one story**: *see the station → wire it to reality → break it → fix it → predict it → cut it off from the world.* Every screen answers the question the previous one raised, so nothing feels repetitive.

**Editing:** none beyond straight cuts. Face cam for the intro and close, two slides, and screen recordings for the demo. No sound effects, no transitions. The buzzer is the only sound effect, and it's real.

---

## Running order

| # | Time | Speaker | Beat | On screen |
|---|---|---|---|---|
| 1 | 0:00–0:30 | **Nithya** | Hook | Face cam |
| 2 | 0:30–1:15 | **Karthik** | Problem statement | **Slide 1** |
| 3 | 1:15–2:00 | **Akash** | Five superpowers | **Slide 2** |
| 4 | 2:00–3:15 | **Balram** | **SEE**: dashboard → floor plan → Unity 3D → assistant | Screen |
| 5 | 3:15–4:15 | **Aditya** | **THE LOOP**: hardware ⇄ Unity twin | Screen + board |
| 6 | 4:15–5:20 | **Noble** | **BREAK & FIX**: alert → diagnosis → two-person control | Screen |
| 7 | 5:20–6:30 | **Karthik** | **PREDICT & SURVIVE**: ML → risk → what-if → Wi-Fi off | Screen |
| 8 | 6:30–7:00 | **Nithya** + all six | Close | Face cam, everyone in frame |

**Akash** triggers the sensors silently during segment 5. **Balram** is the "second approver" in segment 6.

---

## THE TWO SLIDES

**Slide 1: The problem**
> **PS 26060** · Smart Automation
> *Digital Platform for Efficient Remote Management of Indian Antarctic Research Stations*
>
> Maitri (est. 1989) · Bharati (est. 2012)
>
> # MANUAL. SILOED. DISCONNECTED.
>
> *(small, bottom)* Most digital twins assume the internet is always on.

**Slide 2: Five superpowers**
> # HIMADRI
> **SEE**: 2D, floor-plan and Unity 3D twins of both stations
> **PREDICT**: ML failure forecasting + explainable risk heatmap
> **ACT**: remote control with two-person approval
> **SIMULATE**: "what if" in plain English
> **SURVIVE**: runs on the station itself; no internet needed
>
> **+ PolarTwin**: a hardware twin you can touch
>
> *(thin strip at the bottom)* Sensors → MQTT → FastAPI (Postgres · Neo4j · Redis) → Next.js + Unity WebGL

---

## SEGMENT 1: NITHYA · Hook (0:00–0:30) · face cam

> "Minus forty degrees. Winds that can touch two hundred miles an hour. And an internet connection slower than dial-up.
>
> That's life at India's research stations in Antarctica. And in the expedition footage we studied, this is how they check the fuel: someone walks out and dips a stick into the tank.
>
> *(beat)* A stick. For the fuel that keeps twenty-five people alive through the winter.
>
> We're Team Who Let the Bugs Out, and we decided to give the station a brain. **It's called HIMADRI.**"

---

## SEGMENT 2: KARTHIK · Problem statement (0:30–1:15) · Slide 1

> "Problem statement 26060: build a digital platform to remotely manage India's Antarctic stations, Maitri and Bharati.
>
> We went through expedition footage from both stations, and the problem fits in three words.
>
> **Manual.** Fuel dipped by hand, freezers read off thermometers, duty rosters pinned to a notice board.
>
> **Siloed.** Every lab keeps its own data, so nobody ever sees the whole station at once.
>
> **Disconnected.** About thirty kilobits a second on a good day, and in winter, sometimes nothing at all.
>
> And here's the catch: almost every digital twin out there assumes the internet is always on. *(beat)* Antarctica didn't get the memo."

---

## SEGMENT 3: AKASH · Five superpowers (1:15–2:00) · Slide 2

> "So HIMADRI gives the station five superpowers.
>
> It can **see**: live 2D, floor-plan and full 3D twins built in Unity.
> It can **predict**: machine learning that flags failing equipment before it breaks.
> It can **act**: remote control of station equipment, with two-person approval so no one makes a critical change alone.
> It can **simulate**: ask 'what if' in plain English and see what happens before it happens.
> And it can **survive**: the whole system runs *on the station*, so when the link to India dies, HIMADRI doesn't.
>
> And to prove this isn't just pixels, we built **PolarTwin**, a hardware twin you can actually touch. Balram, take it away."

---

## SEGMENT 4: BALRAM · SEE (2:00–3:15) · screen

**[Landing page → click Maitri → Dashboard]**
> "This is HIMADRI. Pick a station, and you're in Maitri's command center: fuel and food endurance, power, weather, open alerts. The whole station, on one screen, updating as we watch. And every number shows how old it is, because at minus forty, a stale reading is a dangerous one."

**[Station Twin → Floor Plan. Click the overlays in order: Thermal → Occupancy → Power]**
> "Here's the floor plan. One click, and it's a heat map. Another, and you see who's in which room. Another, and you see where the power is going. Same station, different lenses."

**[Station Twin → 3D Twin. Bharati, already loaded. Fullscreen. Slow orbit, then move inside]**
> "And this is where it gets real. **Bharati, in 3D**, built in Unity from the station's actual layout. A hundred and thirty-four shipping containers: the power plant and garage at the bottom, labs in the middle, living quarters on top. An engineer at headquarters in Goa, who has never set foot in Antarctica, can walk these corridors right now."

**[Exit fullscreen → Station Twin → 2D Twin. Open the assistant panel and type: *"Which systems are at risk right now?"*]**
> "And if you'd rather just ask, there's an assistant built into the twin. It answers from the station's live state, not from guesswork."

**[Back to 3D Twin → switch station to Maitri]**
> "But a twin is only as good as what feeds it. So we plugged Maitri's into something physical. Aditya?"

---

## SEGMENT 5: ADITYA · THE LOOP (3:15–4:15) · screen + board

**[Maitri Unity twin on screen, with the PolarTwin board visible (see "How to film the loop" below). Akash's hands are at the board.]**

> "This is **PolarTwin**. An Arduino reads six sensors, a Raspberry Pi gateway sends them to our backend, and the backend streams them straight into this Unity scene. Three rooms: environment, safety, and machine health.
>
> **Hardware to twin.** Akash, gas."

**[Akash: small puff from an UNLIT lighter at the MQ-2. Room 1 turns to alert in Unity; the board's RGB LED turns red.]**
> "Gas leak on the real sensor, and Room one goes into alert in the twin. Look at the board: the light just turned red too."

**[Akash shakes the board near the accelerometer. Room 3 flips HEALTHY → FAULT.]**
> "Now the machine starts shaking. Vibration spikes, and Room three flips to fault. Real world to 3D, in about a second."

**[Pause for one beat. Click BUZZER ON in the 3D twin header. The real buzzer sounds. Click OFF.]**
> "**Now the other way.** *(buzzer)* That's a real alarm, set off from a 3D model. The command is authenticated, queued, and confirmed by the device. It isn't a video of a twin. It's a loop.
>
> One honest note: the station data in the rest of this demo is simulated, because Maitri has no public live feed. But this pipeline is real, and adding real sensors is a registration, not a rewrite. Noble?"

---

## SEGMENT 6: NOBLE · BREAK & FIX (4:15–5:20) · screen

**[Someone off-camera triggers `fuel_leak` from the device agent as Noble starts speaking. Go to Operations → Alerts.]**
> "Let's break something on purpose. **A fuel line at Maitri just started leaking.**
>
> There it is. HIMADRI caught it, graded how serious it is, and started a clock: if nobody acknowledges it, it escalates up the chain. I'll take it."

**[Click Acknowledge. Go to Predictive & Risk → Diagnosis.]**
> "Now, why is it happening? Diagnosis ranks the likely causes, shows the evidence for each one, and gives you a step-by-step checklist, built from the procedures real expedition teams follow."

**[Station Twin → Remote Control. Issue a critical command, e.g. **Stop** on the affected equipment.]**
> "Time to act. I'll send a stop command to the equipment. Notice it didn't go through. **It's queued.** Critical commands need a second, *different* person to approve. I can't sign off on my own command."

**[Balram types his name in the approver field and clicks Approve. The state moves to applied.]**
> "Balram approves, and *now* it's applied. Every step, who asked, who approved, and when, is written to the audit log. No one person can make a dangerous change alone."

---

## SEGMENT 7: KARTHIK · PREDICT & SURVIVE (5:20–6:30) · screen

**[Predictive & Risk → Forecast]**
> "Diagnosis explains what already happened. This predicts what's next. Our machine learning model forecasts which systems are at risk over the next twenty-four hours, tracks its own accuracy, and retrains itself every week."

**[Predictive & Risk → Risk Heatmap. Click one cell.]**
> "The risk heatmap shows where the station is most vulnerable, and every score breaks down into the factors behind it. No black boxes."

**[Simulation → What-If Scenarios. In "Describe a scenario", type: *what if the resupply ship can't arrive* → run]**
> "Now the question every station leader dreads. I'll just type it: **what if the resupply ship can't arrive?**
>
> Days of fuel and food left, what fails first and when, and what it costs. It runs in a sandbox, so live data is never touched."

**[⭐ Turn off the laptop's Wi-Fi on camera. Click through Dashboard → Alerts → Floor Plan.]**
> "One last thing. **I'm turning off the internet. Right now.** *(click)*
>
> *(clicking through)* Dashboard, alerts, the twin: still running. Because HIMADRI doesn't live in the cloud. It lives on the station. When the link comes back, a sync queue sends everything home to India. Nithya?"

> ⚠️ **Only film the Wi-Fi-off beat if the backend, databases and frontend all run locally on the recording laptop** (docker compose + `npm run dev`). If anything points at a deployed server, this beat will fail on camera. In that case, drop the Wi-Fi click and just say: *"And none of this needs the internet. HIMADRI runs on the station itself, and a sync queue sends everything home when the link comes back."*

---

## SEGMENT 8: NITHYA + all six · Close (6:30–7:00) · face cam

> "So, back to that stick.
>
> Today, Maitri and Bharati run on paper, radio, and guesswork. With HIMADRI, they get a 3D twin they can walk through, warnings before things break, remote control that's safe by design, and a system that keeps working when the world goes silent.
>
> And we didn't just design it. **We built it: software *and* hardware.**
>
> We're Nithya, Karthik, Akash, Balram, Aditya and Noble. **Team Who Let the Bugs Out.** Thank you."

---

## How to film the loop (segment 5) with zero editing

Pick one:
- **Easiest:** put a phone on a tripod behind Aditya's shoulder, framing the **laptop screen and the board side by side**. One camera, one take, and cause and effect are both in frame. The buzzer is picked up naturally.
- **Cleaner:** OBS with a display capture of the Unity twin plus the phone as a webcam (DroidCam/Camo/Iriun) in a corner box. It's composited live, so there's still nothing to edit afterwards.

Print small **ROOM 1 / ROOM 2 / ROOM 3** tags and stick them on the board so the mapping to Unity is obvious.

---

## Before you record: checklist

**Unity**
1. Open **Station Twin → 3D Twin** and preload **Bharati, then Maitri**, so no loading bars show on camera. Use Chrome with hardware acceleration on and the laptop plugged in.
2. Rehearse one fixed camera path through Bharati: slow orbit, then in through one entrance. Slow moves look far better on video.

**Hardware**
3. Check the chain board → gateway → backend → Maitri Unity, and do a test buzzer click before every take.
4. Warm up the MQ-2 for 2–3 minutes. Keep the accelerometer still for 3 seconds after power-on, then zero it before the shake.
5. Gas beat: a tiny puff from an **unlit** lighter, in a ventilated room, away from any flame.

**Demo flow**
6. **Fuel leak:** it's triggered from the **device agent app** (the desktop agent's fault buttons: `fuel_leak`), not from the website. Have a teammate click it off-camera on cue.
7. **Remote control:** before recording, check which asset offers a command that needs **second approval** (the queued state with an approver field), and use that one for Noble's segment.
8. **Assistant:** it needs the LLM API key set in the frontend env. Test the exact question beforehand. If it's flaky, cut that line from Balram's segment. It's only 10 seconds.
9. **Wi-Fi off:** test it fully offline once before recording (see the ⚠️ note in segment 7).
10. Reset the demo state before every take so the alerts list starts clean.

**Delivery**
11. Record each segment as its own take, then join them with straight cuts.
12. Talk *to* the camera like you're telling a friend something cool, not reading. Pause on the bolded lines. They're the ones judges will remember.

---

## TELEPROMPTER (lines only)

**NITHYA**
Minus forty degrees. Winds that can touch two hundred miles an hour. And an internet connection slower than dial-up. That's life at India's research stations in Antarctica. And in the expedition footage we studied, this is how they check the fuel: someone walks out and dips a stick into the tank. A stick. For the fuel that keeps twenty-five people alive through the winter. We're Team Who Let the Bugs Out, and we decided to give the station a brain. It's called HIMADRI.

**KARTHIK**
Problem statement 26060: build a digital platform to remotely manage India's Antarctic stations, Maitri and Bharati. We went through expedition footage from both stations, and the problem fits in three words. Manual. Fuel dipped by hand, freezers read off thermometers, duty rosters pinned to a notice board. Siloed. Every lab keeps its own data, so nobody ever sees the whole station at once. Disconnected. About thirty kilobits a second on a good day, and in winter, sometimes nothing at all. And here's the catch: almost every digital twin out there assumes the internet is always on. Antarctica didn't get the memo.

**AKASH**
So HIMADRI gives the station five superpowers. It can see: live 2D, floor-plan and full 3D twins built in Unity. It can predict: machine learning that flags failing equipment before it breaks. It can act: remote control of station equipment, with two-person approval so no one makes a critical change alone. It can simulate: ask "what if" in plain English and see what happens before it happens. And it can survive: the whole system runs on the station, so when the link to India dies, HIMADRI doesn't. And to prove this isn't just pixels, we built PolarTwin, a hardware twin you can actually touch. Balram, take it away.

**BALRAM**
This is HIMADRI. Pick a station, and you're in Maitri's command center: fuel and food endurance, power, weather, open alerts. The whole station, on one screen, updating as we watch. And every number shows how old it is, because at minus forty, a stale reading is a dangerous one. Here's the floor plan. One click, and it's a heat map. Another, and you see who's in which room. Another, and you see where the power is going. Same station, different lenses. And this is where it gets real. Bharati, in 3D, built in Unity from the station's actual layout. A hundred and thirty-four shipping containers: the power plant and garage at the bottom, labs in the middle, living quarters on top. An engineer at headquarters in Goa, who has never set foot in Antarctica, can walk these corridors right now. And if you'd rather just ask, there's an assistant built into the twin. It answers from the station's live state, not from guesswork. But a twin is only as good as what feeds it. So we plugged Maitri's into something physical. Aditya?

**ADITYA**
This is PolarTwin. An Arduino reads six sensors, a Raspberry Pi gateway sends them to our backend, and the backend streams them straight into this Unity scene. Three rooms: environment, safety, and machine health. Hardware to twin. Akash, gas. Gas leak on the real sensor, and Room one goes into alert in the twin. Look at the board: the light just turned red too. Now the machine starts shaking. Vibration spikes, and Room three flips to fault. Real world to 3D, in about a second. Now the other way. *[BUZZER]* That's a real alarm, set off from a 3D model. The command is authenticated, queued, and confirmed by the device. It isn't a video of a twin. It's a loop. One honest note: the station data in the rest of this demo is simulated, because Maitri has no public live feed. But this pipeline is real, and adding real sensors is a registration, not a rewrite. Noble?

**NOBLE**
Let's break something on purpose. A fuel line at Maitri just started leaking. There it is. HIMADRI caught it, graded how serious it is, and started a clock: if nobody acknowledges it, it escalates up the chain. I'll take it. Now, why is it happening? Diagnosis ranks the likely causes, shows the evidence for each one, and gives you a step-by-step checklist, built from the procedures real expedition teams follow. Time to act. I'll send a stop command to the equipment. Notice it didn't go through. It's queued. Critical commands need a second, different person to approve. I can't sign off on my own command. Balram approves, and now it's applied. Every step, who asked, who approved, and when, is written to the audit log. No one person can make a dangerous change alone.

**KARTHIK**
Diagnosis explains what already happened. This predicts what's next. Our machine learning model forecasts which systems are at risk over the next twenty-four hours, tracks its own accuracy, and retrains itself every week. The risk heatmap shows where the station is most vulnerable, and every score breaks down into the factors behind it. No black boxes. Now the question every station leader dreads. I'll just type it: what if the resupply ship can't arrive? Days of fuel and food left, what fails first and when, and what it costs. It runs in a sandbox, so live data is never touched. One last thing. I'm turning off the internet. Right now. Dashboard, alerts, the twin: still running. Because HIMADRI doesn't live in the cloud. It lives on the station. When the link comes back, a sync queue sends everything home to India. Nithya?

**NITHYA**
So, back to that stick. Today, Maitri and Bharati run on paper, radio, and guesswork. With HIMADRI, they get a 3D twin they can walk through, warnings before things break, remote control that's safe by design, and a system that keeps working when the world goes silent. And we didn't just design it. We built it: software and hardware. We're Nithya, Karthik, Akash, Balram, Aditya and Noble. Team Who Let the Bugs Out. Thank you.
