import {
  auth,
  db,
  ref,
  set,
  serverTimestamp,
  createUserWithEmailAndPassword,
  sendEmailVerification
} from "./firebase.js";

const form = document.getElementById("registerForm");
const msg = document.getElementById("message");
const submitBtn = form.querySelector('button[type="submit"]');

function strongPassword(password) {
  return (
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function showMessage(message, type = "error") {
  msg.textContent = message;
  msg.dataset.type = type;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (submitBtn.disabled) return;

  msg.textContent = "";

  const name = document.getElementById("fullName").value.trim();
  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value;
  const confirmPassword =
    document.getElementById("confirmPassword").value;

  if (!name) {
    showMessage("Please enter your full name.");
    return;
  }

  if (!strongPassword(password)) {
    showMessage(
      "Password must contain at least 12 characters, uppercase, lowercase, number and symbol."
    );
    return;
  }

  if (password !== confirmPassword) {
    showMessage("Passwords do not match.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Creating account...";

  let user = null;

  try {
    // STEP 1: Create Firebase Authentication account
    const credential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    user = credential.user;

    // STEP 2: Create user profile in Realtime Database
    try {
      await set(ref(db, `profiles/${user.uid}`), {
        uid: user.uid,
        fullName: name,
        email: email,
        createdAt: serverTimestamp(),
        emailVerified: false,
        accountStatus: "active"
      });
    } catch (databaseError) {
      console.error("Profile database error:", databaseError);

      showMessage(
        "Your account was created, but your profile could not be saved. Please contact the administrator.",
        "warning"
      );
      return;
    }

    // STEP 3: Send email verification
    try {
      await sendEmailVerification(user);
    } catch (verificationError) {
      console.error("Verification email error:", verificationError);

      showMessage(
        "Account created, but verification email could not be sent. Please use the resend verification option on the login page.",
        "warning"
      );
      return;
    }

    showMessage(
      "Account created successfully! Please check your email and verify your account before submitting LP proof.",
      "success"
    );

    form.reset();

  } catch (error) {
    console.error("Firebase registration error:", error.code, error.message);

    const errors = {
      "auth/api-key-not-valid":
        "Firebase API Key is invalid. Please check firebase.js configuration.",

      "auth/email-already-in-use":
        "This email is already registered. Please log in.",

      "auth/invalid-email":
        "Please enter a valid email address.",

      "auth/weak-password":
        "Please choose a stronger password.",

      "auth/operation-not-allowed":
        "Email and Password authentication is not enabled in Firebase.",

      "auth/unauthorized-domain":
        "This website domain is not authorized in Firebase Authentication.",

      "auth/network-request-failed":
        "Network error. Please check your internet connection."
    };

    showMessage(
      errors[error.code] ||
      `Registration failed: ${error.code || error.message}`
    );

  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create account";
  }
});
