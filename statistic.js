// ======================================================
// MGM - Suivi de golf intérieur
// Fichier : statistic.js
// Version : 2.3.0 (DEV)
// Rôle    : Statistiques globales de la ligue + graphique handicap
// Base    : mgm-hivers-dev (DEV)
// ======================================================

import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  getDoc
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

let app, db, auth, storage;
let players = [];

// Pour le graphique de progression de l'handicap
let handicapChart = null;
let playerSelect = null;
let loadGraphBtn = null;
// Pour le bouton "Voir la dernière carte de pointage"
let viewLastScorecardBtn = null;
let lastScorecardUrl = null;

// --------------------------------------------------
// Utilitaires math
// --------------------------------------------------
function safeAvg(arr) {
  if (!arr || !arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function safeStdDev(arr) {
  if (!arr || arr.length < 2) return null;
  const avg = safeAvg(arr);
  const variance = arr.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

// --------------------------------------------------
// Initialisation
// --------------------------------------------------
async function init() {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);       // <--- AJOUT

    await signInAnonymously(auth);

    setupTabsUI();
    setupGraphUI();      // initialisation UI du graphique
    setupLastScorecardUI();   // <--- AJOUT
    subscribePlayers();
  } catch (error) {
    console.error("Erreur d'initialisation des statistiques :", error);
    alert("Erreur lors du chargement des statistiques.");
  }
}

// --------------------------------------------------
// Calcul du handicap (même logique que l'app principale)
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
      const games = (p.games || []).filter((g) => typeof g.score === "number");
      const handicap = calculateHandicap(p);
      const totalWinnings = games.reduce((sum, g) => sum + (g.wager || 0), 0);

      // Birdies / triples
      const totalBirdies = games.reduce((sum, g) => sum + (g.birdies || 0), 0);
      const totalTriples = games.reduce((sum, g) => sum + (g.triples || 0), 0);
      const gamesCount = games.length;
      const birdiesPerGame = gamesCount ? totalBirdies / gamesCount : 0;

      // Parties triées par date
      const gamesSorted = [...games].sort((a, b) =>
        (a.date || "").localeCompare(b.date || "")
      );

      // Dernière partie du joueur (par date string)
      let lastGame = null;
      for (const g of gamesSorted) {
        if (!g.date) continue;
        if (!lastGame || g.date > lastGame.date) {
          lastGame = g;
        }
      }

      // Différentiel (score - handicap avant la partie) pour chaque partie
      const diffs = [];
      const scoresSoFar = [];
      gamesSorted.forEach((g) => {
        const hcpBefore = calculateHandicapFromScores(scoresSoFar, p.startingHandicap);
        const d = g.score - hcpBefore;
        diffs.push(d);
        scoresSoFar.push(g.score);
      });

      const normalizedAvg = safeAvg(diffs);
      const bestPerf = diffs.length ? Math.min(...diffs) : null;
      const worstPerf = diffs.length ? Math.max(...diffs) : null;
      const volatility = safeStdDev(diffs);

      // Tendance : on compare la moyenne des 3 dernières parties
      // avec la moyenne des 3 précédentes (si possible).
      let trendDelta = null;
      if (diffs.length >= 2) {
        const last3 = diffs.slice(-3);
        const prev3 =
          diffs.length > 3 ? diffs.slice(-6, -3) : diffs.slice(0, diffs.length - 1);
        const avgLast = safeAvg(last3);
        const avgPrev = safeAvg(prev3);
        if (avgLast !== null && avgPrev !== null) {
          trendDelta = avgLast - avgPrev; // < 0 = amélioration
        }
      }

      // Séries :
      // - "Parties jouées" = total de parties dans la saison (info simple)
      const totalGames = gamesSorted.length;

      // - Série en amélioration : en partant de la fin, tant que diff[i] < diff[i-1]
      let streakImproving = 0;
      for (let i = diffs.length - 1; i > 0; i--) {
        if (diffs[i] < diffs[i - 1]) {
          streakImproving++;
        } else {
          break;
        }
      }

      // - Série sous handicap : en partant de la fin, tant que diff <= 0
      let streakUnderHcp = 0;
      for (let i = diffs.length - 1; i >= 0; i--) {
        if (diffs[i] <= 0) {
          streakUnderHcp++;
        } else {
          break;
        }
      }

      return {
        ...p,
        games: gamesSorted,
        handicap,
        totalWinnings,
        lastGame,
        totalBirdies,
        totalTriples,
        birdiesPerGame,
        diffs,
        normalizedAvg,
        bestPerf,
        worstPerf,
        volatility,
        trendDelta,
        totalGames,
        streakImproving,
        streakUnderHcp
      };
    });

  renderHandicapTable(enrichedPlayers);
  renderWinningsTable(enrichedPlayers);
  renderLastGameTables(enrichedPlayers);
  renderTrendTable(enrichedPlayers);
  renderBirdiesTable(enrichedPlayers);
  renderNormalizedTable(enrichedPlayers);
  renderStreaksTable(enrichedPlayers);
}

function renderEmptyTables() {
  const bodies = [
    "handicapTableBody",
    "winningsTableBody",
    "lastScoresTableBody",
    "lastNetTableBody",
    "trendTableBody",
    "birdiesTableBody",
    "normalizedTableBody",
    "streaksTableBody"
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
      return `
        <tr>
          <td class="px-3 py-2 border text-gray-600">${index + 1}</td>
          <td class="px-3 py-2 border font-medium">${p.name}</td>
          <td class="px-3 py-2 border text-right">${p.handicap.toFixed(1)}</td>
          <td class="px-3 py-2 border text-right">${p.totalGames}</td>
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

    // Pas de partie => pas de carte de pointage
    updateLastScorecardButton(null);
    return;
  }

  if (lastGameInfo) {
    lastGameInfo.textContent = `Dernière partie connue : ${lastDateStr}`;
  }

  // Tente de récupérer la carte de pointage de cette date
  updateLastScorecardButton(lastDateStr);

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

  // Tableau 4 : Score vs handicap (utilise handicap actuel)
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

async function updateLastScorecardButton(dateStr) {
  if (!viewLastScorecardBtn) return;

  // Réinitialise l'état par défaut
  lastScorecardUrl = null;
  viewLastScorecardBtn.classList.add("hidden");

  if (!dateStr || !storage) return;

  try {
    // On suppose que le fichier dans Storage s'appelle "YYYY-MM-DD.pdf"
    const pdfRef = ref(storage, `scorecards/${dateStr}.pdf`);
    const url = await getDownloadURL(pdfRef);

    // Si on arrive ici, le fichier existe et l'URL est valide
    lastScorecardUrl = url;
    viewLastScorecardBtn.classList.remove("hidden");
  } catch (error) {
    // Si le fichier n'existe pas, on garde le bouton caché sans alerter
    if (error.code !== "storage/object-not-found") {
      console.error("Erreur lors de la récupération de la carte de pointage :", error);
    }
    // lastScorecardUrl reste null, bouton caché
  }
}



// --------- Tableau 5 : Tendance des scores ----------
function renderTrendTable(playersData) {
  const tbody = document.getElementById("trendTableBody");
  if (!tbody) return;

  // On ne garde que les joueurs ayant au moins 2 parties (sinon pas de tendance)
  const withTrend = playersData.filter(
    (p) => p.diffs && p.diffs.length >= 2 && p.trendDelta !== null
  );

  if (!withTrend.length) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="px-3 py-2 text-center text-gray-500">Pas assez de données pour calculer une tendance.</td></tr>';
    return;
  }

  const sorted = [...withTrend].sort((a, b) => (a.trendDelta || 0) - (b.trendDelta || 0));

  tbody.innerHTML = sorted
    .map((p, index) => {
      const delta = p.trendDelta ?? 0;
      const deltaText = `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`;
      let comment = "Stable";
      if (delta < -0.5) comment = "En forte amélioration";
      else if (delta < 0) comment = "En légère amélioration";
      else if (delta > 0.5) comment = "Détérioration";

      const css =
        delta < 0 ? "text-green-600 font-semibold" : delta > 0 ? "text-red-600 font-semibold" : "";

      return `
        <tr>
          <td class="px-3 py-2 border text-gray-600">${index + 1}</td>
          <td class="px-3 py-2 border font-medium">${p.name}</td>
          <td class="px-3 py-2 border text-right ${css}">${deltaText}</td>
          <td class="px-3 py-2 border">${comment}</td>
        </tr>
      `;
    })
    .join("");
}

// --------- Tableau 6 : Birdies / Triples ----------
function renderBirdiesTable(playersData) {
  const tbody = document.getElementById("birdiesTableBody");
  if (!tbody) return;

  const sorted = [...playersData].sort(
    (a, b) => (b.totalBirdies || 0) - (a.totalBirdies || 0)
  );

  if (!sorted.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="px-3 py-2 text-center text-gray-500">Aucun joueur.</td></tr>';
    return;
  }

  tbody.innerHTML = sorted
    .map((p, index) => {
      return `
        <tr>
          <td class="px-3 py-2 border text-gray-600">${index + 1}</td>
          <td class="px-3 py-2 border font-medium">${p.name}</td>
          <td class="px-3 py-2 border text-right">${p.totalBirdies}</td>
          <td class="px-3 py-2 border text-right">${p.totalTriples}</td>
          <td class="px-3 py-2 border text-right">${p.birdiesPerGame.toFixed(2)}</td>
        </tr>
      `;
    })
    .join("");
}

// --------- Tableau 7 : Score normalisé ----------
function renderNormalizedTable(playersData) {
  const tbody = document.getElementById("normalizedTableBody");
  if (!tbody) return;

  const withNorm = playersData.filter((p) => p.normalizedAvg !== null);

  if (!withNorm.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="px-3 py-2 text-center text-gray-500">Pas assez de données pour calculer les scores normalisés.</td></tr>';
    return;
  }

  const sorted = [...withNorm].sort(
    (a, b) => (a.normalizedAvg || 0) - (b.normalizedAvg || 0)
  );

  tbody.innerHTML = sorted
    .map((p, index) => {
      const avg = p.normalizedAvg ?? 0;
      const avgText = `${avg > 0 ? "+" : ""}${avg.toFixed(2)}`;
      const best = p.bestPerf ?? null;
      const worst = p.worstPerf ?? null;

      return `
        <tr>
          <td class="px-3 py-2 border text-gray-600">${index + 1}</td>
          <td class="px-3 py-2 border font-medium">${p.name}</td>
          <td class="px-3 py-2 border text-right">${avgText}</td>
          <td class="px-3 py-2 border text-right">${best !== null ? best.toFixed(2) : "-"}</td>
          <td class="px-3 py-2 border text-right">${worst !== null ? worst.toFixed(2) : "-"}</td>
        </tr>
      `;
    })
    .join("");
}

// --------- Tableau 8 : Séries de parties ----------
function renderStreaksTable(playersData) {
  const tbody = document.getElementById("streaksTableBody");
  if (!tbody) return;

  if (!playersData.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="px-3 py-2 text-center text-gray-500">Aucun joueur.</td></tr>';
    return;
  }

  const sorted = [...playersData].sort(
    (a, b) => (b.streakUnderHcp || 0) - (a.streakUnderHcp || 0)
  );

  tbody.innerHTML = sorted
    .map((p, index) => {
      return `
        <tr>
          <td class="px-3 py-2 border text-gray-600">${index + 1}</td>
          <td class="px-3 py-2 border font-medium">${p.name}</td>
          <td class="px-3 py-2 border text-right">${p.totalGames}</td>
          <td class="px-3 py-2 border text-right">${p.streakImproving}</td>
          <td class="px-3 py-2 border text-right">${p.streakUnderHcp}</td>
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

function setupLastScorecardUI() {
  viewLastScorecardBtn = document.getElementById("viewLastScorecardBtn");

  if (!viewLastScorecardBtn) return;

  viewLastScorecardBtn.addEventListener("click", () => {
    if (!lastScorecardUrl) {
      alert("Aucune carte de pointage n'est disponible pour la dernière partie.");
      return;
    }
    // Ouvre le PDF dans un nouvel onglet
    window.open(lastScorecardUrl, "_blank");
  });
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
    const hcp = calculateHandicapFromScores(scoresSoFar, player.startingHandicap);
    history.push({
      date: g.date,
      handicap: hcp
    });
    scoresSoFar.push(g.score);
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
  // @ts-ignore
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
