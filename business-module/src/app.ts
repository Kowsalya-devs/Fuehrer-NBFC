// src/app.ts
import { profileRouter } from '@/modules/profile';
import { notificationsRouter } from '@/modules/notifications/notifications.routes';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { corsMiddleware } from '@/config/cors';
import { env } from '@/config/env';
import {
    requestLogger,
    verifyToken,
    generalLimiter,
    auditTrail,
    errorHandler,
    notFoundHandler,
} from '@/middlewares';
import { bootstrapEventHandlers } from '@/events';

// ── Module routers ─────────────────────────────────────────────────────────────
import { authRouter } from '@/modules/auth';
import { healthRouter } from '@/modules/health';
import { webhooksRouter } from '@/modules/webhooks';
import { kycRouter } from '@/modules/kyc';
import { loansRouter } from '@/modules/loans';
import { emiRouter } from '@/modules/emi';
import { underwritingRouter } from '@/modules/underwriting';
import { disbursementRouter } from '@/modules/disbursement';
import { paymentsRouter } from '@/modules/payments';
import { agentsRouter } from '@/modules/agents';
import { collectionsRouter } from '@/modules/collections';
import { auditRouter } from '@/modules/audit';
import { reportsRouter } from '@/modules/reports';
import { adminRouter } from '@/modules/admin';

export function createApp(): express.Application {
    const app = express();
    const api = `/api/${env.apiVersion}`;

    // ── 1. Security headers ────────────────────────────────────────────────────
    app.use(helmet({
        contentSecurityPolicy: env.isProd,
        crossOriginEmbedderPolicy: false,
    }));

    // ── 2. CORS ────────────────────────────────────────────────────────────────
    app.use(corsMiddleware);

    // ── 3. Request logger ──────────────────────────────────────────────────────
    app.use(requestLogger());

    // ── 4. Rate limiter ────────────────────────────────────────────────────────
    app.use(generalLimiter);

    // ── 5. Health — no auth, no body parsing ──────────────────────────────────
    app.use('/health', healthRouter);

    // ── 6. Webhooks — MUST be before express.json() ───────────────────────────
    app.use(`${api}/webhooks`, webhooksRouter);

    // ── 7. Body parsing ────────────────────────────────────────────────────────
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    app.use(compression());

    // ── 8. JWT verification ────────────────────────────────────────────────────
    app.use(verifyToken());

    // ── 9. Audit trail ─────────────────────────────────────────────────────────
    app.use(auditTrail());

    // ── 10. Bootstrap event + notification handlers ───────────────────────────
    bootstrapEventHandlers();

    // ── 11. Domain routes ──────────────────────────────────────────────────────
    app.use('/auth', authRouter);
    app.use('/user', profileRouter);
app.use('/notifications', notificationsRouter);
    app.use(`${api}/kyc`, kycRouter);
    app.use(`${api}/loans`, loansRouter);
    app.use(`${api}/emi`, emiRouter);
    app.use(`${api}/underwriting`, underwritingRouter);
    app.use(`${api}/disbursement`, disbursementRouter);
    app.use(`${api}/payments`, paymentsRouter);
    app.use(`${api}/agents`, agentsRouter);
    app.use(`${api}/collections`, collectionsRouter);
    app.use(`${api}/audit`, auditRouter);
    app.use(`${api}/reports`, reportsRouter);
    app.use(`${api}/admin`, adminRouter);

    // ── 12. 404 handler ────────────────────────────────────────────────────────
    app.use(notFoundHandler());

    // ── 13. Global error handler ───────────────────────────────────────────────
    app.use(errorHandler());

    return app;
}