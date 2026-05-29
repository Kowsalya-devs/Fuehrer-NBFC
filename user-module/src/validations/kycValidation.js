const { body } = require('express-validator');

const verifyPanValidation = [
  body('panNumber')
    .trim()
    .notEmpty()
    .withMessage('PAN number is required.')
    .customSanitizer((value) => String(value).trim().toUpperCase())
    .matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/)
    .withMessage('PAN number format is invalid.'),
];

const verifyAadhaarValidation = [
  body('aadhaarNumber')
    .customSanitizer((value) => String(value || '').replace(/\D/g, ''))
    .notEmpty()
    .withMessage('Aadhaar number is required.')
    .isLength({ min: 12, max: 12 })
    .withMessage('Aadhaar number must be 12 digits.'),
];

const verifySelfieValidation = [
  body().custom((value, { req }) => {
    if (!req.body.selfieImage && !req.body.selfieData) {
      throw new Error('Selfie image payload is required.');
    }

    return true;
  }),
];

const eSignValidation = [
  body('documentId')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('documentId must be between 3 and 100 characters long.'),
];

const eNachValidation = [
  body('accountNumber')
    .customSanitizer((value) => String(value || '').replace(/\D/g, ''))
    .notEmpty()
    .withMessage('Account number is required.')
    .isLength({ min: 9, max: 18 })
    .withMessage('Account number must be between 9 and 18 digits.'),
  body('ifscCode')
    .trim()
    .toUpperCase()
    .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
    .withMessage('IFSC code format is invalid.'),
  body('accountHolderName')
    .trim()
    .notEmpty()
    .withMessage('Account holder name is required.')
    .isLength({ min: 2, max: 100 })
    .withMessage('Account holder name must be between 2 and 100 characters long.'),
  body('bankName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Bank name must be between 2 and 100 characters long.'),
];

module.exports = {
  verifyPanValidation,
  verifyAadhaarValidation,
  verifySelfieValidation,
  eSignValidation,
  eNachValidation,
};
