// src/vendors/hypervergeClient.js
// Aadhaar and selfie verification via HyperVerge API
// Set HYPERVERGE_APP_ID and HYPERVERGE_APP_KEY in .env to activate

const logger = require('../utils/logger');

const getToken = async () => {
    const res = await fetch('https://auth.hyperverge.co/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            appId:  process.env.HYPERVERGE_APP_ID,
            appKey: process.env.HYPERVERGE_APP_KEY,
        }),
    });
    const data = await res.json();
    return data.result?.token;
};

const verifyAadhaar = async (aadhaarNumber) => {
    if (process.env.NODE_ENV !== 'production' || !process.env.HYPERVERGE_APP_ID) {
        logger.info({ message: 'HyperVerge Aadhaar verify (stub)' });
        return {
            success:  true,
            verified: true,
            vendor:   'HyperVerge Stub',
        };
    }

    const token = await getToken();

    const res = await fetch('https://ind.hyperverge.co/v1/aadhaar/verify', {
        method:  'POST',
        headers: {
            'Content-Type':  'application/json',
            'Authorization': token,
        },
        body: JSON.stringify({ aadhaarNumber }),
    });

    const data = await res.json();

    if (!res.ok || data.status !== 'success') {
        logger.error({ message: 'HyperVerge Aadhaar verify failed', response: data });
        return { success: false, vendor: 'HyperVerge' };
    }

    return {
        success:  true,
        verified: true,
        vendor:   'HyperVerge',
    };
};

const verifySelfie = async (selfieImage) => {
    if (process.env.NODE_ENV !== 'production' || !process.env.HYPERVERGE_APP_ID) {
        logger.info({ message: 'HyperVerge selfie verify (stub)' });
        return {
            success:         true,
            verified:        true,
            matchPercentage: 98,
            vendor:          'HyperVerge Stub',
        };
    }

    const token = await getToken();

    const res = await fetch('https://ind.hyperverge.co/v1/face/verify', {
        method:  'POST',
        headers: {
            'Content-Type':  'application/json',
            'Authorization': token,
        },
        body: JSON.stringify({ selfieImage }),
    });

    const data = await res.json();

    if (!res.ok || data.status !== 'success') {
        logger.error({ message: 'HyperVerge selfie verify failed', response: data });
        return { success: false, vendor: 'HyperVerge' };
    }

    return {
        success:         true,
        verified:        true,
        matchPercentage: data.result?.match ?? 0,
        vendor:          'HyperVerge',
    };
};

module.exports = { verifyAadhaar, verifySelfie };