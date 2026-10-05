# Member platform — roster staging and review (local, private)

The first step of the shared member database for the website and app.
It stages the roster **exactly as received** and lets an admin review
ambiguous records. It does **not** merge anyone, create members or
accounts, or send anything.

Everything here runs on one computer. The database lives in
`member-platform/.data/` and the roster files stay in your Downloads
folder; neither is ever committed to Git or uploaded to the website
(`.gitignore` and `.vercelignore` exclude them).

## Use it

```
cd member-platform
npm install                 # once
npm run import:dry-run      # check the files; writes nothing
npm run import              # stage the roster (running it again changes nothing)
npm run review              # open http://localhost:8790
npm test                    # rules tests (made-up data only)
```

The importer reads `~/Downloads/Southwest-Member-Platform/` (the handoff
folder) and checks the original Excel file's fingerprint against the
audit before staging anything. Use `--dir` / `--source` for other paths.

## What the review screen does

* **Repeated names / Shared emails** — each group needs a recorded
  decision (keep separate, shared household contact, same person — to be
  approved later, needs info) with a reason. Nothing merges.
* **Club mapping** — every club label + code pairing needs approval.
  Suggestions are shown but never applied until approved. Label/code
  disagreements and clubs not on the website are flagged.
* **Data flags** — odd novice dates, malformed or missing emails, unclear
  club codes. Raw values are kept as received.
* Contact details are masked; showing a record's details is logged.
* Every decision is permanent (append-only) with who and why.

## What the database guarantees (tested)

* All rows staged with sheet/row provenance and a checksum; raw values
  can't be edited after staging; blanks stay blank.
* Same files imported twice → no change. A file that disagrees with its
  audit is rejected. A failure part-way rolls everything back.
* Members, contacts, accounts and links stay empty until approval.
* Decisions and audit events can't be changed or deleted.

## Still to decide (with the roster owner)

What the dues markers (x/X/blank), `Novices` and `begnov` mean; which
club Palm Desert is; the four label/code disagreements; and every
repeated-name and shared-email group.
