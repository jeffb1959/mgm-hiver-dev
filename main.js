// ======================================================
// MGM - Suivi de golf intérieur
// Fichier : main.js
// Version : 2.0.0 (DEV)
// Rôle    : Affichage d'une fiche joueur (fiche-joueur.html)
// Base Firebase : mgm-hivers-dev
// ======================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  onSnapshot,
  updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Config Firebase DEV (identique à mgm.js) ---
const firebaseConfig = {
  apiKey: "AIzaSyDX1UFMBssUcrTS6zfFdaJ6oldrPnkj9vI",
  authDomain: "mgm-hivers-dev.firebaseapp.com",
  projectId: "mgm-hivers-dev",
  storageBucket: "mgm-hivers-dev.firebasestorage.app",
  messagingSenderId: "90366576232",
  appId: "1:90366576232:web:9ffaad59b68a9db4eb5ddd"
};

let app, db, auth;
let currentPlayer = null;
let currentPlayerRef = null;

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function getPlayerIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("playerId");
}

function showGlobalError(message) {
  const box = document.getElementById("globalErrorMessage");
  if (!box) return;
  box.textContent = message;
  box.classList.remove("hidden");
}

function formatCurrency(value) {
  const n = Number(value || 0);
  return `${n.toFixed(2)} $`;
}

function formatDateFR(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("fr-CA", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  } catch {
    return dateStr;
  }
}

// -------------------------------------------------------------------
// Calcul du handicap (copié de la logique existante)
// -------------------------------------------------------------------
function calculateHandicap(player) {
  if (!player || player.name?.startsWith("Dummy") || typeof player.startingHandicap === "undefined") {
    return 0;
  }

  const scores = (player.games || []).map(g => g.score);
  if (scores.length < 6) {
    const allScores = [...scores, player.startingHandicap];
    if (allScores.length === 0) return player.startingHandicap;
    return allScores.reduce((a, b) => a + b, 0) / allScores.length;
  }

  const relevantScoresSrc = scores.length > 10 ? scores.slice(-10) : [...scores];
  relevantScoresSrc.sort((a, b) => a - b);
  const best5 = relevantScoresSrc.slice(0, 5);
  if (best5.length === 0) return player.startingHandicap;
  return best5.reduce((a, b) => a + b, 0) / 5;
}

// -------------------------------------------------------------------
// Rendu de la carte joueur
// -------------------------------------------------------------------
function renderPlayerCard() {
  const container = document.getElementById("playerCardContainer");
  if (!container) return;

  if (!currentPlayer) {
    container.innerHTML = `
      <div class="bg-white/80 rounded-xl shadow-md p-6 text-center text-gray-500 text-sm">
        Aucune fiche trouvée pour ce joueur.
      </div>
    `;
    return;
  }

  const player = currentPlayer;

  const handicap = calculateHandicap(player);
  const totalGames = player.games ? player.games.length : 0;
  const totalBirdies = (player.games || []).reduce((sum, g) => sum + (g.birdies || 0), 0);
  const totalTriples = (player.games || []).reduce((sum, g) => sum + (g.triples || 0), 0);
  const totalWinnings = (player.games || []).reduce((sum, g) => sum + (g.wager || 0), 0);
  const totalAdvances = (player.advances || []).reduce((sum, a) => sum + (a.amount || 0), 0);
  const totalCosts = (player.games || []).reduce((sum, g) => sum + (g.cost || 0), 0);
  const balance = totalAdvances - totalCosts;

  const winningsClass = totalWinnings >= 0 ? "text-green-600" : "text-red-600";
  const balanceClass = balance >= 0 ? "text-green-600" : "text-red-600";
  const handicapClass = totalGames < 6 ? "text-red-600 font-bold" : "text-green-600 font-bold";

  const playerType = player.playerType || "regular";
  const playerTypeText = playerType === "regular" ? "Régulier" : "Remplaçant";
  const playerTypeClass = playerType === "regular" ? "text-green-700" : "text-yellow-600";

  const defaultStatus = playerType === "regular" ? "present" : "absent";
  const currentStatus = player.nextWeekStatus || defaultStatus;

  container.innerHTML = `
    <div class="bg-white rounded-xl shadow-md overflow-hidden p-5 flex flex-col">
      <h3 class="text-xl font-bold text-gray-900">${player.name}</h3>
      <p class="text-sm font-semibold ${playerTypeClass} -mt-1 mb-2">${playerTypeText}</p>

      <div class="flex-grow space-y-1 text-sm md:text-base">
        <p><span class="font-semibold">Handicap:</span> <span class="${handicapClass}">${handicap.toFixed(1)}</span></p>
        <p><span class="font-semibold">Parties Jouées:</span> ${totalGames}</p>
        <p><span class="font-semibold">Total Birdies:</span> ${totalBirdies}</p>
        <p><span class="font-semibold">Total Triples:</span> ${totalTriples}</p>
        <p><span class="font-semibold">Gains / Pertes:</span>
           <span class="${winningsClass} font-bold">${formatCurrency(totalWinnings)}</span>
        </p>
        <p><span class="font-semibold">Solde:</span>
           <span class="${balanceClass} font-bold">${formatCurrency(balance)}</span>
        </p>

        <div class="mt-3 pt-3 border-t border-gray-200">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Présent la semaine prochaine :
          </label>
          <div class="flex space-x-4">
            <div class="flex items-center">
              <input id="status-present" name="nextweek-status" type="radio" value="present"
                     class="h-4 w-4 text-green-600 border-gray-300 focus:ring-green-500"
                     ${currentStatus === "present" ? "checked" : ""}>
              <label for="status-present" class="ml-2 block text-sm text-gray-900">Présent</label>
            </div>
            <div class="flex items-center">
              <input id="status-absent" name="nextweek-status" type="radio" value="absent"
                     class="h-4 w-4 text-red-600 border-gray-300 focus:ring-red-500"
                     ${currentStatus === "absent" ? "checked" : ""}>
              <label for="status-absent" class="ml-2 block text-sm text-gray-900">Absent</label>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-6">
        <button id="viewGamesBtn"
                class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2.5 px-4 rounded-md w-full">
          Voir Parties
        </button>
      </div>
    </div>
  `;

  // Brancher les événements radio + bouton
  const presentRadio = document.getElementById("status-present");
  const absentRadio  = document.getElementById("status-absent");
  const viewGamesBtn = document.getElementById("viewGamesBtn");

  if (presentRadio) {
    presentRadio.addEventListener("change", () => {
      if (presentRadio.checked) updateNextWeekStatus("present");
    });
  }
  if (absentRadio) {
    absentRadio.addEventListener("change", () => {
      if (absentRadio.checked) updateNextWeekStatus("absent");
    });
  }
  if (viewGamesBtn) {
    viewGamesBtn.addEventListener("click", () => {
      openViewGamesModal();
    });
  }
}

// -------------------------------------------------------------------
// Mise à jour du statut "Présent / Absent"
// -------------------------------------------------------------------
async function updateNextWeekStatus(status) {
  if (!currentPlayerRef) return;
  try {
    await updateDoc(currentPlayerRef, { nextWeekStatus: status });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du statut:", error);
    showGlobalError("Erreur lors de la mise à jour de votre statut. Veuillez réessayer.");
  }
}

// -------------------------------------------------------------------
// Modale "Voir Parties"
// -------------------------------------------------------------------
function openViewGamesModal() {
  const modal = document.getElementById("viewGamesModal");
  const container = document.getElementById("gameHistoryContainer");
  const historyPlayerNameSpan = document.getElementById("historyPlayerName");
  const historyPlayerHandicapSpan = document.getElementById("historyPlayerHandicap");

  if (!modal || !container || !historyPlayerNameSpan || !historyPlayerHandicapSpan) return;

  if (!currentPlayer) {
    container.innerHTML = "<p>Aucune donnée de joueur.</p>";
    modal.classList.add("active");
    return;
  }

  const player = currentPlayer;
  historyPlayerNameSpan.textContent = player.name || "";
  historyPlayerHandicapSpan.textContent = (player.startingHandicap ?? 0).toFixed(1);

  const gamesRaw = player.games || [];

  if (gamesRaw.length === 0) {
    container.innerHTML = "<p>Aucune partie enregistrée.</p>";
    modal.classList.add("active");
    return;
  }

  // On garde l'index original pour pouvoir supprimer
  const games = gamesRaw.map((g, idx) => ({ ...g, _idx: idx }));
  games.sort((a, b) => new Date(b.date || "1970-01-01") - new Date(a.date || "1970-01-01"));

  container.innerHTML = games
    .map(game => {
      const wagerClass = (game.wager || 0) >= 0 ? "text-green-600" : "text-red-500";
      return `
        <div class="rounded-lg border border-gray-200 p-3 text-sm bg-gray-50 flex flex-col gap-1">
          <div class="flex justify-between items-center">
            <span class="font-semibold">${formatDateFR(game.date)}</span>
          </div>
          <div class="grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
            <p><span class="font-semibold">Score:</span> ${game.score ?? ""}</p>
            <p><span class="font-semibold">Birdies:</span> ${game.birdies ?? 0}</p>
            <p><span class="font-semibold">Triples:</span> ${game.triples ?? 0}</p>
            <p><span class="font-semibold">Coût:</span> ${formatCurrency(game.cost || 0)}</p>
            <p class="col-span-2">
              <span class="font-semibold">Gain / Perte:</span>
              <span class="${wagerClass} font-semibold">${formatCurrency(game.wager || 0)}</span>
            </p>
          </div>

          ${
            game.scorecardUrl
              ? `
          <div class="mt-2">
            <a
              href="${game.scorecardUrl}"
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Voir la carte PDF
            </a>
          </div>
          `
              : ""
          }
        </div>
      `;
    })
    .join("");


  modal.classList.add("active");
}

async function deleteGameAtIndex(originalIndex) {
  if (!currentPlayerRef || !currentPlayer) return;
  try {
    const updatedGames = [...(currentPlayer.games || [])];
    if (originalIndex < 0 || originalIndex >= updatedGames.length) return;

    updatedGames.splice(originalIndex, 1);
    await updateDoc(currentPlayerRef, { games: updatedGames });

    // Mettre à jour la copie locale et recharger l'affichage de la modale + carte
    currentPlayer = { ...currentPlayer, games: updatedGames };
    renderPlayerCard();
    openViewGamesModal(); // re-render
  } catch (error) {
    console.error("Erreur lors de la suppression de la partie:", error);
    showGlobalError("Erreur lors de la suppression de la partie.");
  }
}

function setupModalEvents() {
  const modal = document.getElementById("viewGamesModal");
  const closeBtn = document.getElementById("closeViewGamesModal");
  if (!modal) return;

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.classList.remove("active");
    });
  }

  // Fermer en cliquant sur le fond
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.classList.remove("active");
    }
  });
}

// -------------------------------------------------------------------
// Initialisation Firebase + chargement du joueur
// -------------------------------------------------------------------
async function initializeFirebaseAndLoadPlayer() {
  const playerId = getPlayerIdFromUrl();
  if (!playerId) {
    showGlobalError("Aucun joueur spécifié dans l'URL.");
    const container = document.getElementById("playerCardContainer");
    if (container) {
      container.innerHTML = `
        <div class="bg-white/80 rounded-xl shadow-md p-6 text-center text-gray-500 text-sm">
          Aucun joueur sélectionné. Veuillez revenir à l'accueil et choisir votre nom.
        </div>
      `;
    }
    return;
  }

  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);

    await signInAnonymously(auth);

    const ref = doc(db, "players", playerId);
    currentPlayerRef = ref;

    // onSnapshot pour garder la fiche à jour en temps réel
    onSnapshot(
      ref,
      (docSnap) => {
        if (!docSnap.exists()) {
          currentPlayer = null;
        } else {
          currentPlayer = { id: docSnap.id, ...docSnap.data() };
        }
        renderPlayerCard();
      },
      (error) => {
        console.error("Erreur de lecture du joueur:", error);
        showGlobalError("Erreur de lecture de la fiche joueur.");
      }
    );
  } catch (error) {
    console.error("Erreur d'initialisation Firebase (fiche joueur):", error);
    showGlobalError("Erreur de connexion à la base de données.");
  }
}

// -------------------------------------------------------------------
// Démarrage
// -------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  setupModalEvents();
  initializeFirebaseAndLoadPlayer();
});
