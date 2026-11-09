// Firebase Web SDK configuration for project: lpdigital-71c32
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

// Your NEW Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCcyBRmd6CJytZeE9_WOwwj8HfiZmXNJKI",
  authDomain: "lpdigital-71c32.firebaseapp.com",
  databaseURL: "https://lpdigital-71c32-default-rtdb.asia-southeast1.firebasedatabase.app/", // Updated URL
  projectId: "lpdigital-71c32",
  storageBucket: "lpdigital-71c32.firebasestorage.app",
  messagingSenderId: "278560063902",
  appId: "1:278560063902:web:9ef4e07cec368d5a03568f",
  measurementId: "G-7H0T1HJQ97"
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
