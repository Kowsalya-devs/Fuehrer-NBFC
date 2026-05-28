// src/jobs/cleanupBlacklist.js
//
// Deletes expired tokens from the token_blacklist table.
//
// Without this the table grows forever — every logout adds a row
// and nothing ever removes them. On a high-traffic app this slows
// down every authenticated request because authMiddleware queries
// this table on every single API call.
//
// Runs every hour. Only deletes tokens where expiresAt is in the past
// — expired tokens can no longer be used anyway so it's safe to delete.

const prisma = require('../config/prismaClient');
const logger = require('../utils/logger');

const cleanupExpiredTokens = async () => {
    try {
        const result = await prisma.tokenBlacklist.deleteMany({
            where: {
                expiresAt: {
                    lt: new Date(),
                },
            },
        });

        if (result.count > 0) {
            logger.info({
                message: 'Token blacklist cleanup completed',
                deletedCount: result.count,
            });
        }
    } catch (err) {
        logger.error({
            message: 'Token blacklist cleanup failed',
            error: err.message,
        });
    }
};

// Also clean up expired OTPs while we're at it —
// same problem, same solution
const cleanupExpiredOtps = async () => {
    try {
        const result = await prisma.otpVerification.deleteMany({
            where: {
                OR: [
                    { expiresAt: { lt: new Date() } },
                    { isUsed: true, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
                ],
            },
        });

        if (result.count > 0) {
            logger.info({
                message: 'Expired OTP cleanup completed',
                deletedCount: result.count,
            });
        }
    } catch (err) {
        logger.error({
            message: 'Expired OTP cleanup failed',
            error: err.message,
        });
    }
};

const runCleanup = async () => {
    await Promise.all([
        cleanupExpiredTokens(),
        cleanupExpiredOtps(),
    ]);
};

// Run immediately on startup then every hour
const startCleanupJob = () => {
    runCleanup();
    setInterval(runCleanup, 60 * 60 * 1000);
    logger.info({ message: 'Token blacklist cleanup job started — runs every hour' });
};

module.exports = { startCleanupJob };