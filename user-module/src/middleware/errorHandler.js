const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;

  logger.error({
    message: err.message,
    statusCode,
    method: req.method,
    path: req.originalUrl,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });

  const response = {
    success: false,
    message: err.message || 'Internal server error',
  };

  if (err.errors) {
    response.errors = err.errors;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
