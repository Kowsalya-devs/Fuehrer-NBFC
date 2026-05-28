const rateLimit = require('express-rate-limit');
const { sanitizePhoneInput } = require('../utils/phoneUtils');

const otpRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const phone = sanitizePhoneInput(req.body && req.body.phone);
    return `${req.ip}:${phone || 'unknown'}`;
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many OTP requests. Please try again after 10 minutes.',
    });
  },
});

module.exports = otpRateLimiter;
