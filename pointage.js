// ======================================================
// MGM - Suivi de golf intérieur
// Fichier : pointage.js
// Version : 2.1.0 (DEV)
// Rôle    : Préparation et génération de la fiche de pointage Excel
// Base Firebase : mgm-hivers-dev
// ======================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Config Firebase DEV (identique à mgm.js) ---
const firebaseConfig = {
  apiKey: "AIzaSyC0ZHX83YQ3jpiFAx1wtkOPiwRNqsE9Npw",
  authDomain: "statgolfv2.firebaseapp.com",
  projectId: "statgolfv2",
  storageBucket: "statgolfv2.firebasestorage.app",
  messagingSenderId: "127072359585",
  appId: "1:127072359585:web:9c37f6ff0d40c0e07b4ce0"
};

let app, db, auth;

// Map id → player data
let playersMap = {};
// Assignation des équipes pour Excel (A/B/C/D → 2 joueurs)
let teamAssignments = {
  A: null,
  B: null,
  C: null,
  D: null
};

// --------------------------------------------------
// Utils
// --------------------------------------------------
function formatNumberOrEmpty(value) {
  if (value === "" || value === null || typeof value === "undefined") return "";
  const n = Number(value);
  return Number.isNaN(n) ? "" : n;
}

function formatHistoryDateFR(dateStr) {
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

// Calcul du handicap (copié de mgm.js)
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
  const relevantScores = scores.length > 10 ? scores.slice(-10) : [...scores];
  relevantScores.sort((a, b) => a - b);
  const best5 = relevantScores.slice(0, 5);
  if (best5.length === 0) return player.startingHandicap;
  return best5.reduce((a, b) => a + b, 0) / 5;
}

// --------------------------------------------------
// Initialisation
// --------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  setupUIEvents();
  initializeFirebaseAndLoad();
});

function setupUIEvents() {
  const btn = document.getElementById("prepareDataBtn");
  if (btn) {
    btn.addEventListener("click", handlePrepareData);
  }

  const courseFileInput = document.getElementById("courseFile");
  if (courseFileInput) {
    courseFileInput.addEventListener("change", handleCourseFileImport);
  }
}


async function initializeFirebaseAndLoad() {
  const infoMsg = document.getElementById("teamsInfoMessage");
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);

    await signInAnonymously(auth);

    // Charger joueurs + historique équipes
    if (infoMsg) infoMsg.textContent = "Chargement des joueurs...";
    await loadPlayers();

    if (infoMsg) infoMsg.textContent = "Chargement des équipes sauvegardées...";
    await loadLastTeamsFromHistory();

  } catch (error) {
    console.error("Erreur d'initialisation (pointage):", error);
    if (infoMsg) {
      infoMsg.textContent = "Erreur de connexion à la base de données.";
      infoMsg.classList.add("text-red-600");
    }
  }
}

// --------------------------------------------------
// Chargement Firestore
// --------------------------------------------------
async function loadPlayers() {
  playersMap = {};
  const snapshot = await getDocs(collection(db, "players"));
  snapshot.forEach(docSnap => {
    playersMap[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
  });
}

async function loadLastTeamsFromHistory() {
  const infoMsg = document.getElementById("teamsInfoMessage");
  const container = document.getElementById("teamsContainer");
  if (!container) return;

  const historyRef = doc(db, "settings", "teamHistory");
  const histSnap = await getDoc(historyRef);

  if (!histSnap.exists()) {
    if (infoMsg) {
      infoMsg.textContent = "Aucune équipe sauvegardée trouvée (teamHistory vide).";
      infoMsg.classList.add("text-red-600");
    }
    container.innerHTML = "";
    return;
  }

  const data = histSnap.data() || {};
  const history = Array.isArray(data.history) ? data.history : [];

  if (!history.length) {
    if (infoMsg) {
      infoMsg.textContent = "Aucune équipe sauvegardée dans l'historique.";
      infoMsg.classList.add("text-red-600");
    }
    container.innerHTML = "";
    return;
  }

  const lastEntry = history[history.length - 1];
  const teamsArr = Array.isArray(lastEntry.teams) ? lastEntry.teams : [];
  const displayDate = formatHistoryDateFR(lastEntry.date);

  if (infoMsg) {
    infoMsg.textContent = `Équipes sauvegardées le ${displayDate}`;
    infoMsg.classList.remove("text-red-600");
  }

  // teamsArr = ["idA1_idA2", "idB1_idB2", "idC1_idC2", "idD1_idD2", ...]
  if (teamsArr.length < 4) {
    console.warn("Moins de 4 équipes dans l'historique, on utilisera ce qui est disponible.");
  }

  const teamLetters = ["A", "B", "C", "D"];
  teamAssignments = { A: null, B: null, C: null, D: null };

  container.innerHTML = "";

  for (let i = 0; i < 4 && i < teamsArr.length; i++) {
    const teamLetter = teamLetters[i];
    const pair = teamsArr[i]; // "id1_id2"
    const [id1, id2] = (pair || "").split("_");

    const p1 = playersMap[id1];
    const p2 = playersMap[id2];

    const p1Name = p1?.name || "(inconnu)";
    const p2Name = p2?.name || "(inconnu)";
    const p1Hcp = p1 ? calculateHandicap(p1) : 0;
    const p2Hcp = p2 ? calculateHandicap(p2) : 0;

    teamAssignments[teamLetter] = {
      p1: { id: id1, name: p1Name, handicap: p1Hcp },
      p2: { id: id2, name: p2Name, handicap: p2Hcp }
    };

    const card = document.createElement("div");
    card.className = "rounded-2xl border border-gray-200 bg-gray-50 p-4 shadow-sm flex flex-col gap-3";

    card.innerHTML = `
      <h3 class="text-lg font-semibold text-gray-800 mb-1">Équipe ${teamLetter}</h3>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="font-medium">Joueur 1 :</span>
          <span>${p1Name} <span class="text-xs text-gray-500">(HCP: ${p1Hcp.toFixed(1)})</span></span>
        </div>
        <div class="flex justify-between">
          <span class="font-medium">Joueur 2 :</span>
          <span>${p2Name} <span class="text-xs text-gray-500">(HCP: ${p2Hcp.toFixed(1)})</span></span>
        </div>
      </div>
      <p class="text-xs text-gray-500 mt-1">
        Ces noms iront dans les cellules B9/B10/B13/B14/B26/B27/B28/B29
        (et handicaps en C9/C10/C13/C14/C26/C27/C28/C29).
      </p>
    `;

    container.appendChild(card);
  }
}

// fonction lire le fichier 
function handleCourseFileImport(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const data = JSON.parse(text);
      applyCourseDataToForm(data);
      alert("Données du terrain importées. Vérifie les valeurs et complète au besoin.");
    } catch (err) {
      console.error("Erreur lors de la lecture du fichier terrain :", err);
      alert("Fichier invalide. Assure-toi qu'il s'agit d'un JSON au bon format.");
    }
  };
  reader.readAsText(file, "utf-8");
}
// fonction remplit le formulaire
function applyCourseDataToForm(data) {
  if (!data || typeof data !== "object") return;

  // Infos terrain
  if (data.courseName && document.getElementById("courseName")) {
    document.getElementById("courseName").value = data.courseName;
  }
  if (typeof data.rating !== "undefined" && document.getElementById("courseRating")) {
    document.getElementById("courseRating").value = data.rating;
  }
  if (typeof data.slope !== "undefined" && document.getElementById("courseSlope")) {
    document.getElementById("courseSlope").value = data.slope;
  }
  if (data.difficultyLabel && document.getElementById("courseDifficulty")) {
    document.getElementById("courseDifficulty").value = data.difficultyLabel;
  }

  // Longueurs, difficultés, handicaps trous 1 à 18
  const lengths      = Array.isArray(data.lengths)      ? data.lengths      : [];
  const difficulties = Array.isArray(data.difficulties) ? data.difficulties : [];
  const handicaps    = Array.isArray(data.handicaps)    ? data.handicaps    : [];

  for (let hole = 1; hole <= 18; hole++) {
    const lenInput  = document.getElementById(`len-${hole}`);
    const diffInput = document.getElementById(`diff-${hole}`);
    const hcpInput  = document.getElementById(`hcp-${hole}`);

    const idx = hole - 1;

    if (lenInput && typeof lengths[idx] !== "undefined") {
      lenInput.value = lengths[idx];
    }
    if (diffInput && typeof difficulties[idx] !== "undefined") {
      diffInput.value = difficulties[idx];
    }
    if (hcpInput && typeof handicaps[idx] !== "undefined") {
      hcpInput.value = handicaps[idx];
    }
  }
}


// --------------------------------------------------
// Préparation des données pour Excel
// --------------------------------------------------
async function handlePrepareData() {
  // Objet { cellRef: value } que nous utiliserons avec SheetJS
  const excelData = {};

  // --- Infos terrain ---
  excelData["D2"] = document.getElementById("courseName")?.value || "";
  excelData["F3"] = formatNumberOrEmpty(document.getElementById("courseRating")?.value);
  excelData["I3"] = formatNumberOrEmpty(document.getElementById("courseSlope")?.value);
  excelData["L3"] = document.getElementById("courseDifficulty")?.value || "";

  // Colonnes pour les 9 premiers trous / 9 derniers trous
  const frontCols = ["D", "E", "F", "G", "H", "I", "J", "K", "L"];
  const backCols  = ["N", "O", "P", "Q", "R", "S", "T", "U", "V"];

  for (let hole = 1; hole <= 18; hole++) {
    const lenInput  = document.getElementById(`len-${hole}`);
    const diffInput = document.getElementById(`diff-${hole}`);
    const hcpInput  = document.getElementById(`hcp-${hole}`);

    const lenVal  = formatNumberOrEmpty(lenInput?.value);
    const diffVal = formatNumberOrEmpty(diffInput?.value);
    const hcpVal  = formatNumberOrEmpty(hcpInput?.value);

    let cols, index;
    if (hole <= 9) {
      cols = frontCols;
      index = hole - 1;
    } else {
      cols = backCols;
      index = hole - 10;
    }

    const col = cols[index];

    // Longueur : ligne 6
    excelData[`${col}6`] = lenVal; // longeur du trous
    // Difficulté : ligne 7
    excelData[`${col}7`] = diffVal; //Par
    // Handicap : ligne 8
    excelData[`${col}8`] = hcpVal; // Index
  }

  // --- Joueurs / handicaps pour les équipes A–D ---
  const playerCellMap = {
    A: {
      p1Name: "B9",  p1Hcp: "C9",
      p2Name: "B10", p2Hcp: "C10"
    },
    B: {
      p1Name: "B13", p1Hcp: "C13",
      p2Name: "B14", p2Hcp: "C14"
    },
    C: {
      p1Name: "B26", p1Hcp: "C26",
      p2Name: "B27", p2Hcp: "C27"
    },
    D: {
      p1Name: "B30", p1Hcp: "C30",
      p2Name: "B31", p2Hcp: "C31"
    }
  };

  ["A", "B", "C", "D"].forEach(teamLetter => {
    const assign = teamAssignments[teamLetter];
    const cells = playerCellMap[teamLetter];
    if (!assign || !cells) return;

    excelData[cells.p1Name] = assign.p1.name;
    excelData[cells.p1Hcp]  = assign.p1.handicap; // nombre
    excelData[cells.p2Name] = assign.p2.name;
    excelData[cells.p2Hcp]  = assign.p2.handicap; // nombre
  });

  console.log("Données prêtes pour le modèle Excel :", excelData);

  try {
    await generateExcelFromTemplate(excelData);
  } catch (error) {
    console.error("Erreur lors de la génération du fichier Excel:", error);
    alert("Erreur lors de la génération du fichier Excel. Voir la console pour plus de détails.");
  }
}

// --------------------------------------------------
// Génération Excel via SheetJS
// --------------------------------------------------
async function generateExcelFromTemplate(excelData) {
  if (typeof XLSX === "undefined") {
    alert("La bibliothèque Excel (SheetJS) n'est pas chargée.");
    return;
  }

  // Charger le modèle
  const response = await fetch("modele_carte_pointage.xlsx");
  if (!response.ok) {
    throw new Error("Impossible de charger le modèle Excel (modele_carte_pointage.xlsx).");
  }

  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

// On part de la première feuille du modèle (ex. 'Feuil1')
const templateName = workbook.SheetNames[0];
const templateSheet = workbook.Sheets[templateName];

// 👉 Clone complet de la feuille (équivalent à copier/coller la page au complet)
const newSheetName = "Pointage";
const sheetCopy = JSON.parse(JSON.stringify(templateSheet));
workbook.Sheets[newSheetName] = sheetCopy;

// On fait de cette copie la feuille active sur laquelle on travaille
const sheet = workbook.Sheets[newSheetName];
workbook.SheetNames[0] = newSheetName;


  // Appliquer chaque valeur dans la feuille
  for (const [cell, value] of Object.entries(excelData)) {
    if (value === "" || value === null || typeof value === "undefined") continue;

    const cellObj = sheet[cell] || {};

    if (typeof value === "number") {
      cellObj.t = "n";      // numeric
      cellObj.v = value;
    } else {
      cellObj.t = "s";      // string
      cellObj.v = String(value);
    }

    sheet[cell] = cellObj;
  }

  // Nom du fichier : Pointage_<NomTerrain>_<YYYY-MM-DD>.xlsx
  const courseName = excelData["D2"] || "Terrain";
  const today = new Date().toISOString().slice(0, 10);
  const safeCourseName = courseName.replace(/[^\w\-]+/g, "_");
  const fileName = `Pointage_${safeCourseName}_${today}.xlsx`;

  XLSX.writeFile(workbook, fileName);
}
