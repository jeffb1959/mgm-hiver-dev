// ======================================================
// MGM - Suivi de golf intérieur
// Fichier : accueil.js
// Version : 2.1.0 (DEV)
// Rôle    : Page d'accueil simplifiée (accueil.html)
// Base Firebase : mgm-hivers-dev (lecture seule ici)
// ======================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  getDoc
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

const ADMIN_PASSWORD = "MGM";
const ADMIN_FLAG_KEY = "mgm_admin_ok";

let app, db, auth;
// Dictionnaire ID → Nom des joueurs pour la modale des équipes
let playerNameMap = {};

// --------------------------------------------------
// Initialisation Firebase
// --------------------------------------------------
async function initializeFirebase() {
  try {
    app  = initializeApp(firebaseConfig);
    db   = getFirestore(app);
    auth = getAuth(app);

    await signInAnonymously(auth);
    loadPlayersForSelect();
  } catch (error) {
    console.error("Erreur d'initialisation Firebase (accueil):", error);
    const hint = document.getElementById("playerSelectHint");
    if (hint) {
      hint.textContent = "Erreur de connexion à la base de données (voir console).";
      hint.classList.add("text-red-600");
    }
  }
}

// --------------------------------------------------
// UI & événements
// --------------------------------------------------
function setupUIEvents() {
  const viewTeamsBtn        = document.getElementById("viewTeamsBtn");
  const statsBtn            = document.getElementById("statsBtn");
  const adminBtn            = document.getElementById("adminBtn");
  const playerSelect        = document.getElementById("playerSelect");
  const viewPlayerBtn       = document.getElementById("viewPlayerBtn");
  const teamsModal          = document.getElementById("viewTeamsModal");
  const closeTeamsModalTop  = document.getElementById("closeTeamsModal");
  const closeTeamsModalBot  = document.getElementById("closeTeamsModalBottom");
  const presenceBtn = document.getElementById("presenceBtn");


  // Voir équipes -> ouvrir modale
  if (viewTeamsBtn) {
    viewTeamsBtn.addEventListener("click", () => {
      openViewTeamsModal();
    });
  }

// Statistiques -> redirection vers statistic.html
if (statsBtn) {
  statsBtn.addEventListener("click", () => {
    window.location.href = "statistic.html";
  });
}

    // Admin -> demande mot de passe une seule fois, puis accès direct
  if (adminBtn) {
    adminBtn.addEventListener("click", () => {
      const alreadyOk = localStorage.getItem(ADMIN_FLAG_KEY) === "true";

      // Si déjà authentifié, on va directement sur la page admin
      if (alreadyOk) {
        window.location.href = "mgm-hiver-dev.html";
        return;
      }

      // Sinon, on demande le mot de passe
      const input = window.prompt(
        "Accès réservé à l'administration.\n\nEntrez le mot de passe :"
      );

      if (input === null) {
        // L'utilisateur a annulé
        return;
      }

      if (input === ADMIN_PASSWORD) {
        // On mémorise l'accès admin pour les prochains clics
        localStorage.setItem(ADMIN_FLAG_KEY, "true");
        window.location.href = "mgm-hiver-dev.html";
      } else {
        alert("Mot de passe incorrect.");
      }
    });
    // Bouton PRÉSENCE - redirection vers presence.html
      if (presenceBtn) {
        presenceBtn.addEventListener("click", () => {
          window.location.href = "presence.html";
        });
      }

  }


  // Choix du joueur -> activation du bouton "Voir ma fiche"
  if (playerSelect && viewPlayerBtn) {
    playerSelect.addEventListener("change", () => {
      viewPlayerBtn.disabled = !playerSelect.value;
    });

    viewPlayerBtn.addEventListener("click", () => {
      const playerId = playerSelect.value;
      if (!playerId) return;

      const url = new URL("fiche-joueur.html", window.location.href);
      url.searchParams.set("playerId", playerId);
      window.location.href = url.toString();
    });
  }

  // Fermeture de la modale Équipes
  function closeTeamsModal() {
    if (teamsModal) {
      teamsModal.classList.remove("active");
    }
  }

  if (closeTeamsModalTop) {
    closeTeamsModalTop.addEventListener("click", closeTeamsModal);
  }
  if (closeTeamsModalBot) {
    closeTeamsModalBot.addEventListener("click", closeTeamsModal);
  }
  if (teamsModal) {
    teamsModal.addEventListener("click", (event) => {
      if (event.target === teamsModal) {
        closeTeamsModal();
      }
    });
  }
}

// --------------------------------------------------
// Chargement des joueurs pour la liste déroulante
// --------------------------------------------------
function loadPlayersForSelect() {
  const playerSelect = document.getElementById("playerSelect");
  const hint         = document.getElementById("playerSelectHint");

  if (!playerSelect) return;

  const playersCol = collection(db, "players");

  onSnapshot(
    playersCol,
    (snapshot) => {
      const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      players.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

      // Remplir la liste déroulante
      playerSelect.innerHTML = `<option value="">-- Sélectionnez votre nom --</option>`;

      // 🔥 Remplir le dictionnaire ID → nom
      playerNameMap = {};
      players.forEach(player => {
        playerNameMap[player.id] = player.name || "(sans nom)";

        const opt = document.createElement("option");
        opt.value = player.id;
        opt.textContent = player.name || "(sans nom)";
        playerSelect.appendChild(opt);
      });

      if (hint) {
        hint.textContent = `Noms chargés (${players.length} joueurs).`;
        hint.classList.remove("text-red-600");
      }
    },
    (error) => {
      console.error("Erreur de lecture des joueurs (accueil):", error);
      if (hint) {
        hint.textContent = "Erreur de lecture des joueurs (voir console).";
        hint.classList.add("text-red-600");
      }
    }
  );
}


// --------------------------------------------------
// Affichage des équipes sauvegardées (modale)
// --------------------------------------------------
function splitPairString(pairString) {
  if (!pairString || typeof pairString !== "string") return ["", ""];

  const parts = pairString.split("_");
  const id1 = parts[0] || "";
  const id2 = parts[1] || "";

  // 🔥 Convertir ID → nom via playerNameMap
  const name1 = playerNameMap[id1] || id1;
  const name2 = playerNameMap[id2] || id2;

  return [name1, name2];
}

function formatHistoryDate(dateStr) {
  if (!dateStr) return "Date inconnue";
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("fr-CA", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  } catch {
    return "Date inconnue";
  }
}

async function openViewTeamsModal() {
  const modal      = document.getElementById("viewTeamsModal");
  const container  = document.getElementById("viewTeamsContainer");
  const dateOutput = document.getElementById("viewTeamsDate");

  if (!modal || !container || !dateOutput) {
    console.error("Éléments manquants pour afficher les équipes.");
    return;
  }

  if (!db) {
    console.error("Firestore non initialisé.");
    container.innerHTML = `<p class="text-red-500 text-center md:col-span-2">Base de données non initialisée.</p>`;
    modal.classList.add("active");
    return;
  }

  // État de chargement
  container.innerHTML = `<p class="text-gray-500 text-center md:col-span-2">Chargement des équipes...</p>`;
  dateOutput.textContent = "";

  try {
    const historyRef = doc(db, "settings", "teamHistory");
    const snap = await getDoc(historyRef);

    if (!snap.exists()) {
      container.innerHTML = `<p class="text-gray-500 text-center md:col-span-2">Aucune équipe sauvegardée pour le moment.</p>`;
      modal.classList.add("active");
      return;
    }

    const data = snap.data() || {};
    const history = Array.isArray(data.history) ? data.history : [];

    if (!history.length) {
      container.innerHTML = `<p class="text-gray-500 text-center md:col-span-2">Aucune équipe sauvegardée pour le moment.</p>`;
      modal.classList.add("active");
      return;
    }

    const lastEntry = history[history.length - 1];
    const teams = Array.isArray(lastEntry.teams) ? lastEntry.teams : [];

    const displayDate = formatHistoryDate(lastEntry.date);
    dateOutput.textContent = `Équipes sauvegardées le ${displayDate}`;

    if (!teams.length || teams.length % 2 !== 0) {
      container.innerHTML = `<p class="text-red-500 text-center md:col-span-2">Format des équipes invalide dans l'historique.</p>`;
      modal.classList.add("active");
      return;
    }

    container.innerHTML = "";

    const teamLabels = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const groupStyles = [
      { title: "Groupe 1", color: "text-cyan-700", border: "border-cyan-200", bg: "bg-cyan-50" },
      { title: "Groupe 2", color: "text-orange-600", border: "border-orange-200", bg: "bg-orange-50" },
      { title: "Groupe 3", color: "text-emerald-700", border: "border-emerald-200", bg: "bg-emerald-50" },
      { title: "Groupe 4", color: "text-purple-700", border: "border-purple-200", bg: "bg-purple-50" }
    ];

    let groupIndex = 0;

    for (let i = 0; i < teams.length; i += 2) {
      const pair1 = teams[i];
      const pair2 = teams[i + 1];

      const [p1a, p1b] = splitPairString(pair1);
      const [p2a, p2b] = splitPairString(pair2);

      const groupStyle = groupStyles[groupIndex % groupStyles.length];
      const teamLabel1 = teamLabels[groupIndex * 2]     || `Équipe ${groupIndex * 2 + 1}`;
      const teamLabel2 = teamLabels[groupIndex * 2 + 1] || `Équipe ${groupIndex * 2 + 2}`;

      const card = document.createElement("div");
      card.className = `rounded-2xl shadow-md border ${groupStyle.border} ${groupStyle.bg} p-4 flex flex-col gap-4`;

      card.innerHTML = `
        <h3 class="text-lg font-bold ${groupStyle.color} mb-2 text-center">${groupStyle.title}</h3>
        <div class="space-y-3">
          <div class="rounded-xl bg-white/70 border border-gray-200 px-3 py-2 text-sm">
            <p class="text-center font-semibold mb-1">Équipe ${teamLabel1}</p>
            <p class="flex justify-between">
              <span>${p1a}</span>
              <span class="${groupStyle.color} font-bold">&amp;</span>
              <span>${p1b}</span>
            </p>
          </div>

          <div class="rounded-xl bg-white/70 border border-gray-200 px-3 py-2 text-sm">
            <p class="text-center font-semibold mb-1">Équipe ${teamLabel2}</p>
            <p class="flex justify-between">
              <span>${p2a}</span>
              <span class="${groupStyle.color} font-bold">&amp;</span>
              <span>${p2b}</span>
            </p>
          </div>
        </div>
      `;

      container.appendChild(card);
      groupIndex++;
    }

    modal.classList.add("active");
  } catch (error) {
    console.error("Erreur lors de la lecture des équipes:", error);
    container.innerHTML = `<p class="text-red-500 text-center md:col-span-2">Erreur lors de la lecture des équipes.</p>`;
    modal.classList.add("active");
  }
}

// --------------------------------------------------
// Démarrage
// --------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  setupUIEvents();
  initializeFirebase();
});
