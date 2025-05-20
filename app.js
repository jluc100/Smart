const express = require('express');
const bodyParser = require('body-parser');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Language data
const languages = {
    en: {
        welcome: `CON Welcome to SmartCourier\n1. English\n2. Kinyarwanda`,
        main: `CON Main Menu:\n1. Request Pickup\n2. Track Package\n3. Help\n0. Back`,
        help: `END For support, call 1234 or visit smartcourier.com`,
        invalid: `END Invalid option`,
    },
    rw: {
        welcome: `CON Murakaza neza kuri SmartCourier\n1. Icyongereza\n2. Ikinyarwanda`,
        main: `CON Menyu Nyamukuru:\n1. Saba Gutwara Ipaki\n2. Kurikirana Ipaki\n3. Ubufasha\n0. Subira Inyuma`,
        help: `END Kubufasha, hamagara 1234 cyangwa usure smartcourier.com`,
        invalid: `END Igisubizo ntigihari`,
    }
};

// Store language by session ID
const sessionLanguages = {};

app.post('/ussd', async (req, res) => {
    const { sessionId, phoneNumber, text } = req.body;
    const inputs = text.split('*');
    let response = '';
    const level = inputs.length;

    // Store session in DB
    try {
        await pool.query(
            'INSERT INTO sessions (sessionID, phoneNumber, userInput) VALUES ($1, $2, $3) ON CONFLICT (sessionID) DO UPDATE SET userInput = $3',
            [sessionId, phoneNumber, text]
        );
    } catch (err) {
        console.error(err);
    }

    // Language selection
    if (text === '') {
        response = `CON Welcome / Murakaza neza\n1. English\n2. Kinyarwanda`;
    } else if (level === 1 && (text === '1' || text === '2')) {
        const lang = text === '1' ? 'en' : 'rw';
        sessionLanguages[sessionId] = lang;
        response = languages[lang].main;
    } else if (level === 2) {
        const lang = sessionLanguages[sessionId] || 'en';
        const option = inputs[1];

        if (option === '1') {
            response = `END [${lang.toUpperCase()}] Pickup request in progress...`;
        } else if (option === '2') {
            response = `END [${lang.toUpperCase()}] Package is in transit`;
        } else if (option === '3') {
            response = languages[lang].help;
        } else if (option === '0') {
            response = languages[lang].welcome;
        } else {
            response = languages[lang].invalid;
        }

        // Log action
        try {
            await pool.query(
                'INSERT INTO transactions (sessionID, phoneNumber, action) VALUES ($1, $2, $3)',
                [sessionId, phoneNumber, text]
            );
        } catch (err) {
            console.error(err);
        }
    } else {
        response = `END Invalid input`;
    }

    res.set('Content-Type', 'text/plain');
    res.send(response);
});

app.listen(3000, () => {
    console.log('SmartCourier USSD running on http://localhost:3000/ussd');
});
