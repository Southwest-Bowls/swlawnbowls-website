#!/usr/bin/env bash
# One-time: store the PayPal SANDBOX keys in Vercel (Preview and Development only, never Production).
# You paste the values when asked. They are not shown on screen and not written to any file or to git.
# Run from the repo folder:  bash scripts/set-paypal-sandbox.sh
set -euo pipefail
echo "Paste the values from developer.paypal.com > Apps & Credentials > SWD Entries (Sandbox)."
read -r -p "Client ID: " CID
read -r -s -p "Secret (hidden): " SEC; echo
[ -n "$CID" ] && [ -n "$SEC" ] || { echo "Both values are needed."; exit 1; }
echo "Saving to Vercel (about 30 seconds)..."
for ENVN in preview development; do
  printf '%s' "$CID" | vercel env add HUB_PAYPAL_CLIENT_ID "$ENVN" --yes --force >/dev/null
  printf '%s' "$SEC" | vercel env add HUB_PAYPAL_CLIENT_SECRET "$ENVN" --yes --force >/dev/null
  printf '%s' "sandbox" | vercel env add HUB_PAYPAL_ENV "$ENVN" --yes --force >/dev/null
  echo "  $ENVN done"
done
unset CID SEC
echo "Saved for Preview and Development. Nothing was set for Production."
