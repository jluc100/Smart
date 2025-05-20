const express = require('express');
const bodyParser = require('body-parser');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const languages = {
    en: {
        welcome: `CON Welcome to SmartCourier\n1. English\n2. Kinyarwanda`,
        main: `CON Main Menu:\n1. Request Pickup\n2. Track Package\n3. Help\n0. Back`,
        help: `END For support, call 1234 or visit smartcourier.com`,
        invalid: `END Invalid option`,
        askPickup: `CON Enter Pickup Location:`,
        askDestination: `CON Enter Destination Location:`,
        confirmed: `END Pickup from [FROM] to [TO] confirmed. Thank you!`
    },
    rw: {
        welcome: `CON Murakaza neza kuri SmartCourier\n1. Icyongereza\n2. Ikinyarwanda`,
        main: `CON Menyu Nyamukuru:\n1. Saba Gutwara Ipaki\n2. Kurikirana Ipaki\n3. Ubufasha\n0. Subira Inyuma`,
        help: `END Kubufasha, hamagara 1234 cyangwa usure smartcourier.com`,
        invalid: `END Igisubizo ntigihari`,
        askPickup: `CON Andika aho ipaki izaturuka:`,
        askDestination: `CON Andika aho ipaki ijya:`,
        confirmed: `END Gutwara ipaki kuva [FROM] ujya [TO] byemejwe. Murakoze!`
    }
};

// Track user sessions and input state in memory
const sessionStates = {};

app.post('/ussd', async (req, res) => {
    const { sessionId, phoneNumber, text } = req.body;
    const inputs = text.split('*');
    const level = inputs.length;
    let response = '';

    // Get or set default language
    let lang = sessionStates[sessionId]?.language || 'en';

    try {
        await pool.query(
            `INSERT INTO sessions (sessionID, phoneNumber, userInput, timestamp)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (sessionID) DO UPDATE SET userInput = $3, timestamp = NOW()`,
            [sessionId, phoneNumber, text]
        );
    } catch (err) {
        console.error('Session DB Error:', err.message);
    }

    // === MENU FLOW ===
    if (text === '') {
        response = languages.en.welcome; // Default mix language
        sessionStates[sessionId] = { level: 1 };
    } else if (level === 1 && (inputs[0] === '1' || inputs[0] === '2')) {
        lang = inputs[0] === '1' ? 'en' : 'rw';
        sessionStates[sessionId] = { language: lang, level: 2 };
        response = languages[lang].main;
    } else if (level === 2) {
        const option = inputs[1];
        lang = sessionStates[sessionId]?.language || 'en';

        if (option === '1') {
            response = languages[lang].askPickup;
            sessionStates[sessionId].level = 3;
        } else if (option === '2') {
            response = languages[lang].track;
        } else if (option === '3') {
            response = languages[lang].help;
        } else if (option === '0') {
            response = languages[lang].main;
        } else {
            response = languages[lang].invalid;
        }
    } else if (level === 3) {
        // User entered pickup location
        sessionStates[sessionId].pickup = inputs[2];
        sessionStates[sessionId].level = 4;
        response = languages[lang].askDestination;
    } else if (level === 4) {
        // User entered destination
        const pickup = sessionStates[sessionId].pickup;
        const destination = inputs[3];

        // Store to DB
        try {
            await pool.query(
                `INSERT INTO transactions (sessionID, phoneNumber, action, pickup, destination, timestamp)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [sessionId, phoneNumber, 'pickup_request', pickup, destination]
            );
        } catch (err) {
            console.error('Transaction DB Error:', err.message);
        }

        // Confirmation
        const confirmMsg = languages[lang].confirmed
            .replace('[FROM]', pickup)
            .replace('[TO]', destination);
        response = confirmMsg;

        // Clear session
        delete sessionStates[sessionId];
    } else {
        response = `END Invalid input`;
    }

    res.set('Content-Type', 'text/plain');
    res.send(response);
});

app.listen(3000, () => {
    console.log('✅ SmartCourier USSD running at http://localhost:3000/ussd');
});
