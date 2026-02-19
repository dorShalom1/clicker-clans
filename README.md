# Clicker Clans

Cross-platform clicker game built with Expo + React Native for Android and iOS.

## Current MVP

- Big tap button that increases click count
- `Classic` mode
- Levels every 25 clicks
- Prize unlocks based on level milestones
- Trophy unlocks based on activity and progress
- `Multiplayer` mode
- Team selection
- Shared team click counter
- Live leaderboard (simulated rival team growth)

## Run locally

```bash
npm install
npm run ios
npm run android
```

From a fresh machine, run:

```bash
npx create-expo-app@latest clicker-clans --template blank-typescript
```

## Next backend steps for real multiplayer

- Add authentication (Supabase/Firebase/Auth0)
- Store users, teams, and clicks in a backend database
- Sync leaderboards in real time via WebSockets
- Add anti-cheat/rate-limiting
- Add seasons and prize claim APIs
