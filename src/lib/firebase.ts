import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??
    process.env.FIREBASE_API_KEY ??
    "",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??
    process.env.FIREBASE_AUTH_DOMAIN ??
    "",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
    process.env.FIREBASE_PROJECT_ID ??
    "",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    process.env.FIREBASE_STORAGE_BUCKET ??
    "",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??
    process.env.FIREBASE_MESSAGING_SENDER_ID ??
    "",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??
    process.env.FIREBASE_APP_ID ??
    "",
};

const configuredDatabaseId = (
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ??
  process.env.FIREBASE_DATABASE_ID ??
  ""
).trim();

const databaseId =
  !configuredDatabaseId ||
  configuredDatabaseId === "default" ||
  configuredDatabaseId === "(default)"
    ? "(default)"
    : configuredDatabaseId;

const isBrowser = typeof window !== "undefined";
const app = isBrowser
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export const auth = (isBrowser && app ? getAuth(app) : null) as Auth;
export const db = (isBrowser && app
  ? getFirestore(app, databaseId)
  : null) as Firestore;
