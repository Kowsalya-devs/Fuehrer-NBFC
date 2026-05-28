// src/modules/admin/admin.routes.ts
import { Router } from 'express';
import Joi from 'joi';
import { adminController } from './admin.controller';
import {
    requireAuth,
    allowRoles,
    validateBody,
    validateParams,
    validateQuery,
} from '@/middlewares';
import {
    createAdminUserSchema,
    updateAdminUserSchema,
    updateConfigSchema,
    listAdminUsersSchema,
    adminUserIdParamSchema,
    configKeyParamSchema,
} from './admin.dto';
import { ROLE } from '@/config/constants';

const router = Router();

// All admin routes require SUPER_ADMIN
const SUPER_ADMIN_ONLY = [ROLE.SUPER_ADMIN];

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get(
    '/dashboard',
    requireAuth(),
    allowRoles(...SUPER_ADMIN_ONLY),
    adminController.dashboard,
);

// ─── Admin user management ────────────────────────────────────────────────────

router.get(
    '/users',
    requireAuth(),
    allowRoles(...SUPER_ADMIN_ONLY),
    validateQuery(listAdminUsersSchema),
    adminController.listUsers,
);

router.get(
    '/users/:userId',
    requireAuth(),
    allowRoles(...SUPER_ADMIN_ONLY),
    validateParams(adminUserIdParamSchema),
    adminController.getUser,
);

router.post(
    '/users',
    requireAuth(),
    allowRoles(...SUPER_ADMIN_ONLY),
    validateBody(createAdminUserSchema),
    adminController.createUser,
);

router.patch(
    '/users/:userId',
    requireAuth(),
    allowRoles(...SUPER_ADMIN_ONLY),
    validateParams(adminUserIdParamSchema),
    validateBody(updateAdminUserSchema),
    adminController.updateUser,
);

// ─── System configuration ─────────────────────────────────────────────────────

router.get(
    '/config',
    requireAuth(),
    allowRoles(...SUPER_ADMIN_ONLY),
    adminController.listConfigs,
);

router.get(
    '/config/:key',
    requireAuth(),
    allowRoles(...SUPER_ADMIN_ONLY),
    validateParams(configKeyParamSchema),
    adminController.getConfig,
);

router.put(
    '/config/:key',
    requireAuth(),
    allowRoles(...SUPER_ADMIN_ONLY),
    validateParams(configKeyParamSchema),
    validateBody(updateConfigSchema),
    adminController.updateConfig,
);

// ─── Maintenance mode ─────────────────────────────────────────────────────────

router.post(
    '/maintenance',
    requireAuth(),
    allowRoles(...SUPER_ADMIN_ONLY),
    validateBody(Joi.object({
        enabled: Joi.boolean().required(),
        message: Joi.string().trim().max(500).when('enabled', {
            is: true,
            then: Joi.required(),
        }),
    })),
    adminController.setMaintenance,
);

export { router as adminRouter };
