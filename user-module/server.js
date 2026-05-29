require('dotenv').config();
const { validateEnv } = require('./src/config/env');
validateEnv();
const app = require('./src/app');
const logger = require('./src/utils/logger');
const PORT = process.env.PORT || 3000;

const { startCleanupJob } = require('./src/jobs/cleanupBlacklist');

const server = app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
    startCleanupJob();
});

process.on('unhandledRejection', (error) => {
  logger.error({ message: 'Unhandled rejection', error: error.message, stack: error.stack });
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (error) => {
  logger.error({ message: 'Uncaught exception', error: error.message, stack: error.stack });
  process.exit(1);
});
