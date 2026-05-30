import { Router } from 'express';
import { requireAuth } from '@/middlewares';
import type { AuthRequest } from '@/types/express';
import type { Response, NextFunction } from 'express';
import { getAuthUser } from '@/types/express';
import axios from 'axios';

const router = Router();
const USER_MODULE_URL = process.env.USER_MODULE_URL ?? 'http://localhost:3001';

async function forwardToUserModule(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
    path: string,
) {
    try {
        const url = `${USER_MODULE_URL}/api/users${path}`;
        const response = await axios({
            method: req.method as string,
            url,
            data: req.body,
            headers: {
                'Content-Type': 'application/json',
                ...(req.headers.authorization
                    ? { Authorization: req.headers.authorization }
                    : {}),
            },
            timeout: 10000,
        });
        res.status(response.status).json(response.data);
    } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response) {
            res.status(err.response.status).json(err.response.data);
        } else {
            next(err);
        }
    }
}

// GET /user/profile
router.get('/profile', requireAuth(), (req: AuthRequest, res: Response, next: NextFunction) => {
    forwardToUserModule(req, res, next, '/profile');
});

// PUT /user/profile
router.put('/profile', requireAuth(), (req: AuthRequest, res: Response, next: NextFunction) => {
    forwardToUserModule(req, res, next, '/profile');
});

// PATCH /user/profile/photo
router.patch('/profile/photo', requireAuth(), (req: AuthRequest, res: Response, next: NextFunction) => {
    forwardToUserModule(req, res, next, '/profile/photo');
});

// POST /user/phone/change
router.post('/phone/change', requireAuth(), (req: AuthRequest, res: Response, next: NextFunction) => {
    forwardToUserModule(req, res, next, '/phone/change');
});

export { router as profileRouter };