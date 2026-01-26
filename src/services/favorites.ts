import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function fetchFavorites(uid: string) {
  if (!db) {
    throw new Error("Firestore client is not initialized.");
  }

  const snapshot = await getDocs(collection(db, "users", uid, "favorites"));
  return new Set(snapshot.docs.map((favorite) => favorite.id));
}

export async function addFavorite(uid: string, productId: string) {
  if (!db) {
    throw new Error("Firestore client is not initialized.");
  }

  await setDoc(doc(db, "users", uid, "favorites", productId), {
    createdAt: serverTimestamp(),
  });
}

export async function removeFavorite(uid: string, productId: string) {
  if (!db) {
    throw new Error("Firestore client is not initialized.");
  }

  await deleteDoc(doc(db, "users", uid, "favorites", productId));
}
