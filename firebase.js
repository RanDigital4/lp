// Firebase Web SDK configuration for project: lprnd-ddd35
// The web apiKey is a public project identifier. Protect data with Realtime Database Rules.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, sendEmailVerification, sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getDatabase, ref, set, get, push, update, onValue, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDAcwBycPI45y9noMsuV4pZl40IeschhE",
  authDomain: "lprnd-ddd35.firebaseapp.com",
  databaseURL: "https://lprnd-ddd35-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lprnd-ddd35",
  storageBucket: "lprnd-ddd35.firebasestorage.app",
  messagingSenderId: "600137724074",
  appId: "1:600137724074:web:b42bf4777a2fa4e41da0d3",
  measurementId: "G-H0CVZRKDG8"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

setPersistence(auth, browserLocalPersistence).catch(console.error);

export {
  ref, set, get, push, update, onValue, serverTimestamp,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, sendEmailVerification, sendPasswordResetEmail,
  onAuthStateChanged
};
