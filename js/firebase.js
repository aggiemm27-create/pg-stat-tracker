// Firebase connection. All reads and writes go through this file.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, getDocFromCache, getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2-QjBl4nZq9Xtpv8L8POe_JVgDs05rHY",
  authDomain: "pg-stat-tracker.firebaseapp.com",
  projectId: "pg-stat-tracker",
  storageBucket: "pg-stat-tracker.firebasestorage.app",
  messagingSenderId: "309428897948",
  appId: "1:309428897948:web:3831857e8664cf25dac559",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Saves everything on the phone first, then syncs when there's a signal.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
});

export { onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail };

// Writes are not awaited on purpose: they finish on the phone instantly and
// sync later. Errors are passed to onError so the screen can show them.
let onError = () => {};
export const setErrorHandler = (fn) => { onError = fn; };
const fire = (promise) => { promise.catch((e) => onError(e)); };

export const newId = (col) => doc(collection(db, col)).id;
export const put = (col, id, data) => fire(setDoc(doc(db, col, id), data));
export const merge = (col, id, data) => fire(setDoc(doc(db, col, id), data, { merge: true }));
export const patch = (col, id, data) => fire(updateDoc(doc(db, col, id), data));
export const remove = (col, id) => fire(deleteDoc(doc(db, col, id)));

export function putMany(col, rows) {
  const b = writeBatch(db);
  rows.forEach(([id, data]) => b.set(doc(db, col, id), data));
  fire(b.commit());
}

// Listen to a whole collection. cb(rows, hasPendingWrites, fromCache)
export function watch(col, cb) {
  return onSnapshot(collection(db, col), { includeMetadataChanges: true }, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })), snap.metadata.hasPendingWrites, snap.metadata.fromCache);
  }, (e) => onError(e));
}

export async function readOnce(col, id) {
  const ref = doc(db, col, id);
  try { const s = await getDoc(ref); return s.exists() ? s.data() : null; }
  catch { try { const s = await getDocFromCache(ref); return s.exists() ? s.data() : null; } catch { return null; } }
}
