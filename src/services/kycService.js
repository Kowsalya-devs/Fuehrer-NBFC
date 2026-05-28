const karzaClient = require('../vendors/karzaClient');
const hypervergeClient = require('../vendors/hypervergeClient');
const signzyClient = require('../vendors/signzyClient');
const enachClient = require('../vendors/enachClient');
const prisma = require('../config/prismaClient');
const AppError = require('../utils/appError');
const logger = require('../utils/logger');
const { encryptText } = require('../utils/cryptoUtils');
const {
  KYC_STATUS,
  ESIGN_STATUS,
  ENACH_STATUS,
} = require('../utils/constants');

const ensureUser = async (userId) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    throw new AppError('User not found.', 404);
  }

  return user;
};

const upsertKycDetail = (userId, data) => {
  return prisma.kycDetail.upsert({
    where: {
      userId,
    },
    update: data,
    create: {
      userId,
      ...data,
    },
  });
};

const refreshKycStatus = async (userId) => {
  const kycDetail = await prisma.kycDetail.findUnique({
    where: {
      userId,
    },
  });

  const status =
    kycDetail &&
    kycDetail.panVerified &&
    kycDetail.aadhaarVerified &&
    kycDetail.selfieVerified
      ? KYC_STATUS.VERIFIED
      : KYC_STATUS.PENDING;

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      kycStatus: status,
      isKycDone: status === KYC_STATUS.VERIFIED,
    },
  });

  return status;
};

const buildKycStatusPayload = async (userId) => {
  const user = await ensureUser(userId);
  const kycDetail = await prisma.kycDetail.findUnique({
    where: {
      userId,
    },
  });

  return {
    userId,
    kycStatus: user.kycStatus,
    panVerified: kycDetail ? kycDetail.panVerified : false,
    aadhaarVerified: kycDetail ? kycDetail.aadhaarVerified : false,
    selfieVerified: kycDetail ? kycDetail.selfieVerified : false,
    eSignStatus: kycDetail ? kycDetail.eSignStatus : ESIGN_STATUS.PENDING,
  };
};

const verifyPan = async (userId, panNumber) => {
  await ensureUser(userId);

  const providerResponse = await karzaClient.verifyPan(panNumber);

  if (!providerResponse.success) {
    throw new AppError('PAN verification failed.', 400);
  }

  const encryptedPan = encryptText(panNumber);

  await prisma.$transaction([
    upsertKycDetail(userId, {
      panNumber: encryptedPan,
      panVerified: true,
    }),
    prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        panNumber: encryptedPan,
      },
    }),
  ]);

  const kycStatus = await refreshKycStatus(userId);

  logger.info({
    message: 'PAN verified successfully.',
    userId,
  });

  return {
    providerResponse,
    kycStatus,
  };
};

const verifyAadhaar = async (userId, aadhaarNumber) => {
  await ensureUser(userId);

  const providerResponse = await hypervergeClient.verifyAadhaar(aadhaarNumber);

  if (!providerResponse.success) {
    throw new AppError('Aadhaar verification failed.', 400);
  }

  const encryptedAadhaar = encryptText(aadhaarNumber);

  await prisma.$transaction([
    upsertKycDetail(userId, {
      aadhaarNumber: encryptedAadhaar,
      aadhaarVerified: true,
    }),
    prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        aadhaarNumber: encryptedAadhaar,
      },
    }),
  ]);

  const kycStatus = await refreshKycStatus(userId);

  logger.info({
    message: 'Aadhaar verified successfully.',
    userId,
  });

  return {
    providerResponse,
    kycStatus,
  };
};

const verifySelfie = async (userId, selfiePayload) => {
  await ensureUser(userId);

  const providerResponse = await hypervergeClient.verifySelfie(selfiePayload);

  if (!providerResponse.success) {
    throw new AppError('Selfie verification failed.', 400);
  }

  await upsertKycDetail(userId, {
    selfieVerified: true,
  });

  const kycStatus = await refreshKycStatus(userId);

  logger.info({
    message: 'Selfie verified successfully.',
    userId,
  });

  return {
    providerResponse,
    kycStatus,
  };
};

const getKycStatus = async (userId) => {
  return buildKycStatusPayload(userId);
};

const esignLoanAgreement = async (userId, documentId) => {
  await ensureUser(userId);

  const resolvedDocumentId = documentId || `loan-agreement-${userId}`;
  const providerResponse = await signzyClient.initiateEsign({
    userId,
    documentId: resolvedDocumentId,
  });

  if (!providerResponse.success) {
    throw new AppError('eSign failed.', 400);
  }

  await upsertKycDetail(userId, {
    eSignStatus: ESIGN_STATUS.SIGNED,
  });

  logger.info({
    message: 'eSign completed successfully.',
    userId,
    documentId: resolvedDocumentId,
  });

  return {
    documentId: resolvedDocumentId,
    eSignStatus: ESIGN_STATUS.SIGNED,
    providerResponse,
  };
};

const registerEnach = async (userId, payload) => {
  await ensureUser(userId);

  const providerResponse = await enachClient.registerMandate(payload);

  if (!providerResponse.success) {
    throw new AppError('eNACH registration failed.', 400);
  }

  const mandate = await prisma.eNachMandate.upsert({
    where: {
      userId,
    },
    update: {
      mandateId: providerResponse.mandateId,
      status: providerResponse.status || ENACH_STATUS.PENDING,
    },
    create: {
      userId,
      mandateId: providerResponse.mandateId,
      status: providerResponse.status || ENACH_STATUS.PENDING,
    },
  });

  logger.info({
    message: 'eNACH mandate registered successfully.',
    userId,
    mandateId: mandate.mandateId,
    status: mandate.status,
  });

  return {
    mandateId: mandate.mandateId,
    status: mandate.status,
    providerResponse,
  };
};

const getEnachStatus = async (userId) => {
  await ensureUser(userId);

  const mandate = await prisma.eNachMandate.findUnique({
    where: {
      userId,
    },
  });

  if (!mandate) {
    return {
      mandateId: null,
      status: ENACH_STATUS.PENDING,
    };
  }

  return {
    mandateId: mandate.mandateId,
    status: mandate.status,
  };
};

module.exports = {
  verifyPan,
  verifyAadhaar,
  verifySelfie,
  getKycStatus,
  esignLoanAgreement,
  registerEnach,
  getEnachStatus,
};
