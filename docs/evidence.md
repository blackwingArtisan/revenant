# Evidence behind Revenant

Every number in the README, the app and the steering files, with its source. Each was checked against the primary source (the paper's own abstract or the agency's report) on 2026-11-18.

## The problem
| Claim | Source | What the source says |
|---|---|---|
| About 15.5 million US adults, 1 in 16, have a current ADHD diagnosis; more than half were diagnosed as adults | Staley BS, Robinson LR, Claussen AH, et al. *Attention-Deficit/Hyperactivity Disorder Diagnosis, Treatment, and Telehealth Use in Adults.* MMWR 73(40), 2024. [cdc.gov](https://www.cdc.gov/mmwr/volumes/73/wr/mm7340a1.htm) | 6.0% of US adults (about 15.5 million) reported a current diagnosis in Oct-Nov 2023; 55.9% received it at age 18 or later. |
| About a third of adults with ADHD get no treatment; 71.5% of those on stimulants had trouble filling the prescription | Same report | 36.5% were not receiving any treatment; 71.5% of adults taking a stimulant had difficulty getting the prescription filled because it was unavailable. |
| Adults with ADHD miss GP appointments about twice as often | McQueenie R, Ellis DA, Williamson A, Wilson P. *Attention-deficit/hyperactivity disorder and serial missed appointments in general practice.* PLOS Mental Health 1(2): e0000045, 2024. [doi:10.1371/journal.pmen.0000045](https://doi.org/10.1371/journal.pmen.0000045) | 824,374 patients in 136 Scottish practices. Adjusted for appointments made, ADHD was associated with missing GP appointments: OR 1.9 (95% CI 1.7-2.2) for adults, 1.6 (1.4-1.9) under 18. |
| In an adult ADHD clinic, 42% of patients missed three or more appointments | Soendergaard HM, Thomsen PH, Pedersen P, et al. *Treatment dropout and missed appointments among adults with ADHD.* J Clin Psychiatry 77(2): 232-239, 2016. [doi:10.4088/JCP.14m09270](https://doi.org/10.4088/JCP.14m09270) | Cohort of 151 adult outpatients in a Danish ADHD unit: 27% dropped out and 42% had 3 or more missed appointments during treatment. |
| People with ADHD judge time less accurately, across the lifespan | Metcalfe KB, McFeaters CD, Voyer D. *Time-Perception Deficits in ADHD: A Systematic Review and Meta-Analysis.* Developmental Neuropsychology 49(1): 1-24, 2024. [doi:10.1080/87565641.2023.2293712](https://doi.org/10.1080/87565641.2023.2293712) | 824 effect sizes; mean Hedges' g of 0.688 for the time-perception deficit in ADHD. |
| Across all specialties, about 23% of appointments are no-shows | Dantas LF, Fleck JL, Cyrino Oliveira FL, Hamacher S. *No-shows in appointment scheduling: a systematic literature review.* Health Policy 122(4): 412-421, 2018. [ideas.repec.org](https://ideas.repec.org/a/eee/hepoli/v122y2018i4p412-421.html) | Average no-show rate of about 23% across 105 studies. A general figure, not specific to ADHD. |
| Phones deliver a median of 56 notifications a day | Pielot M, Vradi A, Park S. *Dismissed! A detailed exploration of how mobile phone users handle push notifications.* MobileHCI 2018. [doi:10.1145/3229434.3229445](https://doi.org/10.1145/3229434.3229445) | 794,525 notifications from 278 users; a median of 56 per day; most notification types rarely lead to the user acting on them (about 15-25%). |

## The idea worked before
| Claim | Source | What the source says |
|---|---|---|
| Pager reminders helped people with memory and planning problems do everyday tasks | Wilson BA, Emslie HC, Quirk K, Evans JJ. *Reducing everyday memory and planning problems by means of a paging system: a randomised control crossover study.* J Neurol Neurosurg Psychiatry 70(4): 477-482, 2001. [doi:10.1136/jnnp.70.4.477](https://doi.org/10.1136/jnnp.70.4.477), full text [PMC1737307](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1737307/) | Randomised crossover trial (NeuroPage) with 143 people aged 8 to 83 with memory, planning, attention or organisation problems, most after a head injury or stroke. More than 80% of those who completed the 16-week trial were significantly more successful at everyday activities (self care, medication, keeping appointments) with the pager than at baseline, and most kept the gain 7 weeks after handing it back. |

The trial population is mostly people with brain injury, not ADHD. Revenant borrows the mechanism (a dedicated device that pages a short, specific instruction at the moment to act) and does not claim the trial's results for ADHD.

## Other tools, as documented by their makers
| Tool | Source | What it documents |
|---|---|---|
| Apple Calendar travel time and time-to-leave alerts | Apple, *Calendar User Guide for Mac: Add locations and travel info.* [help.apple.com](https://help.apple.com/calendar/mac/10.11/en.lproj/icl43600.html) | Alerts when to leave from current location, event location and traffic; finds the starting location from events up to three hours earlier; needs Location Services; no alert for trips over three hours. |
| Due | App Store listing, *Due - Reminders & Timers.* [apps.apple.com](https://apps.apple.com/app/id390017969) | Auto Snooze re-notifies a missed reminder every 1-60 minutes until it is marked done; no account; no location or travel features listed; Apple platforms only. |
| iOS Scheduled Summary | Apple, *Human Interface Guidelines: Managing notifications.* [developer.apple.com](https://developer.apple.com/design/human-interface-guidelines/managing-notifications) | Non-urgent notifications are held for a summary at set times; Time Sensitive notifications override scheduled delivery. |
| Tiimo | Tiimo, *FAQ.* [tiimoapp.com](https://www.tiimoapp.com/faq) | A visual daily planner for neurodivergent people with reminders; plans are billed monthly or yearly and sign-in uses the subscription email. The FAQ does not describe travel time or repeat-until-done reminders. |
