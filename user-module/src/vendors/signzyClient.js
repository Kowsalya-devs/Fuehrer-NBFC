// src/vendors/signzyClient.js
// eSign via Signzy API
// Set SIGNZY_API_KEY and SIGNZY_BASE_URL in .env to activate

const logger = require('../utils/logger');

const initiateEsign = async ({ userId, documentId }) => {
    if (process.env.NODE_ENV !== 'production' || !process.env.SIGNZY_API_KEY) {
        logger.info({ message: 'Signzy eSign (stub)', userId, documentId });
        return {
            success:     true,
            eSignStatus: 'SIGNED',
            vendor:      'Signzy Stub',
            userId,
            documentId,
            signedAt:    new Date().toISOString(),
        };
    }

    const baseUrl = process.env.SIGNZY_BASE_URL ?? 'https://api.signzy.com';

    const res = await fetch(`${baseUrl}/api/v3/esign/initiate`, {
        method:  'POST',
        headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${process.env.SIGNZY_API_KEY}`,
        },
        body: JSON.stringify({ userId, documentId }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
        logger.error({ message: 'Signzy eSign failed', response: data });
        return { success: false, vendor: 'Signzy' };
    }

    return {
        success:     true,
        eSignStatus: 'SIGNED',
        vendor:      'Signzy',
        userId,
        documentId,
        signedAt:    new Date().toISOString(),
    };
};

module.exports = { initiateEsign };