const bcrypt = require('bcrypt');
const crypto = require('crypto');
const prisma = require('../config/prismaClient');
const AppError = require('../utils/appError');
const logger = require('../utils/logger');
const { OTP_EXPIRY_MINUTES, OTP_LENGTH } = require('../utils/constants');

// ─── OTP generation ───────────────────────────────────────────────────────────
// Uses crypto.randomInt — cryptographically secure, not Math.random()

const generatePlainOtp = () => {
    const min = 10 ** (OTP_LENGTH - 1);
    const max = (10 ** OTP_LENGTH) - 1;
    return String(crypto.randomInt(min, max + 1));
};

// ─── SMS dispatch ─────────────────────────────────────────────────────────────
// MSG91 is primary (DLT registered for India)
// Falls back to console log in development

const sendOtpSms = async (phone, otp) => {
    // Development — log to console, never call SMS API
    if (process.env.NODE_ENV !== 'production') {
        console.log(`\n🔑 OTP for ${phone}: ${otp}\n`);
        return;
    }

    const authKey  = process.env.MSG91_AUTH_KEY;
    const templateId = process.env.MSG91_OTP_TEMPLATE_ID;

    if (!authKey || !templateId) {
        logger.error('MSG91 credentials missing — OTP not sent');
        throw new AppError('SMS service not configured.', 500);
    }

    const res = await fetch('https://api.msg91.com/api/v5/otp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            template_id: templateId,
            mobile:      `91${phone.replace(/^\+91/, '')}`,
            authkey:     authKey,
            otp,
        }),
    });

    const data = await res.json();

    if (data.type !== 'success') {
        logger.error({ message: 'MSG91 OTP send failed', phone, response: data });
        throw new AppError('Failed to send OTP. Please try again.', 500);
    }

    logger.info({ message: 'OTP sent via MSG91', phone });
};

// ─── Issue OTP ────────────────────────────────────────────────────────────────

const issueOtp = async (phone) => {
    const plainOtp  = generatePlainOtp();
    const hashedOtp = await bcrypt.hash(plainOtp, 10);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Invalidate any existing unused OTPs for this phone
    await prisma.$transaction([
        prisma.otpVerification.updateMany({
            where:  { phone, isUsed: false },
            data:   { isUsed: true },
        }),
        prisma.otpVerification.create({
            data: { phone, otp: hashedOtp, expiresAt },
        }),
    ]);

    // Send OTP via SMS (logs to console in dev)
    await sendOtpSms(phone, plainOtp);

    logger.info({ message: 'OTP issued', phone, expiresAt });

    return {
        phone,
        expiresAt,
        // Never expose OTP in production response
        otp: process.env.NODE_ENV === 'production' ? undefined : plainOtp,
    };
};

// ─── Consume OTP ──────────────────────────────────────────────────────────────

const consumeOtp = async (phone, plainOtp) => {
    const otpRecord = await prisma.otpVerification.findFirst({
        where:   { phone, isUsed: false },
        orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
        throw new AppError('OTP not found. Please request a new OTP.', 400);
    }

    if (otpRecord.expiresAt < new Date()) {
        await prisma.otpVerification.update({
            where: { id: otpRecord.id },
            data:  { isUsed: true },
        });
        throw new AppError('OTP has expired. Please request a new OTP.', 400);
    }

    const isMatch = await bcrypt.compare(String(plainOtp), otpRecord.otp);

    if (!isMatch) {
        throw new AppError('Invalid OTP.', 400);
    }

    await prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data:  { isUsed: true },
    });

    return otpRecord;
};

module.exports = { issueOtp, consumeOtp };