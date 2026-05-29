// src/modules/notifications/notifications.templates.ts
//
// All message templates in one file.
// Rules:
//   - SMS: max 160 chars per credit. Count before deploying.
//   - Email: full HTML with inline styles (email clients strip <head> CSS).
//   - Push: title ≤50 chars, body ≤100 chars.
//   - Never include PAN, full Aadhaar, or full account numbers in any template.
//   - Always use masked values: last4 only.

import type {
    TemplateKey,
    TemplateVariables,
    RenderedTemplate,
} from './notifications.types';
import { formatRupees } from '@/types/common.types';

// ─── Template renderer ────────────────────────────────────────────────────────
// Single dispatch function — add new templates by adding a case here.

export function renderTemplate<K extends TemplateKey>(
    key: K,
    vars: TemplateVariables[K],
): RenderedTemplate {
    // TypeScript can't narrow the vars type inside the switch, so we cast.
    // The type safety is enforced at the call site by the TemplateVariables map.
    const v = vars as Record<string, unknown>;

    switch (key) {

        // ── Loan lifecycle ────────────────────────────────────────────────────────

        case 'LOAN_CREATED':
            return {
                smsBody: sms(
                    `Dear ${v.customerName}, your loan application for ` +
                    `${formatRupees(v.amount as number)} has been received. ` +
                    `Ref: ${(v.loanId as string).slice(0, 8)}. -Feuhrer`,
                ),
                pushTitle: 'Application received',
                pushBody: `Your loan application for ${formatRupees(v.amount as number)} is under review.`,
                pushData: { loanId: v.loanId as string, screen: 'loan_status' },
            };

        case 'LOAN_APPROVED':
            return {
                smsBody: sms(
                    `Congratulations ${v.customerName}! Your loan of ` +
                    `${formatRupees(v.approvedAmount as number)} is APPROVED. ` +
                    `EMI: ${formatRupees(v.monthlyEmi as number)}/mo for ${v.tenureMonths} months. -Feuhrer`,
                ),
                emailSubject: 'Your loan has been approved — Feuhrer',
                emailHtml: emailWrapper(
                    'Loan Approved',
                    `<p>Dear ${v.customerName},</p>
          <p>We are pleased to inform you that your loan application has been approved.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;color:#666">Approved Amount</td>
                <td style="padding:8px;font-weight:bold">${formatRupees(v.approvedAmount as number)}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;color:#666">Monthly EMI</td>
                <td style="padding:8px;font-weight:bold">${formatRupees(v.monthlyEmi as number)}</td></tr>
            <tr><td style="padding:8px;color:#666">Tenure</td>
                <td style="padding:8px">${v.tenureMonths} months</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;color:#666">Interest Rate</td>
                <td style="padding:8px">${v.interestRate}% p.a.</td></tr>
          </table>
          <p>Please complete the eSign process to proceed with disbursement.</p>`,
                ),
                emailText: `Dear ${v.customerName}, your loan of ${formatRupees(v.approvedAmount as number)} has been approved. Monthly EMI: ${formatRupees(v.monthlyEmi as number)} for ${v.tenureMonths} months.`,
                pushTitle: 'Loan Approved!',
                pushBody: `${formatRupees(v.approvedAmount as number)} approved. EMI: ${formatRupees(v.monthlyEmi as number)}/mo`,
                pushData: { screen: 'loan_status' },
            };

        case 'LOAN_REJECTED':
            return {
                smsBody: sms(
                    `Dear ${v.customerName}, we regret that your loan application could not be approved at this time. ` +
                    `For assistance, contact support. -Feuhrer`,
                ),
                emailSubject: 'Loan application update — Feuhrer',
                emailHtml: emailWrapper(
                    'Application Update',
                    `<p>Dear ${v.customerName},</p>
          <p>After careful review, we are unable to approve your loan application at this time.</p>
          <p style="color:#666"><strong>Reason:</strong> ${v.reason}</p>
          <p>You may reapply after 90 days or contact our support team for guidance.</p>`,
                ),
                emailText: `Dear ${v.customerName}, your loan application was not approved. Reason: ${v.reason}.`,
                pushTitle: 'Application update',
                pushBody: 'Your loan application could not be approved at this time.',
                pushData: { screen: 'loan_status' },
            };

        case 'LOAN_DISBURSED':
            return {
                smsBody: sms(
                    `Dear ${v.customerName}, ${formatRupees(v.disbursedAmount as number)} disbursed to your account. ` +
                    `UTR: ${v.utrNumber ?? 'N/A'}. ` +
                    `First EMI ${formatRupees(v.monthlyEmi as number)} due on ${v.firstEmiDate}. -Feuhrer`,
                ),
                emailSubject: 'Loan disbursed — Feuhrer',
                emailHtml: emailWrapper(
                    'Loan Disbursed',
                    `<p>Dear ${v.customerName},</p>
          <p>Your loan has been disbursed successfully.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;color:#666">Amount Disbursed</td>
                <td style="padding:8px;font-weight:bold">${formatRupees(v.disbursedAmount as number)}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;color:#666">UTR Number</td>
                <td style="padding:8px">${v.utrNumber ?? 'Processing'}</td></tr>
            <tr><td style="padding:8px;color:#666">Loan Account</td>
                <td style="padding:8px">${v.accountNumber}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;color:#666">First EMI Date</td>
                <td style="padding:8px">${v.firstEmiDate}</td></tr>
            <tr><td style="padding:8px;color:#666">Monthly EMI</td>
                <td style="padding:8px;font-weight:bold">${formatRupees(v.monthlyEmi as number)}</td></tr>
          </table>
          <p>Please ensure your registered bank account has sufficient balance on each EMI due date.</p>`,
                ),
                emailText: `Dear ${v.customerName}, your loan of ${formatRupees(v.disbursedAmount as number)} has been disbursed. UTR: ${v.utrNumber}. First EMI: ${formatRupees(v.monthlyEmi as number)} on ${v.firstEmiDate}.`,
                pushTitle: 'Amount disbursed!',
                pushBody: `${formatRupees(v.disbursedAmount as number)} sent to your account.`,
                pushData: { screen: 'loan_account', accountNumber: v.accountNumber as string },
            };

        case 'LOAN_CLOSED':
            return {
                smsBody: sms(
                    `Dear ${v.customerName}, your loan account ${v.accountNumber} has been fully repaid and closed on ${v.closedAt}. ` +
                    `Thank you for choosing Feuhrer. -Feuhrer`,
                ),
                emailSubject: 'Loan closed — No Objection Certificate | Feuhrer',
                emailHtml: emailWrapper(
                    'Loan Closed',
                    `<p>Dear ${v.customerName},</p>
          <p>Congratulations! Your loan account <strong>${v.accountNumber}</strong> has been fully repaid and closed on ${v.closedAt}.</p>
          <p>Your No Objection Certificate (NOC) will be sent to your registered email within 7 working days.</p>
          <p>Thank you for choosing Feuhrer.</p>`,
                ),
                emailText: `Dear ${v.customerName}, your loan ${v.accountNumber} has been closed on ${v.closedAt}. NOC will be sent within 7 working days.`,
                pushTitle: 'Loan fully repaid!',
                pushBody: `Account ${v.accountNumber} is now closed. NOC will follow.`,
                pushData: { screen: 'loan_account' },
            };

        case 'LOAN_NPA':
            return {
                smsBody: sms(
                    `URGENT: Dear ${v.customerName}, your loan account ${v.accountNumber} is ${v.overdueDays} days overdue. ` +
                    `Total due: ${formatRupees(v.totalDue as number)}. Please pay immediately to avoid legal action. -Feuhrer`,
                ),
                pushTitle: 'Urgent: Payment overdue',
                pushBody: `${v.overdueDays} days overdue. Pay ${formatRupees(v.totalDue as number)} now.`,
                pushData: { screen: 'payment', accountNumber: v.accountNumber as string },
            };

        // ── KYC ───────────────────────────────────────────────────────────────────

        case 'KYC_INITIATED':
            return {
                smsBody: sms(`Dear ${v.customerName}, your KYC verification has been initiated. Please complete all steps in the app. -Feuhrer`),
                pushTitle: 'KYC started',
                pushBody: 'Complete your KYC to proceed with your loan application.',
                pushData: { screen: 'kyc' },
            };

        case 'KYC_COMPLETED':
            return {
                smsBody: sms(`Dear ${v.customerName}, your KYC has been successfully verified. Your loan application is now under review. -Feuhrer`),
                pushTitle: 'KYC verified',
                pushBody: 'Your identity has been verified. Loan review in progress.',
                pushData: { screen: 'loan_status' },
            };

        case 'KYC_REJECTED':
            return {
                smsBody: sms(`Dear ${v.customerName}, your KYC could not be verified. Reason: ${v.reason}. Please contact support. -Feuhrer`),
                pushTitle: 'KYC verification failed',
                pushBody: `Unable to verify: ${v.reason}`,
                pushData: { screen: 'kyc' },
            };

        case 'KYC_ESIGN_REQUESTED':
            return {
                smsBody: sms(
                    `Dear ${v.customerName}, please sign your loan agreement: ${v.signingUrl} ` +
                    `(expires ${v.expiresAt}). -Feuhrer`,
                ),
                emailSubject: 'Action required: Sign your loan agreement | Feuhrer',
                emailHtml: emailWrapper(
                    'Loan Agreement — eSign Required',
                    `<p>Dear ${v.customerName},</p>
          <p>Your loan agreement is ready for your digital signature.</p>
          <p style="margin:24px 0">
            <a href="${v.signingUrl}" style="background:#1a56db;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold">
              Sign Agreement
            </a>
          </p>
          <p style="color:#666;font-size:14px">This link expires on ${v.expiresAt}.</p>`,
                ),
                emailText: `Dear ${v.customerName}, sign your loan agreement: ${v.signingUrl} (expires ${v.expiresAt})`,
                pushTitle: 'Sign your loan agreement',
                pushBody: `Please sign your agreement before ${v.expiresAt}.`,
                pushData: { screen: 'esign', url: v.signingUrl as string },
            };

        // ── EMI reminders ─────────────────────────────────────────────────────────

        case 'EMI_REMINDER_3_DAYS':
            return {
                smsBody: sms(`Reminder: EMI of ${formatRupees(v.emiAmount as number)} for loan ${v.accountNumber} is due on ${v.dueDate}. Please ensure sufficient balance. -Feuhrer`),
                pushTitle: 'EMI due in 3 days',
                pushBody: `${formatRupees(v.emiAmount as number)} due on ${v.dueDate}`,
                pushData: { screen: 'emi_schedule' },
            };

        case 'EMI_REMINDER_1_DAY':
            return {
                smsBody: sms(`Reminder: EMI of ${formatRupees(v.emiAmount as number)} for loan ${v.accountNumber} is due TOMORROW. Maintain sufficient balance. -Feuhrer`),
                pushTitle: 'EMI due tomorrow',
                pushBody: `${formatRupees(v.emiAmount as number)} will be debited tomorrow.`,
                pushData: { screen: 'emi_schedule' },
            };

        case 'EMI_DUE_TODAY':
            return {
                smsBody: sms(`Your EMI of ${formatRupees(v.emiAmount as number)} for loan ${v.accountNumber} is due TODAY. Auto-debit will be attempted. -Feuhrer`),
                pushTitle: 'EMI due today',
                pushBody: `${formatRupees(v.emiAmount as number)} will be debited today.`,
                pushData: { screen: 'emi_schedule' },
            };

        case 'EMI_OVERDUE':
            return {
                smsBody: sms(
                    `OVERDUE: EMI of ${formatRupees(v.emiAmount as number)} for loan ${v.accountNumber} is ${v.overdueDays} days overdue. ` +
                    `Penalty: ${formatRupees(v.penaltyAmount as number)}. Pay now to avoid NPA. -Feuhrer`,
                ),
                pushTitle: 'EMI overdue',
                pushBody: `${v.overdueDays} days overdue. Total due: ${formatRupees(v.totalDue as number)}`,
                pushData: { screen: 'payment' },
            };

        case 'EMI_PAID':
            return {
                smsBody: sms(`EMI #${v.emiNumber} of ${formatRupees(v.amount as number)} for loan ${v.accountNumber} received on ${v.paidAt}. Thank you. -Feuhrer`),
                pushTitle: 'EMI payment received',
                pushBody: `${formatRupees(v.amount as number)} received for EMI #${v.emiNumber}.`,
                pushData: { screen: 'emi_schedule' },
            };

        case 'EMI_BOUNCED':
            return {
                smsBody: sms(
                    `BOUNCE: Your EMI of ${formatRupees(v.emiAmount as number)} for loan ${v.accountNumber} was returned. ` +
                    `Penalty: ${formatRupees(v.penaltyAmount as number)}. ` +
                    `${v.retryDate ? `Retry on ${v.retryDate}.` : 'Please pay manually.'} -Feuhrer`,
                ),
                pushTitle: 'EMI payment bounced',
                pushBody: `EMI returned. Penalty applied: ${formatRupees(v.penaltyAmount as number)}`,
                pushData: { screen: 'payment' },
            };

        // ── Payments ──────────────────────────────────────────────────────────────

        case 'PAYMENT_RECEIVED':
            return {
                smsBody: sms(`Payment of ${formatRupees(v.amount as number)} received for loan ${v.accountNumber}. UTR: ${v.utrNumber ?? 'N/A'}. -Feuhrer`),
                pushTitle: 'Payment received',
                pushBody: `${formatRupees(v.amount as number)} credited.`,
                pushData: { screen: 'emi_schedule' },
            };

        case 'PAYMENT_FAILED':
            return {
                smsBody: sms(
                    `Payment of ${formatRupees(v.amount as number)} failed. Reason: ${v.reason}. ` +
                    `${v.paymentLink ? `Pay now: ${v.paymentLink}` : 'Please retry.'} -Feuhrer`,
                ),
                pushTitle: 'Payment failed',
                pushBody: `${formatRupees(v.amount as number)} payment failed. Tap to retry.`,
                pushData: { screen: 'payment', url: (v.paymentLink as string) ?? '' },
            };

        case 'MANDATE_CREATED':
            return {
                smsBody: sms(
                    `Dear ${v.customerName}, register your eNACH mandate to enable auto-debit: ${v.registrationLink} -Feuhrer`,
                ),
                pushTitle: 'Register eNACH mandate',
                pushBody: 'Tap to set up auto-debit for your EMIs.',
                pushData: { screen: 'mandate', url: v.registrationLink as string },
            };

        case 'MANDATE_ACTIVATED':
            return {
                smsBody: sms(`Your eNACH mandate for loan ${v.accountNumber} is now active. EMIs will be auto-debited from ${v.bankAccount}. -Feuhrer`),
                pushTitle: 'Auto-debit activated',
                pushBody: `Your EMIs will be automatically debited from ${v.bankAccount}.`,
                pushData: { screen: 'mandate' },
            };

        case 'PAYMENT_LINK_GENERATED':
            return {
                smsBody: sms(
                    `Pay ${formatRupees(v.amount as number)} for your Feuhrer EMI: ${v.shortUrl} ` +
                    `(expires ${v.expiresAt}). -Feuhrer`,
                ),
                pushTitle: 'Payment link ready',
                pushBody: `Pay ${formatRupees(v.amount as number)} by ${v.expiresAt}`,
                pushData: { screen: 'payment_link', url: v.shortUrl as string },
            };

        // ── Collections ───────────────────────────────────────────────────────────

        case 'COLLECTION_ASSIGNED': {
            // Sent to the collection AGENT, not the customer
            return {
                smsBody: sms(`New collection case assigned. Customer: ${v.customerName}. DPD: ${v.overdueDays} days. Amount: ${formatRupees(v.overdueAmount as number)}. Login to app for details. -Feuhrer`),
                pushTitle: 'New case assigned',
                pushBody: `${v.customerName} — ${v.overdueDays} DPD, ${formatRupees(v.overdueAmount as number)}`,
                pushData: { screen: 'collection_case' },
            };
        }

        case 'PTP_REMINDER':
            return {
                smsBody: sms(`Reminder: You had promised to pay ${formatRupees(v.ptpAmount as number)} on ${v.ptpDate}. Please make the payment to avoid further penalties. -Feuhrer`),
                pushTitle: 'Payment promise reminder',
                pushBody: `You promised to pay ${formatRupees(v.ptpAmount as number)} by ${v.ptpDate}.`,
                pushData: { screen: 'payment' },
            };

        case 'PTP_BROKEN':
            return {
                smsBody: sms(`Your missed payment commitment for loan ${v.accountNumber} is now overdue. Total due: ${formatRupees(v.overdueAmount as number)}. Pay immediately. -Feuhrer`),
                pushTitle: 'Missed payment',
                pushBody: `Your payment commitment was missed. Pay now.`,
                pushData: { screen: 'payment' },
            };

        // ── Agent ─────────────────────────────────────────────────────────────────

        case 'AGENT_ONBOARDED':
            return {
                smsBody: sms(`Welcome to Feuhrer! Your agent application (Code: ${v.agentCode}) has been received. Await activation. -Feuhrer`),
                pushTitle: 'Application received',
                pushBody: `Agent code: ${v.agentCode}. Pending activation.`,
                pushData: { screen: 'agent_profile' },
            };

        case 'AGENT_ACTIVATED':
            return {
                smsBody: sms(`Congratulations ${v.agentName}! Your agent account (${v.agentCode}) is now active. Start submitting loan applications. -Feuhrer`),
                pushTitle: 'Account activated!',
                pushBody: `${v.agentCode} — You can now submit loan applications.`,
                pushData: { screen: 'agent_dashboard' },
            };

        case 'AGENT_SUSPENDED':
            return {
                smsBody: sms(`Your Feuhrer agent account has been suspended. Reason: ${v.reason}. Contact your manager. -Feuhrer`),
                pushTitle: 'Account suspended',
                pushBody: `Your account has been suspended: ${v.reason}`,
                pushData: { screen: 'agent_profile' },
            };

        case 'COMMISSION_EARNED':
            return {
                smsBody: sms(`Commission of ${formatRupees(v.commissionAmount as number)} earned on ${v.earnedAt} for a successfully disbursed loan. -Feuhrer`),
                pushTitle: 'Commission earned!',
                pushBody: `${formatRupees(v.commissionAmount as number)} commission added to your account.`,
                pushData: { screen: 'commissions' },
            };

        case 'COMMISSION_PAID':
            return {
                smsBody: sms(
                    `${formatRupees(v.totalAmount as number)} commission payout processed. ` +
                    `UTR: ${v.utrNumber ?? 'N/A'}. -Feuhrer`,
                ),
                emailSubject: 'Commission payout processed — Feuhrer',
                emailHtml: emailWrapper(
                    'Commission Payout',
                    `<p>Dear ${v.agentName},</p>
          <p>Your commission payout has been processed.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;color:#666">Amount</td>
                <td style="padding:8px;font-weight:bold">${formatRupees(v.totalAmount as number)}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;color:#666">UTR Number</td>
                <td style="padding:8px">${v.utrNumber ?? 'Processing'}</td></tr>
            <tr><td style="padding:8px;color:#666">Date</td>
                <td style="padding:8px">${v.paidAt}</td></tr>
          </table>`,
                ),
                emailText: `Dear ${v.agentName}, commission payout of ${formatRupees(v.totalAmount as number)} processed. UTR: ${v.utrNumber ?? 'N/A'}.`,
                pushTitle: 'Commission paid!',
                pushBody: `${formatRupees(v.totalAmount as number)} has been sent to your bank.`,
                pushData: { screen: 'commissions' },
            };

        case 'WELCOME':
            return {
                smsBody: sms(`Welcome to Feuhrer, ${v.customerName}! Your account is ready. Apply for consumer durable loans instantly. -Feuhrer`),
                emailSubject: 'Welcome to Feuhrer!',
                emailHtml: emailWrapper(
                    'Welcome to Feuhrer',
                    `<p>Dear ${v.customerName},</p>
          <p>Welcome to Feuhrer! Your account for ${v.phone} is now active.</p>
          <p>You can now apply for instant consumer durable loans through our app.</p>
          <p style="color:#666;font-size:14px">If you did not create this account, please contact us immediately.</p>`,
                ),
                emailText: `Welcome to Feuhrer, ${v.customerName}! Your account is ready.`,
                pushTitle: 'Welcome to Feuhrer!',
                pushBody: 'Your account is ready. Apply for loans instantly.',
                pushData: { screen: 'home' },
            };

        default: {
            const exhaustive: never = key;
            throw new Error(`Unknown notification template: ${exhaustive}`);
        }
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sms(text: string): string {
    // Truncate at 306 chars (2 SMS credits) — never silently drop characters
    if (text.length > 306) {
        return text.slice(0, 303) + '...';
    }
    return text;
}

function emailWrapper(title: string, body: string): string {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
        <tr>
          <td style="background:#1a56db;padding:20px 32px">
            <h1 style="color:#fff;margin:0;font-size:20px">Feuhrer</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <h2 style="color:#1a56db;margin:0 0 16px">${title}</h2>
            <div style="color:#333;line-height:1.6;font-size:15px">${body}</div>
          </td>
        </tr>
        <tr>
          <td style="background:#f9f9f9;padding:16px 32px;color:#999;font-size:12px">
            This is an automated message from Feuhrer Financial Services.
            Do not reply to this email.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
