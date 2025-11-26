// netlify/functions/sendAbsence.js
// Fonction serverless Netlify pour envoyer un email via SendGrid
// quand un joueur régulier signale son absence pour la prochaine partie.

const sgMail = require("@sendgrid/mail");

// Clé API stockée dans Netlify → Environment variable SENDGRID_API_KEY
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

exports.handler = async (event) => {
  // Autoriser uniquement POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  if (!SENDGRID_API_KEY) {
    console.error("SENDGRID_API_KEY manquante dans Netlify.");
    return {
      statusCode: 500,
      body: "Erreur de configuration serveur (clé API absente).",
    };
  }

  sgMail.setApiKey(SENDGRID_API_KEY);

  // Récupérer les données envoyées depuis presence.js
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    console.error("JSON invalide reçu dans sendAbsence:", err);
    return {
      statusCode: 400,
      body: "Corps de requête invalide (JSON).",
    };
  }

  const {
    playerName = "Un joueur",
    playerId = "",
    playerType = "",
    nextProgramDate = "",
  } = payload;

  const dateTexte = nextProgramDate || "la prochaine partie";
  const sujet = `Absence signalée : ${playerName}`;
  const texte = `${playerName} a signalé son absence pour la partie du ${dateTexte}.`;
  const html = `
    <p><strong>${playerName}</strong> a signalé son absence pour la partie du <strong>${dateTexte}</strong>.</p>
    <p>Type de joueur : ${playerType || "inconnu"}</p>
    <p>ID joueur : ${playerId}</p>
  `;

  // 🟢 À PERSONNALISER : destinataires et expéditeur
  const msg = {
    // Liste des destinataires (admin + éventuellement liste de remplaçants)
    to: [
      "jf.bouchard@multifab.ca", // Admin principal
    
      // "autre_destinataire@exemple.com"
    ],

    // Adresse 'from' = celle que TU AS VÉRIFIÉE dans SendGrid (Single Sender)
    from: "jeff.b@videotron.ca",

    subject: sujet,
    text: texte,
    html: html,
  };

  try {
    await sgMail.send(msg);
    console.log("Email sendAbsence envoyé avec succès pour", playerName);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    };
  } catch (error) {
    console.error("Erreur SendGrid:", error);
    if (error.response) {
      console.error("Détails SendGrid:", error.response.body);
    }

    return {
      statusCode: 500,
      body: "Erreur lors de l'envoi du courriel.",
    };
  }
};
