const AppError = require('./appError');

const sanitizePhoneInput = (value) => String(value || '').replace(/\D/g, '');

const normalizePhone = (value) => {
  const phone = sanitizePhoneInput(value);

  if (phone.length < 10 || phone.length > 15) {
    throw new AppError('Phone number must be between 10 and 15 digits.', 400);
  }

  return phone;
};

module.exports = {
  sanitizePhoneInput,
  normalizePhone,
};
