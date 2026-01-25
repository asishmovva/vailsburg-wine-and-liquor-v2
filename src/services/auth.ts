import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

function getAuthClient() {
  if (!auth || !db) {
    throw new Error("Firebase client not initialized.");
  }

  return { auth, db };
}

export async function signIn(email: string, password: string) {
  const { auth: authClient } = getAuthClient();
  const credential = await signInWithEmailAndPassword(
    authClient,
    email,
    password
  );
  return credential.user;
}

export async function signUp({
  email,
  password,
  name,
}: {
  email: string;
  password: string;
  name?: string;
}) {
  const { auth: authClient, db: dbClient } = getAuthClient();
  const credential = await createUserWithEmailAndPassword(
    authClient,
    email,
    password
  );
  if (name) {
    await updateProfile(credential.user, { displayName: name });
  }

  const userDoc: Record<string, unknown> = {
    role: "customer",
    email: credential.user.email ?? email,
    createdAt: serverTimestamp(),
  };

  if (name) {
    userDoc.name = name;
  }

  await setDoc(doc(dbClient, "users", credential.user.uid), userDoc, {
    merge: true,
  });

  return credential.user;
}

export async function signInWithGoogle() {
  const { auth: authClient } = getAuthClient();
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(authClient, provider);
  const user = credential.user;

  await ensureUserProfile(user);

  return user;
}

export async function signOut() {
  const { auth: authClient } = getAuthClient();
  await firebaseSignOut(authClient);
}

export async function ensureUserProfile(
  user: User,
  extra?: { phone?: string | null }
) {
  const { db: dbClient } = getAuthClient();
  const userRef = doc(dbClient, "users", user.uid);
  const snapshot = await getDoc(userRef);

  if (snapshot.exists()) return;

  const userDoc: Record<string, unknown> = {
    role: "customer",
    email: user.email ?? "",
    createdAt: serverTimestamp(),
  };

  if (user.displayName) {
    userDoc.name = user.displayName;
  }

  const phone = extra?.phone ?? user.phoneNumber;
  if (phone) {
    userDoc.phone = phone;
  }

  await setDoc(userRef, userDoc, { merge: true });
}
