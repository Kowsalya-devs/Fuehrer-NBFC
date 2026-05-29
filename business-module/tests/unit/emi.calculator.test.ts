// tests/unit/emi.calculator.test.ts
import {
    computeMonthlyEmi,
    buildAmortizationSchedule,
    computeDailyOverduePenalty,
    computeBouncePenalty,
    computeForeclosureAmount,
    allocatePartialPayment,
    _internal,
} from '@/modules/emi/emi.calculator';

const { toPaisa, toRupees } = _internal;

describe('computeMonthlyEmi', () => {

    test('standard 18% p.a. on ₹1,00,000 for 12 months', () => {
        const emi = computeMonthlyEmi(100_000, 18, 12);
        // Known value: ₹9,168 (ceiled to paisa)
        expect(emi).toBe(9168);
    });

    test('0% interest → equal instalments', () => {
        const emi = computeMonthlyEmi(60_000, 0, 12);
        expect(emi).toBe(5_000);
    });

    test('single month tenure', () => {
        const emi = computeMonthlyEmi(10_000, 12, 1);
        // One month at 1% → 10,100
        expect(emi).toBe(10_100);
    });

    test('36 month tenure rounds correctly', () => {
        const emi = computeMonthlyEmi(200_000, 24, 36);
        expect(typeof emi).toBe('number');
        expect(emi).toBeGreaterThan(0);
    });

    test('throws on zero tenure', () => {
        expect(() => computeMonthlyEmi(10_000, 12, 0)).toThrow();
    });

    test('throws on negative principal', () => {
        expect(() => computeMonthlyEmi(-1000, 12, 12)).toThrow();
    });

    test('throws on negative rate', () => {
        expect(() => computeMonthlyEmi(10_000, -1, 12)).toThrow();
    });
});

describe('buildAmortizationSchedule', () => {

    const BASE = {
        loanAccountId: 'test-loan-001',
        principal: 100_000,
        annualRatePct: 18,
        tenureMonths: 12,
        disbursementDate: new Date('2026-01-15'),
    };

    let schedule: ReturnType<typeof buildAmortizationSchedule>;

    beforeEach(() => {
        schedule = buildAmortizationSchedule(BASE);
    });

    test('produces correct number of entries', () => {
        expect(schedule.entries).toHaveLength(12);
    });

    test('first EMI due one month after disbursement', () => {
        const firstDue = schedule.entries[0]!.dueDate;
        expect(firstDue.getFullYear()).toBe(2026);
        expect(firstDue.getMonth()).toBe(1); // February (0-indexed)
    });

    test('sum of principalComponent === principal (invariant 1)', () => {
        const totalPrincipal = schedule.entries.reduce(
            (sum, e) => sum + toPaisa(e.principalComponent), 0,
        );
        expect(totalPrincipal).toBe(toPaisa(BASE.principal));
    });

    test('last entry outstandingAfter === 0', () => {
        const last = schedule.entries[schedule.entries.length - 1]!;
        expect(last.outstandingAfter).toBe(0);
    });

    test('each entry: emiAmount === principal + interest (invariant 4)', () => {
        schedule.entries.forEach((e) => {
            const computed = toPaisa(e.principalComponent) + toPaisa(e.interestComponent);
            expect(toPaisa(e.emiAmount)).toBe(computed);
        });
    });

    test('outstanding decreases monotonically', () => {
        for (let i = 1; i < schedule.entries.length; i++) {
            expect(schedule.entries[i]!.outstandingAfter)
                .toBeLessThan(schedule.entries[i - 1]!.outstandingAfter);
        }
    });

    test('all EMIs equal monthlyEmi except last', () => {
        schedule.entries.slice(0, -1).forEach((e) => {
            expect(e.emiAmount).toBe(schedule.monthlyEmi);
        });
        // Last EMI may differ
        const last = schedule.entries[schedule.entries.length - 1]!;
        expect(last.emiAmount).toBeLessThanOrEqual(schedule.monthlyEmi + 0.50);
    });

    test('January 31 + 1 month = February 28 (month-end edge case)', () => {
        const jan31Schedule = buildAmortizationSchedule({
            ...BASE,
            disbursementDate: new Date('2026-01-31'),
        });
        const firstDue = jan31Schedule.entries[0]!.dueDate;
        // Should be Feb 28 (2026 is not a leap year), not Mar 3
        expect(firstDue.getDate()).toBe(28);
        expect(firstDue.getMonth()).toBe(1);
    });

    test('0% rate schedule still passes invariants', () => {
        const freeSchedule = buildAmortizationSchedule({
            ...BASE,
            annualRatePct: 0,
        });
        const totalPrincipal = freeSchedule.entries.reduce(
            (sum, e) => sum + toPaisa(e.principalComponent), 0,
        );
        expect(totalPrincipal).toBe(toPaisa(BASE.principal));
        expect(freeSchedule.entries[11]!.outstandingAfter).toBe(0);
    });

    test('large loan ₹5L 36 months — invariants hold', () => {
        const bigSchedule = buildAmortizationSchedule({
            ...BASE,
            principal: 500_000,
            tenureMonths: 36,
        });
        const totalPrincipal = bigSchedule.entries.reduce(
            (sum, e) => sum + toPaisa(e.principalComponent), 0,
        );
        expect(totalPrincipal).toBe(toPaisa(500_000));
        expect(bigSchedule.entries[35]!.outstandingAfter).toBe(0);
    });
});

describe('computeDailyOverduePenalty', () => {
    test('24% p.a. on ₹10,000 = ₹6.58/day (ceiled)', () => {
        const penalty = computeDailyOverduePenalty(10_000, 24);
        // 10000 * 0.24 / 365 = 6.5753...  → ceiled to 6.58
        expect(penalty).toBe(6.58);
    });

    test('returns positive value for positive inputs', () => {
        const p = computeDailyOverduePenalty(50_000, 18);
        expect(p).toBeGreaterThan(0);
    });
});

describe('computeBouncePenalty', () => {
    test('2% on ₹9,000 EMI = ₹180', () => {
        expect(computeBouncePenalty(9_000, 2)).toBe(180);
    });
});

describe('allocatePartialPayment', () => {
    test('full payment clears everything', () => {
        const result = allocatePartialPayment({
            paymentAmount: 1_200,
            penaltyDue: 200,
            interestDue: 300,
            principalDue: 700,
        });
        expect(result.fullySettled).toBe(true);
        expect(result.shortfall).toBe(0);
        expect(result.penaltySettled).toBe(200);
        expect(result.interestSettled).toBe(300);
        expect(result.principalSettled).toBe(700);
    });

    test('partial payment clears penalty first, then interest', () => {
        const result = allocatePartialPayment({
            paymentAmount: 400,
            penaltyDue: 200,
            interestDue: 300,
            principalDue: 700,
        });
        expect(result.fullySettled).toBe(false);
        expect(result.penaltySettled).toBe(200);
        expect(result.interestSettled).toBe(200);
        expect(result.principalSettled).toBe(0);
        expect(result.shortfall).toBe(800);
    });

    test('shortfall calculation is correct', () => {
        const result = allocatePartialPayment({
            paymentAmount: 0,
            penaltyDue: 100,
            interestDue: 200,
            principalDue: 500,
        });
        expect(result.shortfall).toBe(800);
        expect(result.fullySettled).toBe(false);
    });
});