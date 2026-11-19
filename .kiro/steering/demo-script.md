---
inclusion: manual
---
# Demo script

Pull this in with `#demo-script` when preparing a recording or a live walkthrough. It is the order the demo runs in and the numbers it should land on; nothing here is a product rule.

## The 60-second path
1. Open the app fresh (`/?fresh`). The pager and **Watch a day (60 s)** sit above the fold, phone or desktop.
2. Press **Watch a day (60 s)**. The sample day loads and runs from 6 AM at 900x.
3. Press **ACK** (or `A`) each time the pager stops and beeps: six presses. The `100` digest and the `121`/`200` focus pages hold for 1.5 seconds and carry on by themselves.
4. Point at the Maya card while it runs: her phone's 15-minute reminder (37 min late), Apple's time-to-leave alert at the leave time (30 min late), Revenant's `411` get-ready before both (5 min early).
5. The day ends on the thermal receipt: "That was your day: 6 beeps, 4 kept quiet in the digest, 0 missed." and "6 beeps vs about 56 on a typical phone: 50 interruptions you did not get."

## The haunting
6. On the receipt, press **See what happens if you ignore it**. The day replays with the dentist's `911` unanswered; the pager shows `666 HAUNTING`, the moon turns red, the RIP row gets **Resurrect**.
7. Press **See the next morning**. At 7 AM: `666 YESTERDAY: DENTIST CLEANING. REBOOK?`. ACK alone does not clear it.
8. Press **Rebook**. A `121` "Call to rebook" block appears at 9 AM.

## Numbers to say, with their sources
- 42% of patients in an adult ADHD clinic missed three or more appointments (Soendergaard et al., 2016).
- Phones deliver a median of 56 notifications a day (Pielot et al., 2018).
- NeuroPage: more than 80% of those who finished the trial managed everyday tasks better with a pager (Wilson et al., 2001).
Every figure is in `docs/evidence.md`; do not quote one that is not.

## Before recording
- `npm run build && npm run preview`, then open `http://localhost:3151/?fresh`.
- Reduced motion off, sound on, browser zoom 100%.
- `node scripts/capture-media.mjs http://localhost:3151` refreshes the stills and the GIF afterwards.
