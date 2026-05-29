const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { JWT_EXPIRES_IN } = require('./constants');

// Generate token matching business module expected shape:
// { userId, phone, role, jti, iat, exp }
// jti = unique token ID — used for token revocation via blacklist
const generateToken = (userId, phone, role = 'CUSTOMER') => {
    const jti = crypto.randomUUID();

    return jwt.sign(
        { userId, phone, role, jti },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || JWT_EXPIRES_IN },
    );
};

const verifyToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
};

module.exports = { generateToken, verifyToken };