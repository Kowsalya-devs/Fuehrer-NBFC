// src/modules/auth/auth.routes.ts
import { Router } from 'express';
import { authController } from './auth.controller';

const router = Router();

router.post('/send-otp',   authController.sendOtp);
router.post('/verify-otp', authController.verifyOtp);
router.post('/refresh',    authController.refresh);
router.post('/logout',     authController.logout);
router.post('/register',   authController.register);

export { router as authRouter };