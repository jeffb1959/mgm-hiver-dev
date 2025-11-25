// ======================================================
// MGM - Suivi de golf intérieur
// Fichier : statistic.js
// Version : 2.2.0 (DEV)
// Rôle    : Statistiques globales de la ligue + graphique handicap
// Base    : mgm-hivers-dev (DEV)
// ======================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --------------------------------------------------
// Config Firebase DEV (mgm-hivers-dev)
// --------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDX1UFMBssUcrTS6zfFdaJ6oldrPnkj9vI",
  authDomain: "mgm-hivers-dev.firebaseapp.com",
  projectId: "mgm-hivers-dev",
  storageBucket: "mgm-hivers-dev.firebasestorage.app",
  messagingSenderId: "90366576232",
  appId: "1:90366576232:web:9ffaad59b68a9db4eb5ddd"
};

let app, db, auth;
let players = [];

// Pour le graphique de progression de l'handicap
let handicapChart = null;
let playerSelect = null;
let loadGraphBtn = null;

// --------------------------------------------------
// Initialisation
// --------------------------------------------------
async function init() {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    await signInAnonymously(auth);

    setupTabsUI();
    setupGraphUI();      // initialisation UI du graphique
    subscribePlayers();
  } catch (error) {
    console.error("Erreur d'initialisation des statistiques :", error);
    alert("Erreur lors du chargement des statistiques.");
  }
}

// --------------------------------------------------
// Calcul du handicap (même logique que mgm.js)
// --------------------------------------------------
function calculateHandicapFromScores(scores, startingHandicap) {
  if (!Array.isArray(scores)) scores = [];
  const hasStart = typeof startingHandicap === "number";
  if (!hasStart && scores.length === 0) return 0;

  if (scores.length < 6) {
    const allScores = hasStart ? [...scores, startingHandicap] : [...scores];
    if (allScores.length === 0) return hasStart ? startingHandicap : 0;
    return allScores.reduce((a, b) => a + b, 0) / allScores.length;
  }

  const relevantScores = scores.length > 10 ? scores.slice(-10) : [...scores];
  relevantScores.sort((a, b) => a - b);
  const best5 = relevantScores.slice(0, 5);
  if (best5.length === 0) return hasStart ? startingHandicap : 0;
  return best5.reduce((a, b) => a + b, 0) / best5.length;
}

function calculateHandicap(player) {
  if (
    !player ||
    player.name?.startsWith("Dummy") ||
    typeof player.startingHandicap === "undefined"
  ) {
    return 0;
  }
  const scores = (player.games || []).map((g) => g.score);
  return calculateHandicapFromScores(scores, player.startingHandicap);
}

// --------------------------------------------------
// Abonnement Firestore
// --------------------------------------------------
function subscribePlayers() {
  const playersCol = collection(db, "players");

  onSnapshot(
    playersCol,
    (snapshot) => {
      players = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      updateAllTables();
      populatePlayerSelect(); // maj de la liste déroulante pour le graphique
    },
    (error) => {
      console.error("Erreur lors de la lecture des joueurs :", error);
      alert("Erreur lors du chargement des statistiques.");
    }
  );
}

// --------------------------------------------------
// Construction des tableaux
// --------------------------------------------------
function updateAllTables() {
  if (!players || players.length === 0) {
    renderEmptyTables();
    return;
  }

  // Enrichir les joueurs avec quelques données calculées
  const enrichedPlayers = players
    .filter((p) => !p.name?.startsWith("Dummy"))
    .map((p) => {
      const games = p.games || [];
      const handicap = calculateHandicap(p);
      const totalWinnings = games.reduce((sum, g) => sum + (g.wager || 0), 0);

      // Dernière partie du joueur (par date string)
      let lastGame = null;
      for (const g of games) {
        if (!g.date) continue;
        if (!lastGame || g.date > lastGame.date) {
          lastGame = g;
        }
      }

      return {
        ...p,
        handicap,
        totalWinnings,
        lastGame
      };
    });

  renderHandicapTable(enrichedPlayers);
  renderWinningsTable(enrichedPlayers);
  renderLastGameTables(enrichedPlayers);
}

function renderEmptyTables() {
  const bodies = [
    "handicapTableBody",
    "winningsTableBody",
    "lastScoresTableBody",
    "lastNetTableBody"
  ];
  bodies.forEach((id) => {
    const tbody = document.getElementById(id);
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="px-3 py-2 text-center text-gray-500">Aucune donnée disponible.</td></tr>';
    }
  });

  const lastGameInfo = document.getElementById("lastGameInfo");
  if (lastGameInfo) {
    lastGameInfo.textContent = "Dernière partie connue : aucune pour le moment.";
  }
}

// --------- Tableau 1 : Handicap ----------
function renderHandicapTable(playersData) {
  const tbody = document.getElementById("handicapTableBody");
  if (!tbody) return;

  const sorted = [...playersData].sort((a, b) => a.handicap - b.handicap);

  if (sorted.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="px-3 py-2 text-center text-gray-500">Aucun joueur.</td></tr>';
    return;
  }

  tbody.innerHTML = sorted
    .map((p, index) => {
      const gamesCount = (p.games || []).length;
      return `
        <tr>
          <td class="px-3 py-2 border text-gray-600">${index + 1}</td>
          <td class="px-3 py-2 border font-medium">${p.name}</td>
          <td class="px-3 py-2 border text-right">${p.handicap.toFixed(1)}</td>
          <td class="px-3 py-2 border text-right">${gamesCount}</td>
        </tr>
      `;
    })
    .join("");
}

// --------- Tableau 2 : Gains / pertes ----------
function renderWinningsTable(playersData) {
  const tbody = document.getElementById("winningsTableBody");
  if (!tbody) return;

  const sorted = [...playersData].sort((a, b) => (b.totalWinnings || 0) - (a.totalWinnings || 0));

  if (sorted.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="3" class="px-3 py-2 text-center text-gray-500">Aucun joueur.</td></tr>';
    return;
  }

  tbody.innerHTML = sorted
    .map((p, index) => {
      const amount = p.totalWinnings || 0;
      const css =
        amount > 0 ? "text-green-600 font-semibold" : amount < 0 ? "text-red-600 font-semibold" : "";
      const formatted =
        (amount > 0 ? "+" : amount < 0 ? "-" : "") + Math.abs(amount).toFixed(2) + " $";

      return `
        <tr>
          <td class="px-3 py-2 border text-gray-600">${index + 1}</td>
          <td class="px-3 py-2 border font-medium">${p.name}</td>
          <td class="px-3 py-2 border text-right ${css}">${formatted}</td>
        </tr>
      `;
    })
    .join("");
}

// --------- Tableaux 3 & 4 : Dernière partie ----------
function renderLastGameTables(playersData) {
  const lastScoresBody = document.getElementById("lastScoresTableBody");
  const lastNetBody = document.getElementById("lastNetTableBody");
  const lastGameInfo = document.getElementById("lastGameInfo");

  if (!lastScoresBody || !lastNetBody) return;

  // Trouver la date la plus récente (format string YYYY-MM-DD)
  let lastDateStr = null;
  playersData.forEach((p) => {
    (p.games || []).forEach((g) => {
      if (!g.date) return;
      if (!lastDateStr || g.date > lastDateStr) {
        lastDateStr = g.date;
      }
    });
  });

  if (!lastDateStr) {
    lastScoresBody.innerHTML =
      '<tr><td colspan="5" class="px-3 py-2 text-center text-gray-500">Aucune partie enregistrée.</td></tr>';
    lastNetBody.innerHTML =
      '<tr><td colspan="6" class="px-3 py-2 text-center text-gray-500">Aucune partie enregistrée.</td></tr>';

    if (lastGameInfo) {
      lastGameInfo.textContent = "Dernière partie connue : aucune partie pour l’instant.";
    }
    return;
  }

  if (lastGameInfo) {
    lastGameInfo.textContent = `Dernière partie connue : ${lastDateStr}`;
  }

  // Récupérer toutes les parties de cette date
  const lastGames = [];
  playersData.forEach((p) => {
    (p.games || []).forEach((g) => {
      if (g.date === lastDateStr) {
        lastGames.push({
          player: p,
          game: g
        });
      }
    });
  });

  if (lastGames.length === 0) {
    lastScoresBody.innerHTML =
      '<tr><td colspan="5" class="px-3 py-2 text-center text-gray-500">Aucun score pour la dernière date.</td></tr>';
    lastNetBody.innerHTML =
      '<tr><td colspan="6" class="px-3 py-2 text-center text-gray-500">Aucun score pour la dernière date.</td></tr>';
    return;
  }

  // Tableau 3 : Scores bruts (tri par score croissant)
  const sortedByScore = [...lastGames].sort((a, b) => (a.game.score || 0) - (b.game.score || 0));

  lastScoresBody.innerHTML = sortedByScore
    .map((entry, index) => {
      const { player, game } = entry;
      const score = game.score || 0;
      const scoreText = score > 0 ? `+${score}` : `${score}`;

      return `
        <tr>
          <td class="px-3 py-2 border text-gray-600">${index + 1}</td>
          <td class="px-3 py-2 border font-medium">${player.name}</td>
          <td class="px-3 py-2 border text-right">${scoreText}</td>
          <td class="px-3 py-2 border text-right">${player.handicap.toFixed(1)}</td>
          <td class="px-3 py-2 border">${lastDateStr}</td>
        </tr>
      `;
    })
    .join("");

  // Tableau 4 : Score vs handicap
  const sortedByNet = [...lastGames]
    .map((entry) => {
      const { player, game } = entry;
      const score = game.score || 0;
      const diff = score - player.handicap;
      return { player, game, diff };
    })
    .sort((a, b) => a.diff - b.diff); // plus petit diff = meilleur

  lastNetBody.innerHTML = sortedByNet
    .map((entry, index) => {
      const { player, game, diff } = entry;
      const score = game.score || 0;
      const scoreText = score > 0 ? `+${score}` : `${score}`;
      const diffText = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
      const css =
        diff < 0 ? "text-green-600 font-semibold" : diff > 0 ? "text-red-600 font-semibold" : "";

      return `
        <tr>
          <td class="px-3 py-2 border text-gray-600">${index + 1}</td>
          <td class="px-3 py-2 border font-medium">${player.name}</td>
          <td class="px-3 py-2 border text-right">${scoreText}</td>
          <td class="px-3 py-2 border text-right">${player.handicap.toFixed(1)}</td>
          <td class="px-3 py-2 border text-right ${css}">${diffText}</td>
          <td class="px-3 py-2 border">${lastDateStr}</td>
        </tr>
      `;
    })
    .join("");
}

// --------------------------------------------------
// UI : gestion des onglets (boutons de sélection)
// --------------------------------------------------
function setupTabsUI() {
  const buttons = document.querySelectorAll(".tab-btn");
  const sections = document.querySelectorAll(".stats-section");

  if (!buttons.length || !sections.length) return;

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");

      sections.forEach((section) => {
        section.classList.toggle("hidden", section.id !== targetId);
      });

      buttons.forEach((b) => {
        b.classList.remove("bg-indigo-600", "text-white");
        b.classList.add("bg-gray-200", "text-gray-800");
      });

      btn.classList.remove("bg-gray-200", "text-gray-800");
      btn.classList.add("bg-indigo-600", "text-white");
    });
  });
}

// --------------------------------------------------
// UI : graphique de progression de l'handicap
// --------------------------------------------------
function setupGraphUI() {
  playerSelect = document.getElementById("playerSelect");
  loadGraphBtn = document.getElementById("loadGraphBtn");

  if (loadGraphBtn) {
    loadGraphBtn.addEventListener("click", () => {
      const playerId = playerSelect?.value;
      if (!playerId) {
        alert("Veuillez sélectionner un joueur.");
        return;
      }
      handleLoadHandicapGraph(playerId);
    });
  }
}

function populatePlayerSelect() {
  if (!playerSelect) return;

  const previous = playerSelect.value;

  // Réinitialiser la liste
  playerSelect.innerHTML = '<option value="">-- Sélectionnez un joueur --</option>';

  const sorted = [...players]
    .filter((p) => !p.name?.startsWith("Dummy"))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  sorted.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name || "Sans nom";
    playerSelect.appendChild(opt);
  });

  // Si un joueur était déjà sélectionné, on essaie de le conserver
  if (previous) {
    playerSelect.value = previous;
  }
}

// Construit l'historique d'handicap à partir des parties du joueur
function buildHandicapHistoryForPlayer(playerId) {
  const player = players.find((p) => p.id === playerId);
  if (!player) return [];

  const gamesSorted = (player.games || [])
    .filter((g) => g.date && typeof g.score === "number")
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const scoresSoFar = [];
  const history = [];

  gamesSorted.forEach((g) => {
    scoresSoFar.push(g.score);
    const hcp = calculateHandicapFromScores(scoresSoFar, player.startingHandicap);
    history.push({
      date: g.date,
      handicap: hcp
    });
  });

  return history;
}

function handleLoadHandicapGraph(playerId) {
  const player = players.find((p) => p.id === playerId);
  if (!player) {
    alert("Joueur introuvable.");
    return;
  }

  const history = buildHandicapHistoryForPlayer(playerId);
  if (!history.length) {
    alert("Aucune donnée de handicap trouvée pour ce joueur.");
    return;
  }

  renderHandicapGraph(history, player.name || "Joueur");
}

function renderHandicapGraph(history, playerName) {
  const canvas = document.getElementById("handicapChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  if (handicapChart) {
    handicapChart.destroy();
  }

  // Chart est fourni par le script Chart.js dans statistic.html
  handicapChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: history.map((h) => h.date),
      datasets: [
        {
          label: `Handicap - ${playerName}`,
          data: history.map((h) => h.handicap),
          borderWidth: 3,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.15)",
          tension: 0.25,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true }
      },
      scales: {
        y: {
          beginAtZero: false
        }
      }
    }
  });
}

// Lancement
init();
