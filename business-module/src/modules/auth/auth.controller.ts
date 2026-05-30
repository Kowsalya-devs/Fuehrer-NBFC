import type { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { createModuleLogger } from '@/config/logger';
import { prisma } from '@/config/database';

const log = createModuleLogger('auth.proxy');
const USER_MODULE_URL = process.env.USER_MODULE_URL ?? 'http://localhost:3001';

async function forward(req: Request, res: Response, next: NextFunction, path: string) {
    try {
        const url = `${USER_MODULE_URL}/api/users${path}`;
        const response = await axios({
            method: req.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
            url,
            data: req.body,
            headers: {
                'Content-Type': 'application/json',
                ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
            },
            timeout: 10000,
        });
        return response;
    } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response) {
            res.status(err.response.status).json(err.response.data);
            return null;
        }
        log.error({ message: 'Auth proxy error', path, err });
        next(err);
        return null;
    }
}

export const authController = {
    async sendOtp(req: Request, res: Response, next: NextFunction) {
        try {
            const response = await forward(req, res, next, '/send-otp');
            if (response) res.status(response.status).json(response.data);
        } catch (err) { next(err); }
    },

    async verifyOtp(req: Request, res: Response, next: NextFunction) {
        try {
            const response = await forward(req, res, next, '/verify-otp');
            if (!response) return;
            if (response.data && response.data.success && response.data.data && response.data.data.user) {
                const u = response.data.data.user;
                await prisma.users.upsert({
                    where: { phone: u.phone },
                    update: {
                        full_name: u.fullName || u.full_name || u.name || 'User',
                        email: u.email || null,
                        updated_at: new Date(),
                    },
                    create: {
                        id: u.id,
                        phone: u.phone,
                        full_name: u.fullName || u.full_name || u.name || 'User',
                        email: u.email || null,
                        is_active: true,
                    },
                });
                log.info({ message: 'User synced to business DB', phone: u.phone });
            }
            res.status(response.status).json(response.data);
        } catch (err) { next(err); }
    },

    async refresh(req: Request, res: Response, next: NextFunction) {
        try {
            const response = await forward(req, res, next, '/refresh');
            if (response) res.status(response.status).json(response.data);
        } catch (err) { next(err); }
    },

    async logout(req: Request, res: Response, next: NextFunction) {
        try {
            const response = await forward(req, res, next, '/logout');
            if (response) res.status(response.status).json(response.data);
        } catch (err) { next(err); }
    },

    async register(req: Request, res: Response, next: NextFunction) {
        try {
            const response = await forward(req, res, next, '/register');
            if (response) res.status(response.status).json(response.data);
        } catch (err) { next(err); }
    },
};