// src/utils/emiCalculator.util.ts
//
// EMI calculation utilities.
//
// The full implementation lives in src/modules/emi/emi.calculator.ts —
// paisa-based arithmetic, full amortization schedule, foreclosure, partial
// payment allocation, and overdue penalty calculation.
//
// This file re-exports everything from there so any code that imports from
// '@/utils/emiCalculator.util' resolves correctly without duplicating logic.
//
// DO NOT add calculation logic here. All EMI math belongs in emi.calculator.ts
// so it stays co-located with the emi module's types and tests.

export {
    computeMonthlyEmi,
    buildAmortizationSchedule,
    computeDailyOverduePenalty,
    computeBouncePenalty,
    computeForeclosureAmount,
    allocatePartialPayment,
    _internal,
} from '@/modules/emi/emi.calculator';
