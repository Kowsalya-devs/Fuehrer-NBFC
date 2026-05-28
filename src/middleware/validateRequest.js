const { validationResult } = require('express-validator');
const AppError = require('../utils/appError');

const validateRequest = (validations) => {
  return [
    ...validations,
    (req, res, next) => {
      const errors = validationResult(req);

      if (errors.isEmpty()) {
        return next();
      }

      return next(
        new AppError(
          'Validation failed.',
          400,
          errors.array().map((error) => ({
            field: error.path,
            message: error.msg,
          })),
        ),
      );
    },
  ];
};

module.exports = validateRequest;
