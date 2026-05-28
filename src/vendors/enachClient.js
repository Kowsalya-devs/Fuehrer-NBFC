// src/vendors/enachClient.js
// eNACH mandate registration
// Set ENACH_API_KEY and ENACH_BASE_URL in .env to activate

const logger = require('../utils/logger');

const registerMandate = async ({ accountNumber, ifscCode, accountHolderName, bankName }) => {
    if (process.env.NODE_ENV !== 'production' || !process.env.ENACH_API_KEY) {
        logger.info({ message: 'eNACH register mandate (stub)', accountLast4: String(accountNumber).slice(-4) });
        return {
            success:            true,
            mandateId:          `ENACH-${Date.now()}`,
            status:             'ACTIVE',
            vendor:             'eNACH Stub',
            accountNumberLast4: String(accountNumber).slice(-4),
            ifscCode,
            accountHolderName,
            bankName:           bankName ?? null,
        };
    }

    const baseUrl = process.env.ENACH_BASE_URL ?? 'https://api.enach.com';

    const res = await fetch(`${baseUrl}/v1/mandate/register`, {
        method:  'POST',
        headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${process.env.ENACH_API_KEY}`,
        },
        body: JSON.stringify({
            accountNumber,
            ifscCode,
            accountHolderName,
            bankName,
        }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
        logger.error({ message: 'eNACH mandate registration failed', response: data });
        return { success: false, vendor: 'eNACH' };
    }

    return {
        success:            true,
        mandateId:          data.mandateId,
        status:             data.status ?? 'PENDING',
        vendor:             'eNACH',
        accountNumberLast4: String(accountNumber).slice(-4),
        ifscCode,
        accountHolderName,
        bankName:           bankName ?? null,
    };
};

module.exports = { registerMandate };