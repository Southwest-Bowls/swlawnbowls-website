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

## Design (Giulia: nicely done, colourful, logo, tagline, all the details)
- **Colour follows the event type**, the same scheme as the app: women's pink, men's blue, mixed yellow, open grey. Text colour chosen for contrast.
- **Header:** Southwest Bowls logo and name. **Tagline:** the original "Lawn Bowls: A Sport for Life!" image as a banner (hero/strip image), on a white band so it reads on any colour.
- **Front:** tournament name, date, venue, team (roles and names), receipt number, status (Paid / Payment pending), QR code.
- **Back (Apple) / details (Google):** entry fee, how they paid, organizer contact, "see the event page for the schedule", link to the receipt in the app. Nothing invented.
- **Images needed** (sizes to confirm in each platform's current docs at build time): Google about 660x660 logo and about 1032x336 hero; Apple a small wide logo and a strip image at 1x/2x/3x. The logo and tagline need clean, high-resolution originals with transparent backgrounds. Giulia has the originals; the current logo is a 422px JPEG with a faint dark fringe.
- **Updates:** when the director marks a check or cash payment received, the pass changes from "Payment pending" to "Paid" automatically.
