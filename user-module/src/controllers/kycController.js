const kycService = require('../services/kycService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

const verifyPan = asyncHandler(async (req, res) => {
  const { panNumber } = req.body;
  const result = await kycService.verifyPan(req.user.userId, panNumber);

  sendSuccess(res, {
    message: 'PAN verified successfully.',
    data: result,
  });
});

const verifyAadhaar = asyncHandler(async (req, res) => {
  const { aadhaarNumber } = req.body;
  const result = await kycService.verifyAadhaar(req.user.userId, aadhaarNumber);

  sendSuccess(res, {
    message: 'Aadhaar verified successfully.',
    data: result,
  });
});

const verifySelfie = asyncHandler(async (req, res) => {
  const selfiePayload = req.body.selfieImage || req.body.selfieData;
  const result = await kycService.verifySelfie(req.user.userId, selfiePayload);

  sendSuccess(res, {
    message: 'Selfie verified successfully.',
    data: result,
  });
});

const getStatus = asyncHandler(async (req, res) => {
  const result = await kycService.getKycStatus(req.user.userId);

  sendSuccess(res, {
    message: 'KYC status fetched successfully.',
    data: result,
  });
});

const eSign = asyncHandler(async (req, res) => {
  const { documentId } = req.body;
  const result = await kycService.esignLoanAgreement(req.user.userId, documentId);

  sendSuccess(res, {
    message: 'eSign completed successfully.',
    data: result,
  });
});

const registerEnach = asyncHandler(async (req, res) => {
  const result = await kycService.registerEnach(req.user.userId, req.body);

  sendSuccess(res, {
    message: 'eNACH mandate registered successfully.',
    data: result,
  });
});

const getEnachStatus = asyncHandler(async (req, res) => {
  const result = await kycService.getEnachStatus(req.user.userId);

  sendSuccess(res, {
    message: 'eNACH status fetched successfully.',
    data: result,
  });
});

module.exports = {
  verifyPan,
  verifyAadhaar,
  verifySelfie,
  getStatus,
  eSign,
  registerEnach,
  getEnachStatus,
};
