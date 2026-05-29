const express = require('express');
const router = express.Router();
const kycController = require('../controllers/kycController');
const authMiddleware = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const {
  verifyPanValidation,
  verifyAadhaarValidation,
  verifySelfieValidation,
  eSignValidation,
  eNachValidation,
} = require('../validations/kycValidation');

router.use(authMiddleware);

router.post('/verify-pan', validateRequest(verifyPanValidation), kycController.verifyPan);
router.post('/verify-aadhaar', validateRequest(verifyAadhaarValidation), kycController.verifyAadhaar);
router.post('/verify-selfie', validateRequest(verifySelfieValidation), kycController.verifySelfie);
router.get('/status', kycController.getStatus);
router.post('/esign', validateRequest(eSignValidation), kycController.eSign);
router.post('/enach', validateRequest(eNachValidation), kycController.registerEnach);
router.get('/enach/status', kycController.getEnachStatus);

module.exports = router;
