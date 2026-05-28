// src/modules/health/health.routes.ts
//
// Health routes deliberately have NO middleware:
//   - No verifyToken  — load balancers don't send auth headers
//   - No rateLimiter  — probes run every 30s from multiple AZs
//   - No auditTrail   — health checks generate noise, not signal
//   - No requestLogger body logging — but requestId is still attached
//     by the global requestLogger middleware mounted in app.ts

import { Router } from 'express';
import { healthController } from './health.controller';

const router = Router();

// App Runner liveness probe
router.get('/live', healthController.live);

// App Runner readiness probe
router.get('/ready', healthController.ready);

// Full diagnostics (VPC-internal only — not exposed via ALB in production)
router.get('/', healthController.full);

export { router as healthRouter };
