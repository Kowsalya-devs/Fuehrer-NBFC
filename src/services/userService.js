const prisma = require('../config/prismaClient');
const otpService = require('./otpService');
const AppError = require('../utils/appError');
const { generateToken } = require('../utils/jwtUtils');
const logger = require('../utils/logger');
const { normalizePhone } = require('../utils/phoneUtils');
const { buildUserResponse } = require('../utils/userPresenter');
const { hashToken } = require('../utils/tokenUtils');

const registerUser = async (phone, role = 'CUSTOMER') => {
    const normalizedPhone = normalizePhone(phone);  const existingUser = await prisma.user.findUnique({
    where: {
      phone: normalizedPhone,
    },
  });

  if (existingUser) {
    throw new AppError('User already exists with this phone number.', 409);
  }

  const user = await prisma.user.create({
    data: {
        phone: normalizedPhone,
        role,
    },
});
  logger.info({
    message: 'User registered successfully.',
    userId: user.id,
    phone: user.phone,
  });

  return {
    user: buildUserResponse(user),
  };
};

const sendOtp = async (phone) => {
  const normalizedPhone = normalizePhone(phone);
  const user = await prisma.user.findUnique({
    where: {
      phone: normalizedPhone,
    },
  });

  if (!user) {
    throw new AppError('User not found. Please register first.', 404);
  }

  const otpPayload = await otpService.issueOtp(normalizedPhone);

  return {
    phone: normalizedPhone,
    expiresAt: otpPayload.expiresAt,
    otp: otpPayload.otp,
  };
};

const verifyOtp = async (phone, otp) => {
  const normalizedPhone = normalizePhone(phone);
  const user = await prisma.user.findUnique({
    where: {
      phone: normalizedPhone,
    },
  });

  if (!user) {
    throw new AppError('User not found. Please register first.', 404);
  }

  await otpService.consumeOtp(normalizedPhone, otp);

  const token = generateToken(user.id, user.phone, user.role);

  logger.info({
    message: 'OTP verified successfully.',
    userId: user.id,
    phone: user.phone,
  });

  return {
    user: buildUserResponse(user),
    token,
  };
};

const loginUser = async (phone) => {
  return sendOtp(phone);
};

const logoutUser = async (userId, token, tokenExp) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    throw new AppError('User not found.', 404);
  }

  const tokenHash = hashToken(token);
  const expiresAt = tokenExp ? new Date(tokenExp * 1000) : new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));

  await prisma.tokenBlacklist.upsert({
    where: {
      tokenHash,
    },
    update: {
      expiresAt,
    },
    create: {
      tokenHash,
      userId,
      expiresAt,
    },
  });

  logger.info({
    message: 'User logged out successfully.',
    userId,
  });

  return {
    loggedOut: true,
  };
};

const getProfile = async (userId) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    throw new AppError('User not found.', 404);
  }

  return {
    user: buildUserResponse(user),
  };
};

const updateProfile = async (userId, payload) => {
  const existingUser = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!existingUser) {
    throw new AppError('User not found.', 404);
  }

  const user = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      name: Object.prototype.hasOwnProperty.call(payload, 'name') ? payload.name : existingUser.name,
      email: Object.prototype.hasOwnProperty.call(payload, 'email') ? payload.email : existingUser.email,
    },
  });

  logger.info({
    message: 'User profile updated successfully.',
    userId,
  });

  return {
    user: buildUserResponse(user),
  };
};

const getUserById = async (userId) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    throw new AppError('User not found.', 404);
  }

  return {
    user: buildUserResponse(user),
  };
};

module.exports = {
  registerUser,
  sendOtp,
  verifyOtp,
  loginUser,
  logoutUser,
  getProfile,
  updateProfile,
  getUserById,
};
