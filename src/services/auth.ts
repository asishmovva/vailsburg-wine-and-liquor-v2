import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export async function signIn(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
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
  const credential = await createUserWithEmailAndPassword(auth, email, password);
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

  await setDoc(doc(db, "users", credential.user.uid), userDoc, {
    merge: true,
  });

  return credential.user;
}

export async function signOut() {
  await firebaseSignOut(auth);
}
