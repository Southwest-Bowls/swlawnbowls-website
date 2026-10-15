# Wallet pass (Apple Wallet and Google Wallet): idea, requirements, order

Idea (Giulia): after entering, the player adds a tournament pass to their phone wallet. Shows event, date, venue, team, receipt number and a QR code the director scans to check them in.

## What each needs
| | Apple Wallet | Google Wallet |
|---|---|---|
| Account | Apple Developer Program (the LLC enrolment that is currently blocked) | Google Wallet API issuer account in the Google Pay and Wallet Console (free) |
| Credential | Pass Type ID + signing certificate; passes are signed .pkpass files | Issuer id + service account key; passes are signed links (JWT) |
| Content | Event ticket layout, logo, colours, barcode | Event ticket class + object, logo, hero image, barcode |
| Where it runs | Server function that builds and signs the pass, never in the browser | Server function that creates the object and signs the JWT |
| Updates | Pass can be updated later (e.g. status paid) through Apple's update service | Object can be patched through the API |

## Order
1. Entry backend and receipt (in progress).
2. QR on the receipt + a scan screen in the director console (check-in), needed by both passes anyway.
3. Google Wallet pass (does not wait for the Apple account).
4. Apple Wallet pass after the LLC's Apple Developer membership exists.

## Rules
- Pass content is built from our own data only: no invented times or promises.
- The QR carries only the entry reference and a signature, never contact details or payment data.
- Secrets (Apple certificate, Google key) go in Vercel environment variables, never in the repo.
