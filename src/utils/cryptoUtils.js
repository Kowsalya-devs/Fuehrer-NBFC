const crypto = require('crypto');
const AppError = require('./appError');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

const getEncryptionKey = () => {
  const rawKey = process.env.ENCRYPTION_KEY;

  if (!rawKey) {
    throw new AppError('Encryption key is not configured.', 500);
  }

  const key = /^[a-fA-F0-9]{64}$/.test(rawKey)
    ? Buffer.from(rawKey, 'hex')
    : Buffer.from(rawKey, 'base64');

  if (key.length !== 32) {
    throw new AppError('Encryption key must resolve to 32 bytes for AES-256-GCM.', 500);
  }

  return key;
};

const encryptText = (plainText) => {
  if (plainText === undefined || plainText === null || plainText === '') {
    return null;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
};

const decryptText = (cipherText) => {
  if (!cipherText) {
    return null;
  }

  const [ivBase64, tagBase64, encryptedBase64] = String(cipherText).split(':');

  if (!ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new AppError('Encrypted value is malformed.', 500);
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivBase64, 'base64'),
  );

  decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
};

module.exports = {
  encryptText,
  decryptText,
};
