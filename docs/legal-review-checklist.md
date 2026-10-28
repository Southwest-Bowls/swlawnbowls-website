# Things a lawyer should review before the app goes to the stores

Started 2026-10-28. This is a list of questions to take to a lawyer, **not legal advice** and not a statement of what the law requires. No lawyer is lined up yet. Tick items off as they are answered, and note who answered and when.

## 1. Who is legally behind the app
- [ ] Who is the publisher of the app in the stores, and who is the "controller" of members' data: the Division, the business that holds the store accounts, or both? Do the privacy policy, terms, store listings and website footer all say the same thing?
- [ ] Is there a written agreement between the Division and whoever builds and runs the app (see `docs/PUBLISHING.md`)? Does it cover ownership of code, data, name and logos, who pays for what, what happens if the relationship ends, and who holds the store, database and hosting accounts?
- [ ] Is the Division (a division of Bowls USA) allowed to take payments and run an app on its own, or does Bowls USA need to approve or be named?
- [ ] Succession: if the webmaster is unavailable, who legally controls the accounts? (`docs/succession-and-accounts.md`)

## 2. Privacy policy (`privacy.html`) and data
- [ ] Is the whole policy accurate and complete for what the app does today (email sign-in, roster matching, contact-change requests, contact form via Google Forms, YouTube and Google Sheets embeds, OpenFreeMap)?
- [ ] California rules (CCPA/CPRA): do they apply to the Division at its size, and do the policy wording and request process satisfy them? Is "we do not sell personal information" safe to say?
- [ ] Service providers (Supabase, Vercel, the email provider, Google, PayPal): do we need agreements with them, and does the policy need to name them? Data is held in the United States; any issue for members or guests outside it?
- [ ] Retention: how long do we keep the roster, activity logs, payment records, entry lists and backups? Are "deleted within 30 days" and the backup wording right?
- [ ] Children: the policy says the app is not directed at under-13s and that we do not ask for ages. Junior players are planned to appear by initials only. If the roster records that someone is a junior, does US children's privacy law (COPPA) or any California rule apply? Who may enter a junior, and may a junior hold their own account?
- [ ] Is publishing members' full names, clubs and results (and, planned, entry lists before the event) fine on the basis that the Division has always done so, or is notice or consent needed? Can a member ask not to be listed?
- [ ] Planned: push notifications, email notices, wallet passes with QR codes, photos of score cards. Each adds data. Policy wording needed for each.
- [ ] A data-breach plan: who is told, by whom, and when.

## 3. Account deletion (`delete-account.html`, `0005_delete_my_account.sql`)
- [ ] Does the deletion page accurately describe what is deleted and what is kept (roster, activity log, backups, payment records)? Apple and Google both read it.
- [ ] Is keeping the roster record after an app account is deleted acceptable, and what do we say to someone who also wants their roster record removed?

## 4. Terms of use
- [ ] The app has a Terms screen. Who wrote it, and does it match reality? Needed topics: acceptable use, accounts, ending an account, no warranty on results and scores, limits on liability, who may use the app, changes to the terms, governing law.
- [ ] Is a disclaimer needed for information that may be wrong (draws, start times, live scores)?

## 5. Tournament entries, fees and refunds (planned)
- [ ] Entry terms: who is bound when one person enters a whole team, and is a teammate's acceptance needed or is acknowledgement enough?
- [ ] Wording for the refund rule (full refund to whoever paid, with a per-event cut-off date), unpaid entries holding a place until the start, and what happens to a team that turns up and cannot pay.
- [ ] The Division absorbing PayPal fees and refunding in full: any issue with how that is described?
- [ ] Cash and cheque payments at the desk: record keeping and receipts. Any tax or nonprofit reporting that applies to entry fees?
- [ ] Prize money (for example the All Comers event): any reporting or tax rules?
- [ ] PayPal: does its merchant agreement allow how we plan to use it (an app that takes payments for events), and does the charity rate application affect anything?
- [ ] Do the stores' rules allow outside payment for entry to a physical event? (We believe so for physical services, but a second opinion is cheap.)
- [ ] Guests from other divisions or countries: who may enter, what do they agree to, how are their details handled?
- [ ] Liability waivers or assumption-of-risk language for events: does anything need to be in the app or on entry forms?

## 6. Scores and results
- [ ] Records of scores: the paper card is the official record and a mismatch is flagged to the tournament director. Is this wording right in the terms and the rules?
- [ ] Photos of score cards (decided 2026-10-28: optional, taken by the tournament director only, stored privately, **deleted 90 days after the tournament**). They carry names and signatures. Is 90 days right, who may see them, and does the policy need to say so? Does a dispute or complaint that is still open need to hold the photo longer?
- [ ] Publishing results and photos of winners: do we need permission from the people pictured, especially juniors?

## 7. Photos, video, music and logos
- [ ] Photos and video of members and juniors used on the website, in the app and in promos: what permission is needed, and how is it recorded?
- [ ] Footage from clubs, Instagram and YouTube that the Division does not own. Permission and credit.
- [ ] Music licences for promos (a free-music licence may not allow every use, such as paid ads or broadcast).
- [ ] Use of the Bowls USA, World Bowls and sponsor logos (Aero, Henselite, Drakes Pride) on the site and in the app.
- [ ] AI-generated voices or avatars: disclosure rules, and use of a cloned voice.

## 8. Store requirements
- [ ] Apple and Google: privacy labels / data safety forms, age rating, account deletion, and any rule about an app that mostly loads a website.
- [ ] Reviewer demo account: is it fine to give Apple a test login tied to real roster data?
- [ ] Sign-in with Google or Apple (planned): any extra terms or notices.

## 9. The website (Squarespace)
- [ ] The footer links Privacy Policy, Disclaimer and Copyright pages on the Squarespace site. Are those up to date and consistent with the app's policy?
- [ ] Cookie or tracking notices: the policy says no advertising or analytics trackers. Is that still true across the Squarespace site, its embedded videos and Facebook widgets?

## 10. Accessibility
- [ ] The app is used by many older members. Is there any accessibility standard or notice we should follow or state?
