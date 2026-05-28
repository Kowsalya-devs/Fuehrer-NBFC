const crypto = require('crypto');

const hashToken = (token) => {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
};

module.exports = { hashToken };
