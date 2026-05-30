import { Router } from 'express';
import { requireAuth } from '@/middlewares';
import { HTTP } from '@/config/constants';
import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '@/types/express';

const router = Router();

// GET /notifications
router.get('/', requireAuth(), (_req: AuthRequest, res: Response) => {
    res.status(HTTP.OK).json({
        success: true,
        data: { notifications: [], cursor: null, hasMore: false },
    });
});

// PATCH /notifications/:id/read
router.patch('/:id/read', requireAuth(), (_req: AuthRequest, res: Response) => {
    res.status(HTTP.OK).json({ success: true });
});

// POST /notifications/read-all
router.post('/read-all', requireAuth(), (_req: AuthRequest, res: Response) => {
    res.status(HTTP.OK).json({ success: true });
});

// GET /notifications/unread-count
router.get('/unread-count', requireAuth(), (_req: AuthRequest, res: Response) => {
    res.status(HTTP.OK).json({ success: true, data: { count: 0 } });
});

export { router as notificationsRouter };