import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

let adminApp: App | null = getApps().length ? getApps()[0] : null;

function getStorageBucketName() {
  return (
    process.env.FIREBASE_STORAGE_BUCKET ??
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    ""
  ).trim();
}

export function getDatabaseId() {
  const raw = process.env.FIREBASE_DATABASE_ID;
  const normalized = raw?.trim();
  if (!normalized || normalized === "default" || normalized === "(default)") {
    return "default";
  }
  return normalized;
}

export function getAdminApp() {
  if (adminApp) return adminApp;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const storageBucket = getStorageBucketName();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set."
    );
  }

  adminApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    ...(storageBucket ? { storageBucket } : {}),
  });

  return adminApp;
}

export function getFirestoreDb() {
  return getFirestore(getAdminApp(), getDatabaseId());
}

export function getStorageBucket() {
  const bucketName = getStorageBucketName();
  if (!bucketName) {
    throw new Error(
      "Missing FIREBASE_STORAGE_BUCKET. Required for image upload."
    );
  }

  return getStorage(getAdminApp()).bucket(bucketName);
}
