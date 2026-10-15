# Push notifications and Dynamic Island (Live Activities)

## Terms
- **Push notification:** banner on lock screen or top of the phone ("New tournament added", "Entry confirmed", "Your check was received").
- **Live Activity / Dynamic Island (iPhone):** a live, updating card on the lock screen and in the Dynamic Island, for something happening right now (a match in progress, a draw being published).
- **Android equivalent:** an ongoing/live-update notification.

## Our stack, not Expo
The store app is a Capacitor wrapper (repo gallogiulia/sw-bowls-app), not an Expo app. Expo's notification service and libraries only work inside Expo/React Native. We use `@capacitor/push-notifications` with Apple's APNs and Google's FCM directly (Firebase is the usual bridge for both). Same user experience.

## What needs what
| Feature | Needs |
|---|---|
| Push (new event, entry confirmed, check received, result posted) | Apple Developer account + APNs key; Firebase project for Android; a server job that sends them; user permission and a Notifications settings screen |
| Live Activity / Dynamic Island | All of the above plus a native SwiftUI Widget extension (cannot be done from the web app); built on a cloud Mac; iOS 16.2+; updates by push |
| Android live notification | FCM + a native notification channel |

## Suggested order
1. Push: entry confirmed, payment received, event changes, new event from a followed club. Opt-in per type in Settings.
2. Live Activity for **live scoring** of a followed event (needs live score data in the database first).
3. Live Activity for **entry status** is possible but low value; skip unless asked.

## Rules
- No marketing pushes; only things the person chose to follow or did themselves.
- Content built from our data only; no invented times.
- Players can switch every type off. Revoke on account deletion.
