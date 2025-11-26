// ======================================================
// MGM - Suivi de golf intérieur
// Fichier : mgm.js
// Version : 2.0.0 (DEV)
// Base Firebase : mgm-hivers-dev
// Notes :
//   - Code extrait de l'ancien <script type="module"> d'index.html
//   - Connexion pointant vers la base de développement
// ======================================================


const ADMIN_FLAG_KEY = "mgm_admin_ok";

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, setLogLevel, deleteDoc, getDoc, setDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let app, db, auth, players = [];
let currentPreparedList = []; 
let currentGeneratedPairs = []; 
let teamHistory = { history: [] }; 
const playersContainer = document.getElementById('playersContainer');

let deleteTimer = null;
let deleteTarget = null;

async function initializeFirebase() {
    try {

const firebaseConfig = {
  apiKey: "AIzaSyDX1UFMBssUcrTS6zfFdaJ6oldrPnkj9vI",
  authDomain: "mgm-hivers-dev.firebaseapp.com",
  projectId: "mgm-hivers-dev",
  storageBucket: "mgm-hivers-dev.firebasestorage.app",
  messagingSenderId: "90366576232",
  appId: "1:90366576232:web:9ffaad59b68a9db4eb5ddd"
};


        // ======================================================


        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        setLogLevel('debug'); 
        
        await signInAnonymously(auth); 
        
        loadPlayers();
        loadTeamHistory(); 
        // checkAndAddMockData retiré
        setupEventListeners(); 
    } catch (error) {
        console.error("Firebase initialization failed:", error);
        if(playersContainer) playersContainer.innerHTML = `<p class="text-red-500 text-center col-span-full">Erreur: L'initialisation a échoué. Vérifiez vos clés Firebase.</p>`;
    }
}

function loadPlayers() {
    const playersCollection = collection(db, "players"); 
    onSnapshot(playersCollection, (snapshot) => {
        players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        players.sort((a, b) => a.name.localeCompare(b.name));
        renderPlayers();
        updateAttendanceCountDisplay(); 
    }, (error) => console.error("Error loading players:", error));
}

function loadTeamHistory() {
    const historyRef = doc(db, "settings", 'teamHistory'); 
    onSnapshot(historyRef, (doc) => {
        if (doc.exists()) {
                const data = doc.data();
                if (data && Array.isArray(data.history)) {
                    teamHistory.history = data.history.map(entry => {
                        if (entry && entry.date && Array.isArray(entry.teams)) {
                            const validTeams = entry.teams
                                .map(teamData => {
                                    if (typeof teamData === 'string' && teamData.includes('_')) {
                                        return teamData;
                                    }
                                    else if (Array.isArray(teamData) && teamData.length === 2 && typeof teamData[0] === 'string' && typeof teamData[1] === 'string') {
                                        return teamData.sort().join('_'); 
                                    }
                                    return null; 
                                })
                                .filter(team => team !== null); 
                            if (validTeams.length > 0) {
                                return { date: entry.date, teams: validTeams };
                            }
                        }
                        return null; 
                    }).filter(entry => entry !== null); 
                } else {
                    console.warn("Team history format incorrect in Firestore, resetting.");
                    teamHistory.history = [];
                }
        } else {
            teamHistory = { history: [] }; 
        }
    }, (error) => console.error("Error loading team history:", error));
}


function renderPlayers() {
    if (!playersContainer) return; 
    playersContainer.innerHTML = '';
    players.forEach(player => {
        const handicap = calculateHandicap(player);
        const totalGames = player.games ? player.games.length : 0;
        const totalBirdies = (player.games || []).reduce((sum, game) => sum + (game.birdies || 0), 0);
        const totalTriples = (player.games || []).reduce((sum, game) => sum + (game.triples || 0), 0);
        const totalWinnings = (player.games || []).reduce((sum, game) => sum + (game.wager || 0), 0);
        const totalAdvances = (player.advances || []).reduce((sum, advance) => sum + advance.amount, 0);
        const totalCosts = (player.games || []).reduce((sum, game) => sum + (game.cost || 0), 0);
        const balance = totalAdvances - totalCosts;
        const winningsClass = totalWinnings >= 0 ? 'text-green-600' : 'text-red-600';
        const balanceClass = balance >= 0 ? 'text-green-600' : 'text-red-600';
        const handicapClass = totalGames < 6 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';
        const playerType = player.playerType || 'regular'; 
        const playerTypeText = playerType === 'regular' ? 'Régulier' : 'Remplaçant';
        const playerTypeClass = playerType === 'regular' ? 'text-green-700' : 'text-yellow-600';
        const defaultStatus = playerType === 'regular' ? 'present' : 'absent';
        const currentStatus = player.nextWeekStatus || defaultStatus;

        const playerCard = document.createElement('div');
        playerCard.className = 'player-card bg-white rounded-xl shadow-md overflow-hidden p-5 flex flex-col';
        playerCard.innerHTML = `
            <h3 class="text-xl font-bold text-gray-900">${player.name}</h3>
            <p class="text-sm font-semibold ${playerTypeClass} -mt-1 mb-2">${playerTypeText}</p>
            <div class="flex-grow space-y-1">
                <p><span class="font-semibold">Handicap:</span> <span class="${handicapClass}">${handicap.toFixed(1)}</span></p>
                <p><span class="font-semibold">Parties Jouées:</span> ${totalGames}</p>
                <p><span class="font-semibold">Total Birdies:</span> ${totalBirdies}</p>
                <p><span class="font-semibold">Total Triples:</span> ${totalTriples}</p>
                <p><span class="font-semibold">Gains / Pertes:</span> <span class="${winningsClass} font-bold">${totalWinnings.toFixed(2)} $</span></p>
                <p><span class="font-semibold">Solde:</span> <span class="${balanceClass} font-bold">${balance.toFixed(2)} $</span></p>
                <div class="mt-3 pt-3 border-t border-gray-200">
                    <label class="block text-sm font-medium text-gray-700 mb-2">Présent la semaine prochaine :</label>
                    <div class="flex space-x-4">
                        <div class="flex items-center">
                            <input id="status-present-${player.id}" name="status-${player.id}" type="radio" value="present" class="attendance-radio h-4 w-4 text-green-600 border-gray-300 focus:ring-green-500" data-id="${player.id}" ${currentStatus === 'present' ? 'checked' : ''}>
                            <label for="status-present-${player.id}" class="ml-2 block text-sm text-gray-900">Présent</label>
                        </div>
                        <div class="flex items-center">
                            <input id="status-absent-${player.id}" name="status-${player.id}" type="radio" value="absent" class="attendance-radio h-4 w-4 text-red-600 border-gray-300 focus:ring-red-500" data-id="${player.id}" ${currentStatus === 'absent' ? 'checked' : ''}>
                            <label for="status-absent-${player.id}" class="ml-2 block text-sm text-gray-900">Absent</label>
                        </div>
                    </div>
                </div>
            </div>
            <div class="mt-6 flex flex-col space-y-2">
                <button class="add-game-btn admin-only bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md w-full" data-id="${player.id}">Ajouter Partie</button>
                <button class="manage-advance-btn admin-only bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-4 rounded-md w-full" data-id="${player.id}">Gérer les avances</button>
                <button class="view-games-btn bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md w-full" data-id="${player.id}">Voir Parties</button>
                <button class="edit-player-btn admin-only bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-md w-full mt-2" data-id="${player.id}">Modifier Joueur</button>
                <button class="delete-player-btn admin-only bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md w-full relative overflow-hidden mt-2" data-id="${player.id}">
                    <span class="relative z-10">Effacer Joueur</span>
                    <div class="delete-progress-bar"></div>
                </button>
            </div>
        `;
        playersContainer.appendChild(playerCard);
    });
    updateAttendanceCountDisplay(); // Met à jour le compteur après le rendu
}

function calculateHandicap(player) {
    if (!player || player.name?.startsWith('Dummy') || typeof player.startingHandicap === 'undefined') {
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

async function handleTogglePlayerType(playerId, newType) {
    try {
        const playerRef = doc(db, "players", playerId); 
        await updateDoc(playerRef, { playerType: newType });
    } catch (error) {
        console.error("Error toggling player type: ", error);
    }
}

async function handleUpdateAttendance(playerId, newStatus) {
    try {
        const playerRef = doc(db, "players", playerId); 
        await updateDoc(playerRef, { nextWeekStatus: newStatus });
            updateAttendanceCountDisplay(); 
    } catch (error) {
        console.error("Error updating attendance: ", error);
    }
}

// Fonction checkAndAddMockData retirée

async function handleDeletePlayer(playerId) {
    if (!playerId) return;
    try {
        const playerRef = doc(db, "players", playerId); 
        await deleteDoc(playerRef);
    } catch (error) {
        console.error("Error deleting player: ", error);
    }
}

async function handleDeleteGame(playerId, sortedGameIndex) {
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    const sortedGames = (player.games || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    const gameToDelete = sortedGames[sortedGameIndex];
    if (!gameToDelete) return;
    const updatedGames = player.games.filter(g => 
        !(g.date === gameToDelete.date && g.score === gameToDelete.score && g.cost === gameToDelete.cost)
    );
    try {
            const viewGamesModal = document.getElementById('viewGamesModal'); 
        await updateDoc(doc(db, "players", playerId), { games: updatedGames }); 
            if (viewGamesModal) {
                viewGamesModal.classList.remove('active');
            }
    } catch (error) { console.error("Error deleting game: ", error); }
}

function login() {
        const passwordModal = document.getElementById('passwordModal'); 
        const passwordError = document.getElementById('passwordError'); 
        const passwordForm = document.getElementById('passwordForm'); 
        const loginBtn = document.getElementById('loginBtn'); 
        const logoutBtn = document.getElementById('logoutBtn'); 
        if (!passwordModal || !passwordError || !passwordForm || !loginBtn || !logoutBtn) {
            console.error("Missing elements for login UI."); return;
        }
    document.body.classList.add('logged-in');
    passwordModal.classList.remove('active');
    passwordError.classList.add('hidden');
    passwordForm.reset();
    loginBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
}

function logout() {
        const loginBtn = document.getElementById('loginBtn'); 
        const logoutBtn = document.getElementById('logoutBtn'); 
        if (!loginBtn || !logoutBtn) {
            console.error("Missing elements for logout UI."); return;
        }
    document.body.classList.remove('logged-in');
    loginBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');

    // 🔥 On efface l'accès admin mémorisé
    localStorage.removeItem(ADMIN_FLAG_KEY);
}

// Fonction pour mettre à jour l'affichage du compte des présents
function updateAttendanceCountDisplay() {
    const displayElement = document.getElementById('attendanceCountDisplay');
    if (!displayElement) return;

    const presentPlayersCount = players.filter(p => {
        const defaultStatus = p.playerType === 'regular' ? 'present' : 'absent';
        const currentStatus = p.nextWeekStatus || defaultStatus;
        return currentStatus === 'present';
    }).length;

    displayElement.textContent = `Joueurs présents la semaine prochaine : ${presentPlayersCount}`;
}

// --- Fonctions pour préparer la liste et générer les équipes ---
function openPreparePlayerListModal() {
    const listElement = document.getElementById('preparedPlayerList');
    const dummyInfoElement = document.getElementById('preparedDummyInfo');
    const modalElement = document.getElementById('preparePlayerListModal');
    if (!listElement || !dummyInfoElement || !modalElement) {
        console.error("Missing elements in Prepare Player List modal."); return;
    }
    const presentPlayers = players.filter(p => {
        const defaultStatus = p.playerType === 'regular' ? 'present' : 'absent';
        const currentStatus = p.nextWeekStatus || defaultStatus;
        return currentStatus === 'present';
    });
    const presentCount = presentPlayers.length;
    const neededForMultipleOf4 = (4 - (presentCount % 4)) % 4; 
    const dummyCount = neededForMultipleOf4;
    currentPreparedList = []; 
    listElement.innerHTML = ''; 
    presentPlayers.forEach(p => {
        currentPreparedList.push({ id: p.id, name: p.name, type: 'real' }); 
        listElement.innerHTML += `<li>${p.name}</li>`;
    });
    for (let i = 0; i < dummyCount; i++) {
        const dummyId = `dummy-${i+1}`;
        const dummyName = `Dummy ${i+1}`;
        currentPreparedList.push({ id: dummyId, name: dummyName, type: 'dummy' });
        listElement.innerHTML += `<li class="text-gray-500">${dummyName}</li>`;
    }
    if (dummyCount > 0) {
        dummyInfoElement.textContent = `+ ${dummyCount} joueur(s) "Dummy" ajouté(s) pour un total de ${currentPreparedList.length}.`;
    } else {
            dummyInfoElement.textContent = `Total de ${currentPreparedList.length} joueurs présents. Aucun Dummy ajouté.`;
    }
    modalElement.classList.add('active');
}

// Fonction pour mélanger un tableau (Fisher-Yates)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Génère et affiche les équipes (avec vérification historique)
function generateAndDisplayTeams(playerList) {
    const displayModal = document.getElementById('displayTeamsModal');
    const container = document.getElementById('generatedTeamsContainer');
    if (!displayModal || !container) {
            console.error("Missing elements for displaying generated teams."); return;
    }
    
    if (!playerList || playerList.length === 0 || playerList.length % 4 !== 0) {
        container.innerHTML = '<p class="text-red-500 text-center md:col-span-2">Erreur : La liste de joueurs est invalide.</p>';
            displayModal.classList.add('active');
        return;
    }

    const forbiddenPairs = new Set();
    const currentHistory = Array.isArray(teamHistory?.history) ? teamHistory.history : [];
    const recentHistory = currentHistory.slice(-6); 
    recentHistory.forEach(game => {
            (game.teams || []).forEach(teamPairString => { 
            if (typeof teamPairString === 'string') {
                forbiddenPairs.add(teamPairString); 
            }
            });
    });

    const findLastPlayed = (pairString) => {
            const reversedHistory = [...currentHistory].reverse(); 
            for (let i = 0; i < reversedHistory.length; i++) {
                if ((reversedHistory[i].teams || []).includes(pairString)) {
                    return i + 1; 
                }
            }
            return null; 
    };

    let shuffledPlayers = shuffleArray([...playerList]);
    currentGeneratedPairs = []; 
    container.innerHTML = ''; 

    let groupIndex = 1;
    for (let i = 0; i < shuffledPlayers.length; i += 4) {
        const groupPlayers = shuffledPlayers.slice(i, i + 4);
        if (groupPlayers.length < 4) break; 

        const pair1 = [groupPlayers[0], groupPlayers[1]];
        const pair2 = [groupPlayers[2], groupPlayers[3]];
        
        const pair1IdsSortedString = [pair1[0].id, pair1[1].id].sort().join('_');
        const pair2IdsSortedString = [pair2[0].id, pair2[1].id].sort().join('_');
        currentGeneratedPairs.push(pair1IdsSortedString);
        currentGeneratedPairs.push(pair2IdsSortedString);

            const isPair1Forbidden = forbiddenPairs.has(pair1IdsSortedString);
            const pair1LastPlayed = findLastPlayed(pair1IdsSortedString);
            const isPair2Forbidden = forbiddenPairs.has(pair2IdsSortedString);
            const pair2LastPlayed = findLastPlayed(pair2IdsSortedString);

        const groupColor = groupIndex % 2 !== 0 ? 'cyan' : 'orange'; 
        let groupHTML = `<div class="bg-gray-50 rounded-lg p-4 shadow"><h3 class="text-xl font-bold text-center text-${groupColor}-700 mb-3">Groupe ${groupIndex}</h3><div class="space-y-3">`;
        
            let warning1HTML = '';
            if (isPair1Forbidden && pair1LastPlayed !== null) {
                const tooltipText = `A joué il y a ${pair1LastPlayed} partie(s)`;
                warning1HTML = `<span class="warning-tooltip text-red-500 ml-1">
                                ⚠️ (${pair1LastPlayed})
                                <span class="tooltip-text">${tooltipText}</span>
                                </span>`;
            } else if (isPair1Forbidden) { 
                warning1HTML = `<span class="warning-tooltip text-red-500 ml-1">⚠️<span class="tooltip-text">Répétition récente (6 dern.)</span></span>`;
            }
        groupHTML += `<div class="bg-white p-3 rounded-md shadow-sm border border-${groupColor}-100">
                        <h4 class="font-semibold text-gray-800 text-center mb-2 flex justify-center items-center">
                            Équipe ${String.fromCharCode(64 + (i/2 + 1))} ${warning1HTML}
                        </h4>
                        <div class="flex justify-around"><span>${pair1[0].name}</span><span class="font-bold text-${groupColor}-600">&</span><span>${pair1[1].name}</span></div>
                        </div>`;
        
            let warning2HTML = '';
            if (isPair2Forbidden && pair2LastPlayed !== null) {
                const tooltipText = `A joué il y a ${pair2LastPlayed} partie(s)`;
                warning2HTML = `<span class="warning-tooltip text-red-500 ml-1">
                                ⚠️ (${pair2LastPlayed})
                                <span class="tooltip-text">${tooltipText}</span>
                                </span>`;
            } else if (isPair2Forbidden) {
                warning2HTML = `<span class="warning-tooltip text-red-500 ml-1">⚠️<span class="tooltip-text">Répétition récente (6 dern.)</span></span>`;
            }
        groupHTML += `<div class="bg-white p-3 rounded-md shadow-sm border border-${groupColor}-100">
                        <h4 class="font-semibold text-gray-800 text-center mb-2 flex justify-center items-center">
                            Équipe ${String.fromCharCode(64 + (i/2 + 2))} ${warning2HTML}
                        </h4>
                        <div class="flex justify-around"><span>${pair2[0].name}</span><span class="font-bold text-${groupColor}-600">&</span><span>${pair2[1].name}</span></div>
                        </div>`;

        groupHTML += `</div></div>`;
        container.innerHTML += groupHTML;
        groupIndex++;
    }
        displayModal.classList.add('active');
}

// Sauvegarde la liste préparée ET génère les équipes
async function handleSaveListAndGenerateTeams() {
    if (currentPreparedList.length === 0 || currentPreparedList.length % 4 !== 0) {
        console.error("La liste préparée est vide ou n'est pas un multiple de 4.");
        alert("Erreur: Impossible de sauvegarder et générer.");
        return;
    }
    const listData = {
        createdAt: new Date().toISOString(),
        players: currentPreparedList 
    };
    const listRef = doc(db, "gameLists", 'nextGame'); 
    try {
        await setDoc(listRef, listData);
        console.log("Liste des joueurs pour la prochaine partie sauvegardée.");
        
        const prepareModal = document.getElementById('preparePlayerListModal');
        if (prepareModal) prepareModal.classList.remove('active');

        const savedListDoc = await getDoc(listRef);
        if (savedListDoc.exists()) {
            generateAndDisplayTeams(savedListDoc.data().players);
        } else {
                console.error("Impossible de récupérer la liste sauvegardée.");
                alert("Erreur lors de la récupération de la liste pour générer les équipes.");
        }

    } catch (error) {
        console.error("Erreur lors de la sauvegarde/génération: ", error);
        alert("Erreur lors de la sauvegarde/génération.");
    }
}

// Sauvegarde les équipes générées DANS L'HISTORIQUE
async function handleSaveGeneratedTeamsToHistory() {
        if (currentGeneratedPairs.length === 0 || currentGeneratedPairs.length % 2 !== 0) {
            console.error("Tentative de sauvegarde d'équipes (paires) invalides.");
            alert("Erreur: Aucune équipe valide à sauvegarder.");
            return;
    }
    const today = new Date().toISOString().split('T')[0];
    
    const newHistoryEntry = {
        date: today,
        teams: currentGeneratedPairs 
    };
        const currentHistory = Array.isArray(teamHistory?.history) ? teamHistory.history : [];
    let updatedHistory = [...currentHistory, newHistoryEntry].slice(-10); 

    try {
        const historyRef = doc(db, "settings", 'teamHistory'); 
        await setDoc(historyRef, { history: updatedHistory }, { merge: true }); 
            const displayModal = document.getElementById('displayTeamsModal'); 
            if (displayModal) {
                displayModal.classList.remove('active');
            }
            console.log("Équipes sauvegardées dans l'historique.");
    } catch (error) {
        console.error("Error saving team history: ", error);
            alert("Erreur lors de la sauvegarde de l'historique des équipes. Vérifiez la console.");
    }
}
// --- FIN Fonctions Équipes ---

// Fonction pour copier les équipes dans le presse-papiers
function copyTeamsToClipboard(fromPublicModal = false) { 
    const containerId = fromPublicModal ? 'viewTeamsContainer' : 'generatedTeamsContainer';
    const container = document.getElementById(containerId);
    
        let pairsToCopy = [];
        if (!fromPublicModal) {
            pairsToCopy = currentGeneratedPairs;
        } else {
            const teamDivs = container.querySelectorAll('.bg-white.p-3');
            if (teamDivs.length === 0 || teamDivs.length % 2 !== 0) {
                alert("Impossible de trouver les équipes à copier dans cet affichage.");
                return;
            }
            for (let i = 0; i < teamDivs.length; i++) {
                const names = teamDivs[i].querySelectorAll('.flex.justify-around span:not(.font-bold)');
                if (names.length === 2) {
                    const p1 = players.find(p => p.name === names[0].textContent) || {id: names[0].textContent, name: names[0].textContent};
                    const p2 = players.find(p => p.name === names[1].textContent) || {id: names[1].textContent, name: names[1].textContent};
                    pairsToCopy.push([p1.id, p2.id].sort().join('_'));
                }
            }
        }

    if (!container || pairsToCopy.length === 0 || pairsToCopy.length % 2 !== 0) {
        alert("Aucune équipe valide à copier.");
        return;
    }

    let tsvString = "Groupe\tÉquipe\tJoueur 1\tJoueur 2\n"; 

    let groupIndex = 1;
    for (let i = 0; i < pairsToCopy.length; i += 2) {
        const pair1String = pairsToCopy[i];
        const pair2String = pairsToCopy[i+1];
        if (!pair1String || !pair2String) continue;

        const pair1Ids = pair1String.split('_');
        const pair2Ids = pair2String.split('_');

        const p1Name = players.find(p => p.id === pair1Ids[0])?.name || pair1Ids[0].replace('dummy-', 'Dummy ');
        const p2Name = players.find(p => p.id === pair1Ids[1])?.name || pair1Ids[1].replace('dummy-', 'Dummy ');
        const p3Name = players.find(p => p.id === pair2Ids[0])?.name || pair2Ids[0].replace('dummy-', 'Dummy ');
        const p4Name = players.find(p => p.id === pair2Ids[1])?.name || pair2Ids[1].replace('dummy-', 'Dummy ');
        
        tsvString += `Groupe ${groupIndex}\tÉquipe ${String.fromCharCode(64 + (i + 1))}\t${p1Name}\t${p2Name}\n`;
        tsvString += `Groupe ${groupIndex}\tÉquipe ${String.fromCharCode(64 + (i + 2))}\t${p3Name}\t${p4Name}\n`;
        groupIndex++;
    }

    const textarea = document.createElement('textarea');
    textarea.value = tsvString;
    document.body.appendChild(textarea);
    textarea.select();
    try {
        if (!document.execCommand('copy')) {
                throw new Error('execCommand non supporté ou a échoué');
        }
        showCopyConfirmation(); 
    } catch (err) {
        console.error('Erreur lors de la copie: ', err);
            prompt("La copie automatique a échoué. Veuillez copier manuellement:", tsvString);
    }
    document.body.removeChild(textarea);
}

// Affiche le message de confirmation
function showCopyConfirmation() {
        const messageElement = document.getElementById('copyConfirmationMessage');
        if (!messageElement) return;
        messageElement.classList.add('show');
        setTimeout(() => {
            messageElement.classList.remove('show');
        }, 2000); 
}

    // Fonction pour afficher les dernières équipes sauvegardées
async function openViewTeamsModalPublic() {
        const modal = document.getElementById('viewTeamsModalPublic');
        const container = document.getElementById('viewTeamsContainer');
        const dateDisplay = document.getElementById('viewTeamsDate');
        if (!modal || !container || !dateDisplay) {
            console.error("Missing elements for viewing saved teams."); return;
        }

        const currentHistory = Array.isArray(teamHistory?.history) ? teamHistory.history : [];
        if (currentHistory.length > 0) {
            const lastTeamsEntry = currentHistory[currentHistory.length - 1];
            const lastTeamsDate = lastTeamsEntry.date ? new Date(lastTeamsEntry.date + 'T00:00:00').toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Date inconnue';
            dateDisplay.textContent = `Équipes sauvegardées le ${lastTeamsDate}`;
            
            const lastTeams = lastTeamsEntry.teams || []; 
            
            container.innerHTML = ''; 
            let groupIndex = 1;
            if (lastTeams.length === 0 || lastTeams.length % 2 !== 0) {
                container.innerHTML = '<p class="text-gray-500 text-center md:col-span-2">Format des équipes invalide dans l\'historique.</p>';
            } else {
                for(let i = 0; i < lastTeams.length; i += 2) {
                    const pair1String = lastTeams[i];
                    const pair2String = lastTeams[i+1];
                    if(!pair1String || !pair2String) continue;

                    const pair1Ids = pair1String.split('_');
                    const pair2Ids = pair2String.split('_');

                    const p1Name = players.find(p => p.id === pair1Ids[0])?.name || pair1Ids[0].replace('dummy-', 'Dummy ');
                    const p2Name = players.find(p => p.id === pair1Ids[1])?.name || pair1Ids[1].replace('dummy-', 'Dummy ');
                    const p3Name = players.find(p => p.id === pair2Ids[0])?.name || pair2Ids[0].replace('dummy-', 'Dummy ');
                    const p4Name = players.find(p => p.id === pair2Ids[1])?.name || pair2Ids[1].replace('dummy-', 'Dummy ');
                
                    const groupColor = groupIndex % 2 !== 0 ? 'cyan' : 'orange'; 
                    let groupHTML = `<div class="bg-gray-50 rounded-lg p-4 shadow"><h3 class="text-xl font-bold text-center text-${groupColor}-700 mb-3">Groupe ${groupIndex}</h3><div class="space-y-3">`;
                    groupHTML += `<div class="bg-white p-3 rounded-md shadow-sm border border-${groupColor}-100"><h4 class="font-semibold text-gray-800 text-center mb-2">Équipe ${String.fromCharCode(64 + (i + 1))}</h4><div class="flex justify-around"><span>${p1Name}</span><span class="font-bold text-${groupColor}-600">&</span><span>${p2Name}</span></div></div>`;
                    groupHTML += `<div class="bg-white p-3 rounded-md shadow-sm border border-${groupColor}-100"><h4 class="font-semibold text-gray-800 text-center mb-2">Équipe ${String.fromCharCode(64 + (i + 2))}</h4><div class="flex justify-around"><span>${p3Name}</span><span class="font-bold text-${groupColor}-600">&</span><span>${p4Name}</span></div></div>`;
                    groupHTML += `</div></div>`;
                    container.innerHTML += groupHTML;
                    groupIndex++;
                }
            }

        } else {
            dateDisplay.textContent = '';
            container.innerHTML = '<p class="text-gray-500 text-center md:col-span-2">Aucun historique d\'équipes trouvé.</p>';
        }
        modal.classList.add('active');
}


function setupEventListeners() {
        const loginBtn = document.getElementById('loginBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const addPlayerBtn = document.getElementById('addPlayerBtn');
        // checkAttendanceBtn est retiré
        const createTeamsBtn = document.getElementById('createTeamsBtn'); 
        const viewTeamsBtn = document.getElementById('viewTeamsBtn'); 
        const viewLeaderboardBtn = document.getElementById('viewLeaderboardBtn'); 
        const saveAndGenerateTeamsBtn = document.getElementById('saveAndGenerateTeamsBtn'); 
        const saveGeneratedTeamsBtn = document.getElementById('saveGeneratedTeamsBtn'); 
        const regenerateTeamsBtn = document.getElementById('regenerateTeamsBtn'); 
        const copyTeamsBtn = document.getElementById('copyTeamsBtnPublic'); 
        const passwordForm = document.getElementById('passwordForm');
        const addPlayerForm = document.getElementById('addPlayerForm');
        const editPlayerForm = document.getElementById('editPlayerForm');
        const addAdvanceForm = document.getElementById('addAdvanceForm');
        const addGameForm = document.getElementById('addGameForm');
        const gameHistoryContainer = document.getElementById('gameHistoryContainer'); 
        const openScorecardPageBtn = document.getElementById('openScorecardPageBtn');
        const uploadScorecardBtn = document.getElementById('uploadScorecardBtn');
        const backToHomeBtn = document.getElementById("backToHomeBtn");

        // Retrait de checkAttendanceBtn de la vérification
        if (!loginBtn || !logoutBtn || !addPlayerBtn || !createTeamsBtn || !viewTeamsBtn || !viewLeaderboardBtn || !saveAndGenerateTeamsBtn || !saveGeneratedTeamsBtn || !regenerateTeamsBtn || !copyTeamsBtn || !passwordForm || !addPlayerForm || !editPlayerForm || !addAdvanceForm || !addGameForm || !gameHistoryContainer || !playersContainer) {
            console.error("Erreur critique: Un ou plusieurs éléments UI principaux ou formulaires sont manquants.");
            alert("Erreur critique au démarrage.");
            return; 
        }
        if (openScorecardPageBtn) {
            openScorecardPageBtn.addEventListener('click', () => {
            // Redirige vers la page de création de fiche de pointage
            window.location.href = 'creer-fiche-pointage.html';
            });
        }
        if (uploadScorecardBtn) {
            uploadScorecardBtn.addEventListener('click', () => {
            window.location.href = 'upload-scorecard.html';
            });
        }
                if (backToHomeBtn) {
            backToHomeBtn.addEventListener('click', () => {
                // Retour à la page d'accueil
                window.location.href = 'accueil.html';
            });
        }



    loginBtn.addEventListener('click', () => {
            const passwordModal = document.getElementById('passwordModal');
            if (passwordModal) passwordModal.classList.add('active');
        });
    logoutBtn.addEventListener('click', logout);
    
    addPlayerBtn.addEventListener('click', () => {
            const addPlayerFormEl = document.getElementById('addPlayerForm');
            const addPlayerModalEl = document.getElementById('addPlayerModal');
            if (addPlayerFormEl) addPlayerFormEl.reset();
            if (addPlayerModalEl) addPlayerModalEl.classList.add('active');
    });

    // Listener pour checkAttendanceBtn retiré

    createTeamsBtn.addEventListener('click', openPreparePlayerListModal);
    
    viewTeamsBtn.addEventListener('click', openViewTeamsModalPublic);
    
    viewLeaderboardBtn.addEventListener('click', openLeaderboardModal);

    saveAndGenerateTeamsBtn.addEventListener('click', handleSaveListAndGenerateTeams);

    saveGeneratedTeamsBtn.addEventListener('click', handleSaveGeneratedTeamsToHistory);
    
        regenerateTeamsBtn.addEventListener('click', () => {
            if (currentPreparedList && currentPreparedList.length > 0) {
                generateAndDisplayTeams(currentPreparedList); 
            } else {
                // Tente de récupérer la dernière liste si currentPreparedList est vide
                const listRef = doc(db, "gameLists", 'nextGame'); 
                getDoc(listRef).then(docSnap => {
                    if (docSnap.exists() && Array.isArray(docSnap.data().players)) {
                        currentPreparedList = docSnap.data().players; 
                        generateAndDisplayTeams(currentPreparedList);
                    } else {
                        alert("Impossible de regénérer, la liste des joueurs n'a pas été sauvegardée.");
                    }
                }).catch(error => {
                    console.error("Erreur en récupérant la liste pour regénérer:", error);
                    alert("Erreur en récupérant la liste pour regénérer.");
                });
            }
        });

        copyTeamsBtn.addEventListener('click', () => copyTeamsToClipboard(true)); 


    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal') || e.target.classList.contains('modal-close-btn')) {
                modal.classList.remove('active');
            }
        });
    });

    passwordForm.addEventListener('submit', (e) => {
        e.preventDefault();
            const passwordInput = document.getElementById('password');
            const passwordErrorEl = document.getElementById('passwordError');
            if (!passwordInput || !passwordErrorEl) return;

            if (passwordInput.value === 'MGM') {
                    // On mémorise que l'utilisateur est admin
                    localStorage.setItem(ADMIN_FLAG_KEY, "true");
                    login();
                } else {
                    passwordErrorEl.classList.remove('hidden');
                }
    });

        addPlayerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const playerTypeRadio = document.querySelector('input[name="playerType"]:checked');
        const playerNameInput = document.getElementById('playerName');
        const startingHandicapInput = document.getElementById('startingHandicap');
        const emailInput = document.getElementById('playerEmail'); // NOUVEAU
        const addPlayerModalEl = document.getElementById('addPlayerModal');
        
        if (!playerTypeRadio || !playerNameInput || !startingHandicapInput || !addPlayerModalEl) {
            console.error("Missing elements in Add Player form"); 
            return;
        }

        const playerType = playerTypeRadio.value;
        const playerName = playerNameInput.value;
        const email = emailInput ? emailInput.value.trim() : "";

        const newPlayer = {
            name: playerName,
            startingHandicap: parseFloat(startingHandicapInput.value),
            playerType: playerType,
            email: email || null,     // NOUVEAU
            games: [],
            advances: []
        };

        try {
            await addDoc(collection(db, "players"), newPlayer); 
            e.target.reset();
            addPlayerModalEl.classList.remove('active');
        } catch (error) {
            console.error("Error adding player: ", error);
        }
    });


        editPlayerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const playerIdInput = document.getElementById('editPlayerId');
        const playerNameInput = document.getElementById('editPlayerName');
        const startingHandicapInput = document.getElementById('editStartingHandicap');
        const emailInput = document.getElementById('editPlayerEmail'); // NOUVEAU
        const playerTypeRadio = document.querySelector('input[name="editPlayerType"]:checked');
        const editPlayerModalEl = document.getElementById('editPlayerModal');

        if (!playerIdInput || !playerNameInput || !startingHandicapInput || !playerTypeRadio || !editPlayerModalEl) {
            console.error("Missing elements in Edit Player form");
            return;
        }

        const playerId = playerIdInput.value;
        const updatedPlayer = {
            name: playerNameInput.value,
            startingHandicap: parseFloat(startingHandicapInput.value),
            playerType: playerTypeRadio.value
        };

        if (emailInput) {
            const email = emailInput.value.trim();
            updatedPlayer.email = email || null; // NOUVEAU
        }

        try {
            const playerRef = doc(db, "players", playerId);
            await updateDoc(playerRef, updatedPlayer);
            editPlayerModalEl.classList.remove('active');
        } catch (error) {
            console.error("Error updating player: ", error);
        }
    });


    addAdvanceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
            const playerIdInput = document.getElementById('advancePlayerId');
            const amountInput = document.getElementById('advanceAmount');
            const manageAdvanceModalEl = document.getElementById('manageAdvanceModal');
            if (!playerIdInput || !amountInput || !manageAdvanceModalEl) {
                console.error("Missing elements in Add Advance form"); return;
            }
        const playerId = playerIdInput.value;
        const player = players.find(p => p.id === playerId);
        if (!player) return;
        const newAdvance = {
            date: new Date().toISOString().split('T')[0],
            amount: parseFloat(amountInput.value)
        };
        const updatedAdvances = [...(player.advances || []), newAdvance];
        try {
            await updateDoc(doc(db, "players", playerId), { advances: updatedAdvances }); 
            e.target.reset();
            manageAdvanceModalEl.classList.remove('active');
        } catch (error) { console.error("Error adding advance: ", error); }
    });

    addGameForm.addEventListener('submit', async (e) => {
        e.preventDefault();
            const playerIdInput = document.getElementById('gamePlayerId');
            const dateInput = document.getElementById('gameDate');
            const scoreInput = document.getElementById('gameScore');
            const birdiesInput = document.getElementById('gameBirdies');
            const triplesInput = document.getElementById('gameTriples');
            const costInput = document.getElementById('gameCost');
            const wagerInput = document.getElementById('gameWager');
            const addGameModalEl = document.getElementById('addGameModal');
            if (!playerIdInput || !dateInput || !scoreInput || !birdiesInput || !triplesInput || !costInput || !wagerInput || !addGameModalEl) {
                console.error("Missing elements in Add Game form"); return;
            }
        const playerId = playerIdInput.value;
        const player = players.find(p => p.id === playerId);
        if (!player) return;
        const newGame = {
            date: dateInput.value,
            score: parseInt(scoreInput.value),
            birdies: parseInt(birdiesInput.value),
            triples: parseInt(triplesInput.value),
            cost: parseFloat(costInput.value),
            wager: parseFloat(wagerInput.value)
        };
        const updatedGames = [...(player.games || []), newGame]; 
        try {
            await updateDoc(doc(db, "players", playerId), { games: updatedGames }); 
            e.target.reset();
            addGameModalEl.classList.remove('active');
        } catch (error) { console.error("Error adding game: ", error); }
    });

    playersContainer.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const playerId = target.dataset.id;
        const player = players.find(p => p.id === playerId);
        if (!player) return;
        if (target.classList.contains('add-game-btn')) openAddGameModal(playerId);
        else if (target.classList.contains('view-games-btn')) openViewGamesModal(player);
        else if (target.classList.contains('manage-advance-btn')) openManageAdvanceModal(player);
        else if (target.classList.contains('edit-player-btn')) openEditPlayerModal(player);
    });

    playersContainer.addEventListener('mousedown', handleHoldStart);
    playersContainer.addEventListener('touchstart', handleHoldStart, { passive: true });

    playersContainer.addEventListener('change', (e) => {
        const target = e.target;
        if (target.classList.contains('attendance-radio')) {
            const playerId = target.dataset.id;
            const newStatus = target.value;
            handleUpdateAttendance(playerId, newStatus);
        }
    });

    gameHistoryContainer.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-game-btn');
        if (deleteBtn) {
            const playerId = deleteBtn.dataset.playerId;
            const gameIndex = parseInt(deleteBtn.dataset.gameIndex, 10);
            handleDeleteGame(playerId, gameIndex);
        }
    });
}

// --- Fonctions Leaderboard ---
function openLeaderboardModal() {
    const modal = document.getElementById('leaderboardModal');
    const container = document.getElementById('leaderboardListContainer');
    if (!modal || !container) {
            console.error("Missing elements for leaderboard modal."); return;
    }

    const regularPlayers = players.filter(p => (p.playerType || 'regular') === 'regular');
    const playersWithWinnings = regularPlayers.map(player => {
        const totalWinnings = (player.games || []).reduce((sum, game) => sum + (game.wager || 0), 0);
        return { name: player.name, totalWinnings: totalWinnings };
    });
    playersWithWinnings.sort((a, b) => b.totalWinnings - a.totalWinnings);

    container.innerHTML = ''; 
    if (playersWithWinnings.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center">Aucun joueur régulier trouvé.</p>';
    } else {
            playersWithWinnings.forEach((player, index) => {
                const rank = index + 1;
                const winnings = player.totalWinnings.toFixed(2);
                const winningsClass = player.totalWinnings >= 0 ? 'text-green-600' : 'text-red-600';
                container.innerHTML += `
                    <div class="flex justify-between items-center p-2 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} rounded">
                        <span class="font-medium text-gray-700">${rank}. ${player.name}</span>
                        <span class="font-bold ${winningsClass}">${winnings} $</span>
                    </div>
                `;
            });
    }
    modal.classList.add('active');
}


function handleHoldStart(e) {
    const btn = e.target.closest('.delete-player-btn');
    if (!btn) return;
    e.preventDefault(); 
    const progressBar = btn.querySelector('.delete-progress-bar');
    if (progressBar) {
        progressBar.style.transition = 'width 3s linear';
        progressBar.style.width = '100%';
    }
    deleteTarget = btn; 
    deleteTimer = setTimeout(() => {
        const playerId = btn.dataset.id;
        handleDeletePlayer(playerId);
        resetDeleteButton(btn); 
    }, 3000);
    document.addEventListener('mouseup', handleHoldEnd, { once: true });
    document.addEventListener('touchend', handleHoldEnd, { once: true });
    btn.addEventListener('mouseleave', handleHoldEnd, { once: true }); 
}

function handleHoldEnd(e) {
    if (deleteTimer) {
        clearTimeout(deleteTimer);
        deleteTimer = null;
    }
    if (deleteTarget) {
        resetDeleteButton(deleteTarget);
        deleteTarget.removeEventListener('mouseleave', handleHoldEnd);
        deleteTarget = null;
    }
}

function resetDeleteButton(btn) {
    if (!btn) return;
    const progressBar = btn.querySelector('.delete-progress-bar');
    if (progressBar) {
        progressBar.style.transition = 'width 0.1s linear'; 
        progressBar.style.width = '0%';
    }
}

function openAddGameModal(playerId) {
        const addGameFormEl = document.getElementById('addGameForm');
        const gamePlayerIdInput = document.getElementById('gamePlayerId');
        const gameDateInput = document.getElementById('gameDate');
        const addGameModalEl = document.getElementById('addGameModal');
        if (!addGameFormEl || !gamePlayerIdInput || !gameDateInput || !addGameModalEl) return;
    addGameFormEl.reset();
    gamePlayerIdInput.value = playerId;
    try { 
            gameDateInput.valueAsDate = new Date();
        } catch(e) { console.warn("Could not set default date", e); }
    addGameModalEl.classList.add('active');
}

function openEditPlayerModal(player) {
    const editPlayerFormEl = document.getElementById('editPlayerForm');
    const editPlayerIdInput = document.getElementById('editPlayerId');
    const editPlayerNameInput = document.getElementById('editPlayerName');
    const editStartingHandicapInput = document.getElementById('editStartingHandicap');
    const editPlayerEmailInput = document.getElementById('editPlayerEmail'); // NOUVEAU
    const editPlayerModalEl = document.getElementById('editPlayerModal');

    if (!editPlayerFormEl || !editPlayerIdInput || !editPlayerNameInput || !editStartingHandicapInput || !editPlayerModalEl) return;

    editPlayerFormEl.reset();
    editPlayerIdInput.value = player.id;
    editPlayerNameInput.value = player.name;
    editStartingHandicapInput.value = player.startingHandicap;

    if (editPlayerEmailInput) {
        editPlayerEmailInput.value = player.email || "";
    }

    const playerType = player.playerType || 'regular';
    const radioToCheck = document.querySelector(`input[name="editPlayerType"][value="${playerType}"]`);
    if (radioToCheck) radioToCheck.checked = true;

    editPlayerModalEl.classList.add('active');
}

function openManageAdvanceModal(player) {
        const addAdvanceFormEl = document.getElementById('addAdvanceForm');
        const advancePlayerIdInput = document.getElementById('advancePlayerId');
        const advancePlayerNameSpan = document.getElementById('advancePlayerName');
        const manageAdvanceModalEl = document.getElementById('manageAdvanceModal');
        if (!addAdvanceFormEl || !advancePlayerIdInput || !advancePlayerNameSpan || !manageAdvanceModalEl) return;
    addAdvanceFormEl.reset();
    advancePlayerIdInput.value = player.id;
    advancePlayerNameSpan.textContent = player.name;
    manageAdvanceModalEl.classList.add('active');
}

function openViewGamesModal(player) {
        const container = document.getElementById('gameHistoryContainer');
        const historyPlayerNameSpan = document.getElementById('historyPlayerName');
        const historyPlayerHandicapSpan = document.getElementById('historyPlayerHandicap');
        const viewGamesModalEl = document.getElementById('viewGamesModal');
        if (!container || !historyPlayerNameSpan || !historyPlayerHandicapSpan || !viewGamesModalEl) return;
    historyPlayerNameSpan.textContent = player.name;
    historyPlayerHandicapSpan.textContent = player.startingHandicap.toFixed(1);
    const games = (player.games || []).sort((a,b) => new Date(b.date) - new Date(a.date));
    if (games.length === 0) {
        container.innerHTML = '<p>Aucune partie enregistrée.</p>';
        viewGamesModalEl.classList.add('active');
        return;
    }
    let scoresToHighlight = new Set();
    if (games.length >= 6) {
        const gamesSortedByDateAsc = (player.games || []).sort((a,b) => new Date(a.date) - new Date(b.date));
        const relevantGames = gamesSortedByDateAsc.length > 10 ? gamesSortedByDateAsc.slice(-10) : gamesSortedByDateAsc;
        const best5 = [...relevantGames].sort((a,b)=>a.score-b.score).slice(0,5); 
        scoresToHighlight = new Set(best5.map(g => `${g.date}-${g.score}-${g.birdies}`));
    }
    container.innerHTML = games.map((game, index) => {
        const isHighlighted = scoresToHighlight.has(`${game.date}-${game.score}-${game.birdies}`);
        const highlightClass = isHighlighted ? 'bg-green-100 border-l-4 border-green-500' : 'bg-gray-50';
        const wagerClass = (game.wager || 0) >= 0 ? 'text-green-600' : 'text-red-500';
            let formattedDate = game.date; 
            try {
                formattedDate = new Date(game.date + 'T00:00:00').toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
            } catch (e) { console.warn("Invalid date format encountered:", game.date); }
        return `
            <div class="p-3 rounded-md mb-2 ${highlightClass} grid grid-cols-6 gap-2 items-center text-sm">
                <div class="font-semibold col-span-2">${formattedDate}</div>
                <div><span class="font-medium">Score:</span> ${game.score > 0 ? '+' : ''}${game.score}</div>
                <div><span class="font-medium">Coût:</span> ${(game.cost || 0).toFixed(2)}$</div>
                <div class="text-right font-bold ${wagerClass}">${(game.wager || 0).toFixed(2)} $</div>
                <div class="text-right">
                    <button class="delete-game-btn admin-only text-red-500 hover:text-red-700 font-bold px-2" data-player-id="${player.id}" data-game-index="${index}">X</button>
                </div>
            </div>
        `;
    }).join('');
    viewGamesModalEl.classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
    initializeFirebase();

    // Si l'utilisateur a déjà validé le mot de passe (depuis accueil.html ou ici),
    // on le met directement en mode admin.
    try {
        if (localStorage.getItem(ADMIN_FLAG_KEY) === "true") {
            login();
        }
    } catch (e) {
        console.warn("Impossible de lire localStorage pour l'admin :", e);
    }
});


