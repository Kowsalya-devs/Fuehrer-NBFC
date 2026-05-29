import { createApp } from './app';
import { env } from '@/config/env';
import { createModuleLogger } from '@/config/logger';

const log = createModuleLogger('server');

const app = createApp();

app.listen(env.port, () => {
    log.info(`Server running on port ${env.port}`, {
        env: env.nodeEnv,
        port: env.port,
    });
});