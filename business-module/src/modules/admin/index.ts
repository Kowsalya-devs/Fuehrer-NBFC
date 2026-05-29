// src/modules/admin/index.ts
export { adminRouter } from './admin.routes';
export { adminService } from './admin.service';
export { adminRepository } from './admin.repository';
export type {
    AdminUser,
    AdminUserResponse,
    AdminDashboard,
    SystemConfig,
    ConfigKey,
} from './admin.types';
