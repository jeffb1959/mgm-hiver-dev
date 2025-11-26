// netlify/functions/sendAbsence.js

const sgMail = require("@sendgrid/mail");

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

exports.handler = async (event) => {
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

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch (err) {
    console.error("JSON invalide reçu dans sendAbsence:", err);
    return {
      statusCode: 400,
      body: "Corps de requête invalide (JSON).",
    };
  }

  const {
    playerName = "Un joueur",
    playerType = "regular",
    nextProgramDate = "",
    recipients = [],
  } = data;

  // Sécurité : pas de destinataires → on ne tente rien
  if (!Array.isArray(recipients) || recipients.length === 0) {
    console.warn("Aucun destinataire dans sendAbsence, email non envoyé.");
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, info: "no recipients" }),
    };
  }

  const dateTexte = nextProgramDate || "la prochaine partie";
  const subject = `Place disponible - MGM ${dateTexte}`;

  const text = `Il y a une place de disponible avec les MGM ce mercredi (${dateTexte}). 
Si vous êtes intéressé, veuillez vous inscrire à cette adresse : https://mgmlorette.ca/presence.html`;

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 16px;">
      <h2 style="color:#166534;">Place disponible - Ligue MGM</h2>
      <p>
        Il y a une place de disponible avec les <strong>MGM</strong> ce mercredi
        <strong>${dateTexte}</strong>.
      </p>
      <p style="margin-top: 12px;">
        Si vous êtes intéressé, veuillez vous inscrire à cette adresse :
      </p>
      <p style="margin-top: 8px;">
        <a href="https://mgmlorette.ca/presence.html" style="color:#2563eb;font-weight:bold;">
          https://mgmlorette.ca/presence.html
        </a>
      </p>
      <hr style="margin-top:20px;margin-bottom:12px;"/>
      <p style="font-size:12px;color:#555;">
        Joueur absent : <strong>${playerName}</strong> (${playerType}).
      </p>
      <p style="font-size:11px;color:#999;">
        Ce message a été généré automatiquement par le système MGM.
      </p>
    </div>
  `;

  // 🟢 À adapter avec TON expéditeur vérifié SendGrid
  const msg = {
    to: recipients, // tous les remplaçants
    from: "jeff.b@videotron.ca",
    subject,
    text,
    html,
  };

  try {
    await sgMail.send(msg);
    console.log(
      `Email sendAbsence envoyé à ${recipients.length} remplaçants pour ${playerName}`
    );

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
