-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(15) NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255),
    "fcm_token" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_documents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "aadhaar_encrypted" TEXT,
    "pan_encrypted" TEXT,
    "aadhaar_last4" VARCHAR(4),
    "pan_masked" VARCHAR(10),
    "selfie_s3_key" VARCHAR(500),
    "aadhaar_front_s3_key" VARCHAR(500),
    "aadhaar_back_s3_key" VARCHAR(500),
    "pan_s3_key" VARCHAR(500),
    "bank_statement_s3_key" VARCHAR(500),
    "signed_agreement_s3_key" VARCHAR(500),
    "liveness_score" DECIMAL(5,2),
    "face_match_score" DECIMAL(5,2),
    "fraud_score" DECIMAL(5,2),
    "credit_score" INTEGER,
    "esign_request_id" VARCHAR(100),
    "esign_status" VARCHAR(30),
    "signzy_responses" JSONB,
    "overall_status" VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED',
    "completed_checks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "failed_checks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rejection_reason" TEXT,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "agent_code" VARCHAR(20) NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(15) NOT NULL,
    "email" VARCHAR(255),
    "shop_name" VARCHAR(100) NOT NULL,
    "shop_address" VARCHAR(300) NOT NULL,
    "shop_city" VARCHAR(100) NOT NULL,
    "shop_pincode" VARCHAR(6) NOT NULL,
    "bank_account_no" VARCHAR(30) NOT NULL,
    "bank_ifsc" VARCHAR(11) NOT NULL,
    "bank_account_name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "commission_rate" DECIMAL(6,4) NOT NULL DEFAULT 0.015,
    "pan_number" VARCHAR(10),
    "aadhaar_last4" VARCHAR(4),
    "suspension_reason" TEXT,
    "onboarded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_applications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "agent_id" UUID,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "amount_requested" DECIMAL(15,2) NOT NULL,
    "tenure_months" INTEGER NOT NULL,
    "product_type" VARCHAR(50) NOT NULL,
    "purpose" VARCHAR(200) NOT NULL,
    "store_name" VARCHAR(100) NOT NULL,
    "store_city" VARCHAR(100) NOT NULL,
    "approved_amount" DECIMAL(15,2),
    "interest_rate" DECIMAL(6,2),
    "processing_fee" DECIMAL(15,2),
    "processing_fee_gst" DECIMAL(15,2),
    "monthly_emi" DECIMAL(15,2),
    "rejection_reason" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "applied_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "loan_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_accounts" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_number" VARCHAR(20) NOT NULL,
    "principal_amount" DECIMAL(15,2) NOT NULL,
    "interest_rate" DECIMAL(6,2) NOT NULL,
    "tenure_months" INTEGER NOT NULL,
    "monthly_emi" DECIMAL(15,2) NOT NULL,
    "outstanding_balance" DECIMAL(15,2) NOT NULL,
    "total_interest" DECIMAL(15,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DISBURSED',
    "repayment_mode" VARCHAR(20) NOT NULL DEFAULT 'IMPS',
    "razorpay_mandate_id" VARCHAR(100),
    "disbursed_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "loan_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "underwriting_reports" (
    "id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "decision" VARCHAR(20) NOT NULL,
    "credit_score" INTEGER,
    "internal_score" INTEGER NOT NULL,
    "fraud_score" DECIMAL(5,2),
    "monthly_income" DECIMAL(15,2),
    "existing_emi_per_month" DECIMAL(15,2),
    "requested_emi" DECIMAL(15,2) NOT NULL,
    "foir" DECIMAL(6,4),
    "dti" DECIMAL(6,4),
    "rule_results" JSONB NOT NULL,
    "passed_rules" INTEGER NOT NULL,
    "failed_rules" INTEGER NOT NULL,
    "hard_fail_rules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommended_amount" DECIMAL(15,2),
    "recommended_rate" DECIMAL(6,2),
    "recommended_tenure" INTEGER,
    "max_eligible_amount" DECIMAL(15,2),
    "rejection_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "referral_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "completed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "underwriting_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emi_schedule" (
    "id" UUID NOT NULL,
    "loan_account_id" UUID NOT NULL,
    "emi_number" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "emi_amount" DECIMAL(15,2) NOT NULL,
    "principal_component" DECIMAL(15,2) NOT NULL,
    "interest_component" DECIMAL(15,2) NOT NULL,
    "outstanding_after" DECIMAL(15,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "penalty_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "bounce_count" INTEGER NOT NULL DEFAULT 0,
    "last_bounce_at" TIMESTAMPTZ,
    "next_retry_at" TIMESTAMPTZ,
    "collection_id" UUID,
    "paid_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "emi_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursements" (
    "id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "loan_account_id" UUID,
    "user_id" UUID NOT NULL,
    "beneficiary_name" VARCHAR(100) NOT NULL,
    "account_number" VARCHAR(30) NOT NULL,
    "ifsc" VARCHAR(11) NOT NULL,
    "mode" VARCHAR(20) NOT NULL,
    "principal_amount" DECIMAL(15,2) NOT NULL,
    "processing_fee" DECIMAL(15,2) NOT NULL,
    "processing_fee_gst" DECIMAL(15,2) NOT NULL,
    "net_disbursed_amount" DECIMAL(15,2) NOT NULL,
    "razorpay_payout_id" VARCHAR(100),
    "utr_number" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "failure_reason" TEXT,
    "initiated_by" UUID NOT NULL,
    "initiated_at" TIMESTAMPTZ NOT NULL,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "disbursements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "loan_account_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "emi_id" UUID,
    "payment_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "penalty_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_collected" DECIMAL(15,2) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "gateway" VARCHAR(30) NOT NULL,
    "gateway_txn_id" VARCHAR(100),
    "utr_number" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "failure_reason" TEXT,
    "failure_code" VARCHAR(50),
    "mandate_id" VARCHAR(100),
    "debit_attempt_no" INTEGER NOT NULL DEFAULT 1,
    "initiated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enach_mandates" (
    "id" UUID NOT NULL,
    "loan_account_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "razorpay_mandate_id" VARCHAR(100) NOT NULL,
    "bank_account" VARCHAR(30) NOT NULL,
    "ifsc" VARCHAR(11) NOT NULL,
    "max_amount" DECIMAL(15,2) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'CREATED',
    "registered_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "enach_mandates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_commissions" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "loan_account_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "commission_amount" DECIMAL(15,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'EARNED',
    "clawback_eligible_until" TIMESTAMPTZ NOT NULL,
    "clawback_reason" TEXT,
    "clawed_back_at" TIMESTAMPTZ,
    "payout_id" UUID,
    "earned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "agent_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_payouts" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "total_amount" DECIMAL(15,2) NOT NULL,
    "commission_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "utr_number" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "processed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commission_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_cases" (
    "id" UUID NOT NULL,
    "loan_account_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_to" UUID,
    "overdue_days" INTEGER NOT NULL,
    "overdue_amount" DECIMAL(15,2) NOT NULL,
    "penalty_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_due" DECIMAL(15,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "ptp_date" DATE,
    "ptp_amount" DECIMAL(15,2),
    "ptp_broken" BOOLEAN NOT NULL DEFAULT false,
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "close_reason" TEXT,
    "last_contact_at" TIMESTAMPTZ,
    "contact_count" INTEGER NOT NULL DEFAULT 0,
    "escalation_level" INTEGER NOT NULL DEFAULT 0,
    "escalated_at" TIMESTAMPTZ,
    "escalation_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "collection_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_logs" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "logged_by" UUID NOT NULL,
    "outcome" VARCHAR(40) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "ptp_date" DATE,
    "ptp_amount" DECIMAL(15,2),
    "payment_received" DECIMAL(15,2),
    "notes" TEXT NOT NULL,
    "contacted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" UUID NOT NULL,
    "source" VARCHAR(30) NOT NULL,
    "event" VARCHAR(100) NOT NULL,
    "gateway_event_id" VARCHAR(200),
    "status" VARCHAR(20) NOT NULL,
    "processing_ms" INTEGER NOT NULL,
    "error_message" TEXT,
    "received_at" TIMESTAMPTZ NOT NULL,
    "processed_at" TIMESTAMPTZ,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50),
    "entity_id" UUID,
    "user_id" UUID,
    "role" VARCHAR(30),
    "request_id" VARCHAR(36) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "http_method" VARCHAR(10),
    "http_path" VARCHAR(500),
    "status_code" INTEGER,
    "before_state" TEXT,
    "after_state" TEXT,
    "metadata" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "template_key" VARCHAR(60) NOT NULL,
    "channel" VARCHAR(10) NOT NULL,
    "recipient" VARCHAR(500) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "message_id" VARCHAR(100),
    "error" TEXT,
    "sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(15) NOT NULL,
    "role" VARCHAR(30) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "department" VARCHAR(100),
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "key" VARCHAR(60) NOT NULL,
    "value" VARCHAR(500) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "operational_overrides" (
    "id" UUID NOT NULL,
    "target_type" VARCHAR(50) NOT NULL,
    "target_id" VARCHAR(100) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "reason" TEXT NOT NULL,
    "performed_by" UUID NOT NULL,
    "performed_at" TIMESTAMPTZ NOT NULL,
    "metadata" TEXT,

    CONSTRAINT "operational_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_audit_log" (
    "id" UUID NOT NULL,
    "report_type" VARCHAR(60) NOT NULL,
    "format" VARCHAR(10) NOT NULL,
    "generated_by" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "row_count" INTEGER,
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_documents_user_id_key" ON "kyc_documents"("user_id");

-- CreateIndex
CREATE INDEX "kyc_documents_overall_status_idx" ON "kyc_documents"("overall_status");

-- CreateIndex
CREATE INDEX "kyc_documents_user_id_idx" ON "kyc_documents"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "agents_user_id_key" ON "agents"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "agents_agent_code_key" ON "agents"("agent_code");

-- CreateIndex
CREATE UNIQUE INDEX "agents_phone_key" ON "agents"("phone");

-- CreateIndex
CREATE INDEX "agents_status_idx" ON "agents"("status");

-- CreateIndex
CREATE INDEX "agents_shop_city_idx" ON "agents"("shop_city");

-- CreateIndex
CREATE INDEX "agents_agent_code_idx" ON "agents"("agent_code");

-- CreateIndex
CREATE INDEX "loan_applications_user_id_idx" ON "loan_applications"("user_id");

-- CreateIndex
CREATE INDEX "loan_applications_agent_id_idx" ON "loan_applications"("agent_id");

-- CreateIndex
CREATE INDEX "loan_applications_status_idx" ON "loan_applications"("status");

-- CreateIndex
CREATE INDEX "loan_applications_status_applied_at_idx" ON "loan_applications"("status", "applied_at");

-- CreateIndex
CREATE INDEX "loan_applications_agent_id_status_idx" ON "loan_applications"("agent_id", "status");

-- CreateIndex
CREATE INDEX "loan_applications_applied_at_idx" ON "loan_applications"("applied_at");

-- CreateIndex
CREATE UNIQUE INDEX "loan_accounts_application_id_key" ON "loan_accounts"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "loan_accounts_account_number_key" ON "loan_accounts"("account_number");

-- CreateIndex
CREATE INDEX "loan_accounts_user_id_idx" ON "loan_accounts"("user_id");

-- CreateIndex
CREATE INDEX "loan_accounts_status_idx" ON "loan_accounts"("status");

-- CreateIndex
CREATE INDEX "loan_accounts_account_number_idx" ON "loan_accounts"("account_number");

-- CreateIndex
CREATE INDEX "loan_accounts_razorpay_mandate_id_idx" ON "loan_accounts"("razorpay_mandate_id");

-- CreateIndex
CREATE INDEX "loan_accounts_disbursed_at_idx" ON "loan_accounts"("disbursed_at");

-- CreateIndex
CREATE INDEX "loan_accounts_status_disbursed_at_idx" ON "loan_accounts"("status", "disbursed_at");

-- CreateIndex
CREATE INDEX "underwriting_reports_loan_id_idx" ON "underwriting_reports"("loan_id");

-- CreateIndex
CREATE INDEX "underwriting_reports_decision_idx" ON "underwriting_reports"("decision");

-- CreateIndex
CREATE INDEX "underwriting_reports_loan_id_created_at_idx" ON "underwriting_reports"("loan_id", "created_at");

-- CreateIndex
CREATE INDEX "emi_schedule_loan_account_id_idx" ON "emi_schedule"("loan_account_id");

-- CreateIndex
CREATE INDEX "emi_schedule_status_idx" ON "emi_schedule"("status");

-- CreateIndex
CREATE INDEX "emi_schedule_due_date_idx" ON "emi_schedule"("due_date");

-- CreateIndex
CREATE INDEX "emi_schedule_status_due_date_idx" ON "emi_schedule"("status", "due_date");

-- CreateIndex
CREATE INDEX "emi_schedule_loan_account_id_status_idx" ON "emi_schedule"("loan_account_id", "status");

-- CreateIndex
CREATE INDEX "emi_schedule_next_retry_at_idx" ON "emi_schedule"("next_retry_at");

-- CreateIndex
CREATE UNIQUE INDEX "emi_schedule_loan_account_id_emi_number_key" ON "emi_schedule"("loan_account_id", "emi_number");

-- CreateIndex
CREATE INDEX "disbursements_loan_id_idx" ON "disbursements"("loan_id");

-- CreateIndex
CREATE INDEX "disbursements_loan_account_id_idx" ON "disbursements"("loan_account_id");

-- CreateIndex
CREATE INDEX "disbursements_status_idx" ON "disbursements"("status");

-- CreateIndex
CREATE INDEX "disbursements_razorpay_payout_id_idx" ON "disbursements"("razorpay_payout_id");

-- CreateIndex
CREATE INDEX "disbursements_initiated_at_idx" ON "disbursements"("initiated_at");

-- CreateIndex
CREATE INDEX "payments_loan_account_id_idx" ON "payments"("loan_account_id");

-- CreateIndex
CREATE INDEX "payments_emi_id_idx" ON "payments"("emi_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_gateway_txn_id_idx" ON "payments"("gateway_txn_id");

-- CreateIndex
CREATE INDEX "payments_channel_status_idx" ON "payments"("channel", "status");

-- CreateIndex
CREATE INDEX "payments_initiated_at_idx" ON "payments"("initiated_at");

-- CreateIndex
CREATE INDEX "payments_loan_account_id_status_idx" ON "payments"("loan_account_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enach_mandates_razorpay_mandate_id_key" ON "enach_mandates"("razorpay_mandate_id");

-- CreateIndex
CREATE INDEX "enach_mandates_loan_account_id_idx" ON "enach_mandates"("loan_account_id");

-- CreateIndex
CREATE INDEX "enach_mandates_status_idx" ON "enach_mandates"("status");

-- CreateIndex
CREATE INDEX "enach_mandates_razorpay_mandate_id_idx" ON "enach_mandates"("razorpay_mandate_id");

-- CreateIndex
CREATE INDEX "agent_commissions_agent_id_idx" ON "agent_commissions"("agent_id");

-- CreateIndex
CREATE INDEX "agent_commissions_loan_account_id_idx" ON "agent_commissions"("loan_account_id");

-- CreateIndex
CREATE INDEX "agent_commissions_status_idx" ON "agent_commissions"("status");

-- CreateIndex
CREATE INDEX "agent_commissions_agent_id_status_idx" ON "agent_commissions"("agent_id", "status");

-- CreateIndex
CREATE INDEX "agent_commissions_clawback_eligible_until_idx" ON "agent_commissions"("clawback_eligible_until");

-- CreateIndex
CREATE INDEX "commission_payouts_agent_id_idx" ON "commission_payouts"("agent_id");

-- CreateIndex
CREATE INDEX "commission_payouts_status_idx" ON "commission_payouts"("status");

-- CreateIndex
CREATE INDEX "collection_cases_loan_account_id_idx" ON "collection_cases"("loan_account_id");

-- CreateIndex
CREATE INDEX "collection_cases_status_idx" ON "collection_cases"("status");

-- CreateIndex
CREATE INDEX "collection_cases_assigned_to_idx" ON "collection_cases"("assigned_to");

-- CreateIndex
CREATE INDEX "collection_cases_overdue_days_idx" ON "collection_cases"("overdue_days");

-- CreateIndex
CREATE INDEX "collection_cases_status_overdue_days_idx" ON "collection_cases"("status", "overdue_days");

-- CreateIndex
CREATE INDEX "collection_cases_ptp_date_idx" ON "collection_cases"("ptp_date");

-- CreateIndex
CREATE INDEX "collection_cases_opened_at_idx" ON "collection_cases"("opened_at");

-- CreateIndex
CREATE INDEX "contact_logs_case_id_idx" ON "contact_logs"("case_id");

-- CreateIndex
CREATE INDEX "contact_logs_logged_by_idx" ON "contact_logs"("logged_by");

-- CreateIndex
CREATE INDEX "contact_logs_contacted_at_idx" ON "contact_logs"("contacted_at");

-- CreateIndex
CREATE INDEX "contact_logs_case_id_contacted_at_idx" ON "contact_logs"("case_id", "contacted_at");

-- CreateIndex
CREATE INDEX "webhook_logs_gateway_event_id_idx" ON "webhook_logs"("gateway_event_id");

-- CreateIndex
CREATE INDEX "webhook_logs_source_gateway_event_id_idx" ON "webhook_logs"("source", "gateway_event_id");

-- CreateIndex
CREATE INDEX "webhook_logs_status_received_at_idx" ON "webhook_logs"("status", "received_at");

-- CreateIndex
CREATE INDEX "webhook_logs_received_at_idx" ON "webhook_logs"("received_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "notification_deliveries_template_key_created_at_idx" ON "notification_deliveries"("template_key", "created_at");

-- CreateIndex
CREATE INDEX "notification_deliveries_channel_status_idx" ON "notification_deliveries"("channel", "status");

-- CreateIndex
CREATE INDEX "notification_deliveries_created_at_idx" ON "notification_deliveries"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_phone_key" ON "admin_users"("phone");

-- CreateIndex
CREATE INDEX "admin_users_role_status_idx" ON "admin_users"("role", "status");

-- CreateIndex
CREATE INDEX "admin_users_email_idx" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "operational_overrides_target_type_target_id_idx" ON "operational_overrides"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "operational_overrides_performed_by_idx" ON "operational_overrides"("performed_by");

-- CreateIndex
CREATE INDEX "operational_overrides_performed_at_idx" ON "operational_overrides"("performed_at");

-- CreateIndex
CREATE INDEX "report_audit_log_report_type_generated_at_idx" ON "report_audit_log"("report_type", "generated_at");

-- CreateIndex
CREATE INDEX "report_audit_log_generated_by_idx" ON "report_audit_log"("generated_by");

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_accounts" ADD CONSTRAINT "loan_accounts_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_accounts" ADD CONSTRAINT "loan_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "underwriting_reports" ADD CONSTRAINT "underwriting_reports_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emi_schedule" ADD CONSTRAINT "emi_schedule_loan_account_id_fkey" FOREIGN KEY ("loan_account_id") REFERENCES "loan_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_loan_account_id_fkey" FOREIGN KEY ("loan_account_id") REFERENCES "loan_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_loan_account_id_fkey" FOREIGN KEY ("loan_account_id") REFERENCES "loan_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_emi_id_fkey" FOREIGN KEY ("emi_id") REFERENCES "emi_schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enach_mandates" ADD CONSTRAINT "enach_mandates_loan_account_id_fkey" FOREIGN KEY ("loan_account_id") REFERENCES "loan_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_loan_account_id_fkey" FOREIGN KEY ("loan_account_id") REFERENCES "loan_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commissions" ADD CONSTRAINT "agent_commissions_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "commission_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_cases" ADD CONSTRAINT "collection_cases_loan_account_id_fkey" FOREIGN KEY ("loan_account_id") REFERENCES "loan_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_cases" ADD CONSTRAINT "collection_cases_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_logs" ADD CONSTRAINT "contact_logs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "collection_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
