const { body, param } = require('express-validator');
const { sanitizePhoneInput } = require('../utils/phoneUtils');

const phoneValidation = body('phone')
  .customSanitizer(sanitizePhoneInput)
  .notEmpty()
  .withMessage('Phone is required.')
  .isLength({ min: 10, max: 15 })
  .withMessage('Phone number must be between 10 and 15 digits.');

const registerValidation = [
    phoneValidation,
    body('role')
        .optional()
        .isIn(['CUSTOMER', 'AGENT'])
        .withMessage('Role must be CUSTOMER or AGENT.'),
];

const sendOtpValidation = [phoneValidation];

const verifyOtpValidation = [
  phoneValidation,
  body('otp')
    .trim()
    .notEmpty()
    .withMessage('OTP is required.')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be a 6-digit number.')
    .isNumeric()
    .withMessage('OTP must contain only digits.'),
];

const loginValidation = [phoneValidation];

const profileUpdateValidation = [
  body('name')
    .optional({ nullable: true })
    .customSanitizer((value) => {
      if (value === undefined || value === null) {
        return value;
      }

      const trimmed = String(value).trim();
      return trimmed === '' ? null : trimmed;
    })
    .custom((value) => value === null || (typeof value === 'string' && value.length >= 2))
    .withMessage('Name must be at least 2 characters long.'),
  body('email')
    .optional({ nullable: true })
    .customSanitizer((value) => {
      if (value === undefined || value === null) {
        return value;
      }

      const trimmed = String(value).trim();
      return trimmed === '' ? null : trimmed.toLowerCase();
    })
    .custom((value) => value === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    .withMessage('A valid email address is required.'),
  body().custom((value, { req }) => {
    if (typeof req.body.name === 'undefined' && typeof req.body.email === 'undefined') {
      throw new Error('At least one of name or email must be provided.');
    }

    return true;
  }),
];

const userIdValidation = [
  param('userId').isUUID().withMessage('userId must be a valid UUID.'),
];

module.exports = {
  registerValidation,
  sendOtpValidation,
  verifyOtpValidation,
  loginValidation,
  profileUpdateValidation,
  userIdValidation,
};
