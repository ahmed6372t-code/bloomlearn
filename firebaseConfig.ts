import { initializeApp, getApps } from "firebase/app";
import { initializeAuth, getAuth, indexedDBLocalPersistence } from "firebase/auth";
import { initializeFirestore, getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

export const firebaseConfig = {
  apiKey: "AIzaSyBFnQVweQtxfdS9xN7-Y2q08tzdDljMoKc",
  authDomain: "gen-lang-client-0865855905.firebaseapp.com",
  projectId: "gen-lang-client-0865855905",
  storageBucket: "gen-lang-client-0865855905.firebasestorage.app",
  messagingSenderId: "120361277566",
  appId: "1:120361277566:web:4da2fc11aee2917c1be02f",
  measurementId: "G-7GKW1H4NLH"
};

// Firebase 12 logs a false-positive RN warning about getReactNativePersistence
// (the API was removed from the JS SDK in v11). Suppress it before initializing.
const _consoleWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("getReactNativePersistence")) return;
  _consoleWarn(...args);
};

// Initialize Firebase app only once
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Auth with indexedDB persistence (correct for Firebase 12 in React Native)
let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: indexedDBLocalPersistence,
  });
} catch {
  authInstance = getAuth(app);
}
export const auth = authInstance;

// Initialize Firestore with long polling for React Native
let dbInstance;
try {
  dbInstance = getFirestore(app);
} catch {
  dbInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  });
}
export const db = dbInstance;

// Initialize Cloud Functions
export const functions = getFunctions(app);
