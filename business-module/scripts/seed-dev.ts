// scripts/seed-dev.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
    console.log('Seeding development database...');

    // ── Admin users ──────────────────────────────────────────────────────────
    const superAdmin = await prisma.admin_users.upsert({
        where: { email: 'admin@feuhrer.dev' },
        update: {},
        create: {
            full_name: 'Super Admin',
            email: 'admin@feuhrer.dev',
            phone: '+919000000001',
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            department: 'Technology',
            updated_at: new Date(),
        },
    });

    const creditManager = await prisma.admin_users.upsert({
        where: { email: 'credit@feuhrer.dev' },
        update: {},
        create: {
            full_name: 'Credit Manager',
            email: 'credit@feuhrer.dev',
            phone: '+919000000002',
            role: 'CREDIT_MANAGER',
            status: 'ACTIVE',
            department: 'Credit',
            updated_at: new Date(),
        },
    });

    // ── System config ────────────────────────────────────────────────────────
    const configs = [
        { key: 'MAX_LOAN_AMOUNT', value: '500000', description: 'Max loan in INR' },
        { key: 'MIN_LOAN_AMOUNT', value: '5000', description: 'Min loan in INR' },
        { key: 'MIN_CREDIT_SCORE', value: '650', description: 'Min CIBIL score' },
        { key: 'MAX_FOIR', value: '0.55', description: 'Max FOIR ratio' },
        { key: 'MAINTENANCE_MODE', value: 'false', description: 'Maintenance flag' },
        { key: 'MAINTENANCE_MESSAGE', value: '', description: 'Maintenance msg' },
    ];

    for (const c of configs) {
        await prisma.system_config.upsert({
            where: { key: c.key },
            update: { value: c.value },
            create: { ...c, updated_by: superAdmin.id, updated_at: new Date() },
        });
    }

    // ── Customer user ─────────────────────────────────────────────────────────
    const customer = await prisma.users.upsert({
        where: { phone: '+919876543210' },
        update: {},
        create: {
            phone: '+919876543210',
            full_name: 'Rahul Sharma',
            email: 'rahul@example.com',
            created_at: new Date(),
            updated_at: new Date(),
        },
    });

    console.log('Seed completed:', {
        superAdminId: superAdmin.id,
        creditManagerId: creditManager.id,
        customerId: customer.id,
        configsSeeded: configs.length,
    });
}

seed()
    .catch((e) => {
        console.error('Seed failed:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());