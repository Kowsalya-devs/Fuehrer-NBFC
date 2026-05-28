// src/vendors/karzaClient.js
// PAN verification via Karza API
// Set KARZA_API_KEY in .env to activate production mode

const logger = require('../utils/logger');

const verifyPan = async (panNumber) => {
    if (process.env.NODE_ENV !== 'production' || !process.env.KARZA_API_KEY) {
        logger.info({ message: 'Karza PAN verify (stub)', panNumber: panNumber.slice(-4) });
        return {
            success:  true,
            name:     'Mock User Name',
            panValid: true,
            vendor:   'Karza Stub',
        };
    }

    const res = await fetch('https://api.karza.in/v2/pan-verify', {
        method:  'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-karza-key':  process.env.KARZA_API_KEY,
        },
        body: JSON.stringify({ pan: panNumber, consent: 'Y' }),
    });

    const data = await res.json();

    if (!res.ok || data.statusCode !== 101) {
        logger.error({ message: 'Karza PAN verify failed', response: data });
        return { success: false, vendor: 'Karza' };
    }

    return {
        success:  true,
        name:     data.result?.name ?? null,
        panValid: true,
        vendor:   'Karza',
    };
};

module.exports = { verifyPan };