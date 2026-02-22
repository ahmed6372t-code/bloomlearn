# BloomLearn

Garden-themed study app built with Expo + React Native. Users import materials, generate a learning matrix, and grow knowledge through game stages. Progress is stored in Firebase (Firestore + Storage) with Cloud Functions for Gemini-powered extraction and scoring.

## Requirements

- Node.js 18+ and npm
- Expo CLI (via `npx expo`)
- Firebase CLI (only if deploying Functions)

## Setup

1) Install dependencies

```bash
npm install
```

2) Start the Expo dev server

```bash
npm run start
```

If port 8081 is already in use, run:

```bash
npm run start -- --port 8082
```

3) Configure Gemini for Firebase Functions (required for file baking and scoring)

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

Then deploy Functions:

```bash
firebase deploy --only functions
```

## Run targets

- Android: `npm run android`
- iOS: `npm run ios`
- Web: `npm run web`

## Notes

- Firebase config lives in `firebaseConfig` (project-specific values required).
- Secrets are stored in Firebase Secret Manager; no `.env` is required.
