const { PrismaClient } = require('@prisma/client');

const prisma = global.__prisma__ || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma__ = prisma;
}

module.exports = prisma;
