// ======================================================
// MGM - Suivi de golf intérieur
// Fichier : presence.js
// Version : 1.1.0 (DEV)
// Rôle    : Page de gestion rapide de la présence des joueurs
//           pour la prochaine partie (presence.html)
// Base    : mgm-hivers-dev (Firebase DEV)
// Champs  : utilise le même champ que le module d'équipes :
//           players/{id}.nextWeekStatus = 'present' | 'absent' | 'available'
//           - 'present'   : joueur compté comme présent pour les équipes
//           - 'available' : remplaçant disponible (mais pas encore utilisé)
//           - 'absent'    : absent / non disponible
// ======================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Config Firebase DEV (identique à mgm.js / main.js) ---
const firebaseConfig = {
  apiKey: "AIzaSyDX1UFMBssUcrTS6zfFdaJ6oldrPnkj9vI",
  authDomain: "mgm-hivers-dev.firebaseapp.com",
  projectId: "mgm-hivers-dev",
  storageBucket: "mgm-hivers-dev.firebasestorage.app",
  messagingSenderId: "90366576232",
  appId: "1:90366576232:web:9ffaad59b68a9db4eb5ddd"
};

// --- Variables globales ---
let app, db, auth;
let players = [];

// --- Références DOM ---
let nextProgramDateSpan;
let presenceStatusBox;
let playersPresenceContainer;
let playerSearchInput;
let backToHomeBtn;

// ======================================================
// Initialisation
// ======================================================
document.addEventListener("DOMContentLoaded", () => {
  nextProgramDateSpan = document.getElementById("nextProgramDate");
  presenceStatusBox = document.getElementById("presenceStatusBox");
  playersPresenceContainer = document.getElementById("playersPresenceContainer");
  playerSearchInput = document.getElementById("playerSearch");
  backToHomeBtn = document.getElementById("backToHomeBtn");

  initializeFirebase();
  setupUIEvents();
});

// ======================================================
// Helpers UI
// ======================================================
function setStatus(message, type = "info") {
  if (!presenceStatusBox) return;

  presenceStatusBox.classList.remove(
    "hidden",
    "bg-green-50",
    "text-green-800",
    "border-green-200",
    "bg-red-50",
    "text-red-800",
    "border-red-200",
    "bg-slate-50",
    "text-slate-800",
    "border-slate-200"
  );
  presenceStatusBox.textContent = message;

  if (type === "success") {
    presenceStatusBox.classList.add("bg-green-50", "text-green-800", "border", "border-green-200");
  } else if (type === "error") {
    presenceStatusBox.classList.add("bg-red-50", "text-red-800", "border", "border-red-200");
  } else {
    presenceStatusBox.classList.add("bg-slate-50", "text-slate-800", "border", "border-slate-200");
  }
}

function clearStatus() {
  if (!presenceStatusBox) return;
  presenceStatusBox.classList.add("hidden");
  presenceStatusBox.textContent = "";
}

// Format d’une date en français long (mercredi 26 novembre 2025)
function formatDateFRLong(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return "Date inconnue";
  return dateObj.toLocaleDateString("fr-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

// Calcul du handicap (copié de mgm.js pour affichage informatif)
function calculateHandicap(player) {
  if (!player || player.name?.startsWith("Dummy") || typeof player.startingHandicap === "undefined") {
    return 0;
  }
  const scores = (player.games || []).map((g) => g.score);
  if (scores.length < 6) {
    const allScores = [...scores, player.startingHandicap];
    if (allScores.length === 0) return player.startingHandicap;
    return allScores.reduce((a, b) => a + b, 0) / allScores.length;
  }
  const relevantScores = scores.length > 10 ? scores.slice(-10) : [...scores];
  relevantScores.sort((a, b) => a - b);
  const best5 = relevantScores.slice(0, 5);
  if (best5.length === 0) return player.startingHandicap;
  return best5.reduce((a, b) => a + b, 0) / 5;
}

// ======================================================
// Firebase
// ======================================================
async function initializeFirebase() {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);

    await signInAnonymously(auth);

    await loadNextProgramDate();
    subscribePlayers();
  } catch (error) {
    console.error("Erreur d'initialisation Firebase (presence.js):", error);
    setStatus("Erreur d'initialisation Firebase. Vérifie la configuration.", "error");
  }
}

// ======================================================
// Chargement de la date du prochain programme
// (2e mercredi suivant la dernière sauvegarde d'équipes)
// Source : doc(db, 'settings', 'teamHistory').history[]
// ======================================================
async function loadNextProgramDate() {
  if (!db || !nextProgramDateSpan) return;

  try {
    const historyRef = doc(db, "settings", "teamHistory");
    const snap = await getDoc(historyRef);

    if (!snap.exists()) {
      nextProgramDateSpan.textContent = "Non disponible";
      return;
    }

    const data = snap.data();
    const history = Array.isArray(data.history) ? data.history : [];

    if (!history.length) {
      nextProgramDateSpan.textContent = "Non disponible";
      return;
    }

    const lastEntry = history[history.length - 1];
    const baseDateStr = lastEntry?.date;
    if (!baseDateStr) {
      nextProgramDateSpan.textContent = "Non disponible";
      return;
    }

    const baseDate = new Date(baseDateStr);
    if (isNaN(baseDate.getTime())) {
      nextProgramDateSpan.textContent = "Non disponible";
      return;
    }

    // Logique :
    // - prendre la dernière date de sauvegarde
    // - trouver le 1er mercredi STRICTEMENT après cette date
    // - puis le mercredi suivant (= 2e mercredi)
    let d = new Date(baseDate.getTime());
    d.setDate(d.getDate() + 1); // commencer au lendemain

    // getDay() : 0=dimanche, 1=lundi, 2=mardi, 3=mercredi, ...
    while (d.getDay() !== 3) {
      d.setDate(d.getDate() + 1);
    }
    // 1er mercredi suivant baseDate = d
    const secondWednesday = new Date(d.getTime());
    secondWednesday.setDate(secondWednesday.getDate() + 7);

    nextProgramDateSpan.textContent = formatDateFRLong(secondWednesday);
  } catch (error) {
    console.error("Erreur lors du chargement de l'historique des équipes:", error);
    nextProgramDateSpan.textContent = "Non disponible";
  }
}

// ======================================================
// Chargement et affichage des joueurs
// ======================================================
function subscribePlayers() {
  if (!db || !playersPresenceContainer) return;

  const playersCol = collection(db, "players");
  onSnapshot(
    playersCol,
    (snapshot) => {
      players = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      players.sort((a, b) => a.name.localeCompare(b.name));
      renderPlayersPresence();
    },
    (error) => {
      console.error("Erreur lors du chargement des joueurs:", error);
      setStatus("Erreur lors du chargement des joueurs.", "error");
    }
  );
}

function renderPlayersPresence() {
  if (!playersPresenceContainer) return;

  const searchTerm = (playerSearchInput?.value || "").trim().toLowerCase();

  const filtered = players.filter((p) =>
    (p.name || "").toLowerCase().includes(searchTerm)
  );

  if (!filtered.length) {
    playersPresenceContainer.innerHTML =
      '<p class="text-sm text-gray-500">Aucun joueur trouvé.</p>';
    return;
  }

  const cardsHtml = filtered
    .map((player) => {
      const playerType = player.playerType || "regular"; // 'regular' ou 'sub'
      // Par défaut :
      // - régulier : présent
      // - remplaçant : non disponible (absent) tant qu'il n'a pas confirmé "Disponible"
      const defaultStatus = playerType === "regular" ? "present" : "absent";
      const currentStatus = player.nextWeekStatus || defaultStatus;

      const hc = calculateHandicap(player);
      const handicapText =
        typeof hc === "number" && !isNaN(hc) ? hc.toFixed(1) : "-";

      // Radios différents selon le type de joueur
      let radiosHtml = "";

      if (playerType === "regular") {
        // Joueur régulier : Présent / Absent
        radiosHtml = `
          <label class="flex items-center gap-1 text-xs md:text-sm">
            <input
              type="radio"
              class="presence-radio"
              name="presence-${player.id}"
              value="present"
              data-id="${player.id}"
              data-type="regular"
              ${currentStatus === "present" ? "checked" : ""}
            />
            Présent
          </label>
          <label class="flex items-center gap-1 text-xs md:text-sm">
            <input
              type="radio"
              class="presence-radio"
              name="presence-${player.id}"
              value="absent"
              data-id="${player.id}"
              data-type="regular"
              ${currentStatus === "absent" ? "checked" : ""}
            />
            Absent
          </label>
        `;
      } else {
        // Joueur remplaçant : Présent / Disponible / Non disponible
        radiosHtml = `
          <label class="flex items-center gap-1 text-xs md:text-sm">
            <input
              type="radio"
              class="presence-radio"
              name="presence-${player.id}"
              value="present"
              data-id="${player.id}"
              data-type="sub"
              ${currentStatus === "present" ? "checked" : ""}
            />
            Présent
          </label>
          <label class="flex items-center gap-1 text-xs md:text-sm">
            <input
              type="radio"
              class="presence-radio"
              name="presence-${player.id}"
              value="available"
              data-id="${player.id}"
              data-type="sub"
              ${currentStatus === "available" ? "checked" : ""}
            />
            Disponible
          </label>
          <label class="flex items-center gap-1 text-xs md:text-sm">
            <input
              type="radio"
              class="presence-radio"
              name="presence-${player.id}"
              value="absent"
              data-id="${player.id}"
              data-type="sub"
              ${currentStatus === "absent" ? "checked" : ""}
            />
            Non disponible
          </label>
        `;
      }

      return `
        <div class="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm">
          <div class="flex flex-col">
            <span class="font-semibold text-gray-900">${player.name || "Sans nom"}</span>
            <span class="text-xs text-gray-500">
              Type: ${playerType === "regular" ? "Régulier" : "Remplaçant"} · Handicap: ${handicapText}
            </span>
          </div>
          <div class="flex items-center gap-3">
            ${radiosHtml}
          </div>
        </div>
      `;
    })
    .join("");

  playersPresenceContainer.innerHTML = cardsHtml;
}

// ======================================================
// Mise à jour de la présence d'un joueur
// (même champ que dans mgm.js : nextWeekStatus)
// ======================================================
async function handleUpdatePresence(playerId, newStatus) {
  if (!db || !playerId || !newStatus) return;

  try {
    clearStatus();
    const playerRef = doc(db, "players", playerId);
    await updateDoc(playerRef, { nextWeekStatus: newStatus });

    // Optionnel : petit feedback utilisateur
    setStatus("Présence mise à jour.", "success");
    setTimeout(() => clearStatus(), 2000);
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la présence:", error);
    setStatus("Erreur lors de la mise à jour de la présence. Réessaie.", "error");
  }
}

// ======================================================
// Événements UI
// ======================================================
function setupUIEvents() {
  if (backToHomeBtn) {
    backToHomeBtn.addEventListener("click", () => {
      window.location.href = "accueil.html";
    });
  }

  if (playerSearchInput) {
    playerSearchInput.addEventListener("input", () => {
      renderPlayersPresence();
    });
  }

  if (playersPresenceContainer) {
    // Délégation d'événements pour les radios
    playersPresenceContainer.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.classList.contains("presence-radio")) return;

      const playerId = target.dataset.id;
      const newStatus = target.value; // 'present' | 'absent' | 'available'
      if (!playerId || !newStatus) return;

      handleUpdatePresence(playerId, newStatus);
    });
  }
}
