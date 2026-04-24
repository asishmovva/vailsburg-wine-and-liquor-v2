import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

let adminApp: App | null = getApps().length ? getApps()[0] : null;

function getPrivateKey() {
  const key = process.env.FIREBASE_PRIVATE_KEY;
  return key ? key.replace(/\\n/g, "\n") : undefined;
}

function getStorageBucketName() {
  return (
    process.env.FIREBASE_STORAGE_BUCKET ??
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    ""
  ).trim();
}

export function getAdminApp() {
  if (adminApp) return adminApp;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase Admin credentials in env vars.");
  }

  adminApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  return adminApp;
}

export function adminAuth() {
  return getAuth(getAdminApp());
}

export function adminDb() {
  const configuredDatabaseId = (process.env.FIREBASE_DATABASE_ID ?? "").trim();
  const databaseId =
    !configuredDatabaseId ||
    configuredDatabaseId === "default" ||
    configuredDatabaseId === "(default)"
      ? "(default)"
      : configuredDatabaseId;
  return getFirestore(getAdminApp(), databaseId);
}

export function adminStorageBucket() {
  const bucketName = getStorageBucketName();
  if (!bucketName) {
    throw new Error("Missing FIREBASE_STORAGE_BUCKET in env vars.");
  }
  return getStorage(getAdminApp()).bucket(bucketName);
}
