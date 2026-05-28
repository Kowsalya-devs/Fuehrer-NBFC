const prisma = require('../config/prismaClient');
const AppError = require('../utils/appError');
const { verifyToken } = require('../utils/jwtUtils');
const { hashToken } = require('../utils/tokenUtils');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authorization header with Bearer token is required.', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    const tokenHash = hashToken(token);
    const blacklistedToken = await prisma.tokenBlacklist.findUnique({
      where: { tokenHash },
    });

    if (blacklistedToken && blacklistedToken.expiresAt > new Date()) {
      throw new AppError('Token has been invalidated. Please log in again.', 401);
    }

    req.token = token;
    req.user = {
      userId: decoded.userId,
      phone: decoded.phone,
      exp: decoded.exp,
      iat: decoded.iat,
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new AppError('Invalid or expired token.', 401));
    }

    return next(error);
  }
};

module.exports = authMiddleware;
