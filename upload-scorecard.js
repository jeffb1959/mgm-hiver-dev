// ======================================================
// MGM - Suivi de golf intérieur
// Fichier : upload-scorecard.js
// Version : 1.0.0 (DEV)
// Rôle    : Outil admin pour uploader un PDF de score
//           et associer son URL à toutes les parties
//           d'une date donnée, pour tous les joueurs.
// Base    : mgm-hivers-dev (Firebase DEV)
// ======================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- Config Firebase DEV (identique à mgm.js) ---
const firebaseConfig = {
  apiKey: "AIzaSyC0ZHX83YQ3jpiFAx1wtkOPiwRNqsE9Npw",
  authDomain: "statgolfv2.firebaseapp.com",
  projectId: "statgolfv2",
  storageBucket: "statgolfv2.firebasestorage.app",
  messagingSenderId: "127072359585",
  appId: "1:127072359585:web:9c37f6ff0d40c0e07b4ce0"
};

let app, db, auth, storage;

// --------------------------------------------------
// Helpers UI
// --------------------------------------------------
function setStatus(message, type = "info") {
  const box = document.getElementById("statusBox");
  if (!box) return;
  box.classList.remove("hidden", "bg-green-50", "text-green-800", "border-green-200",
    "bg-red-50", "text-red-800", "border-red-200",
    "bg-slate-50", "text-slate-800", "border-slate-200");
  box.textContent = message;

  if (type === "success") {
    box.classList.add("bg-green-50", "text-green-800", "border", "border-green-200");
  } else if (type === "error") {
    box.classList.add("bg-red-50", "text-red-800", "border", "border-red-200");
  } else {
    box.classList.add("bg-slate-50", "text-slate-800", "border", "border-slate-200");
  }
}

// --------------------------------------------------
// Initialisation
// --------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  initializeFirebase();
  setupUI();
});

function initializeFirebase() {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    storage = getStorage(app);

    signInAnonymously(auth).catch((err) => {
      console.error("Erreur lors de la connexion anonyme :", err);
      setStatus("Erreur de connexion à Firebase (auth). Vérifie les règles et réessaie.", "error");
    });
  } catch (error) {
    console.error("Erreur d'initialisation Firebase (upload-scorecard):", error);
    setStatus("Erreur critique lors de l'initialisation de Firebase.", "error");
  }
}

function setupUI() {
  const form = document.getElementById("uploadForm");
  const backBtn = document.getElementById("backBtn");

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      // Retour à la page admin principale
      window.location.href = "mgm-hiver-dev.html";
    });
  }

  if (form) {
    form.addEventListener("submit", handleUpload);
  }
}

// --------------------------------------------------
// Logique principale : upload + update Firestore
// --------------------------------------------------
async function handleUpload(event) {
  event.preventDefault();

  const dateInput = document.getElementById("gameDate");
  const pdfInput = document.getElementById("pdfFile");

  if (!dateInput || !pdfInput) {
    setStatus("Formulaire incomplet dans la page. Vérifie le HTML.", "error");
    return;
  }

  const selectedDate = dateInput.value; // format "YYYY-MM-DD"
  const file = pdfInput.files[0];

  if (!selectedDate) {
    setStatus("Veuillez sélectionner une date de partie.", "error");
    return;
  }
  if (!file) {
    setStatus("Veuillez sélectionner un fichier PDF à uploader.", "error");
    return;
  }

  // Confirmation rapide
  const confirmMsg =
    `Tu es sur le point d'uploader le PDF "${file.name}" ` +
    `et de l'associer à toutes les parties du ${selectedDate}.\n\n` +
    `Continuer ?`;
  if (!window.confirm(confirmMsg)) {
    return;
  }

  try {
    setStatus("Upload du PDF en cours...", "info");

    // 1) Upload dans Firebase Storage
    const safeDate = selectedDate; // déjà au format AAAA-MM-JJ
    const storagePath = `scorecards/${safeDate}.pdf`;
    const fileRef = ref(storage, storagePath);

    await uploadBytes(fileRef, file);
    const downloadUrl = await getDownloadURL(fileRef);

    setStatus("PDF uploadé. Mise à jour des joueurs en cours...", "info");

    // 2) Mise à jour des joueurs dans Firestore
    const playersSnap = await getDocs(collection(db, "players"));

    let updatedPlayersCount = 0;
    let updatedGamesCount = 0;

    const batchUpdates = [];

    for (const docSnap of playersSnap.docs) {
      const playerData = docSnap.data();
      const games = Array.isArray(playerData.games) ? [...playerData.games] : [];

      let modified = false;

      for (let i = 0; i < games.length; i++) {
        const game = games[i];
        if (game && game.date === selectedDate) {
          // On ajoute / remplace le champ scorecardUrl
          games[i] = {
            ...game,
            scorecardUrl: downloadUrl
          };
          modified = true;
          updatedGamesCount++;
        }
      }

      if (modified) {
        updatedPlayersCount++;
        const playerRef = doc(db, "players", docSnap.id);
        // On stocke la promesse pour pouvoir await toutes ensuite
        batchUpdates.push(updateDoc(playerRef, { games }));
      }
    }

    if (batchUpdates.length === 0) {
      setStatus(
        `PDF uploadé (${storagePath}), mais aucune partie trouvée à la date ${selectedDate}. ` +
        `Vérifie que la date correspond bien au champ "date" dans les games.`,
        "error"
      );
      return;
    }

    await Promise.all(batchUpdates);

    setStatus(
      `Succès ! PDF associé à ${updatedGamesCount} partie(s) pour ${updatedPlayersCount} joueur(s).`,
      "success"
    );

  } catch (error) {
    console.error("Erreur lors de l'upload et de la mise à jour Firestore :", error);
    setStatus("Erreur lors de l'upload ou de la mise à jour des joueurs. Voir la console.", "error");
  }
}
