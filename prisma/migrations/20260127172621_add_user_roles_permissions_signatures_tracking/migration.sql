-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SALES_MANAGER', 'SALES_REP', 'FABRICATOR', 'READ_ONLY', 'CUSTOM', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('MANAGE_USERS', 'VIEW_USERS', 'MANAGE_CUSTOMERS', 'VIEW_CUSTOMERS', 'CREATE_QUOTES', 'EDIT_QUOTES', 'DELETE_QUOTES', 'VIEW_ALL_QUOTES', 'VIEW_OWN_QUOTES', 'APPROVE_QUOTES', 'MANAGE_MATERIALS', 'VIEW_MATERIALS', 'MANAGE_PRICING', 'VIEW_PRICING', 'RUN_OPTIMIZATION', 'VIEW_OPTIMIZATION', 'EXPORT_CUTLISTS', 'VIEW_REPORTS', 'EXPORT_DATA', 'MANAGE_SETTINGS', 'VIEW_AUDIT_LOGS');

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "calculated_at" TIMESTAMP(3),
ADD COLUMN     "calculated_total" DECIMAL(10,2),
ADD COLUMN     "calculation_breakdown" JSONB;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "customer_id" INTEGER,
ADD COLUMN     "invited_at" TIMESTAMP(3),
ADD COLUMN     "invited_by" INTEGER,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "last_active_at" TIMESTAMP(3),
ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'SALES_REP';

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "permission" "Permission" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_views" (
    "id" SERIAL NOT NULL,
    "quote_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "quote_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_signatures" (
    "id" SERIAL NOT NULL,
    "quote_id" INTEGER NOT NULL,
    "signer_name" TEXT NOT NULL,
    "signer_email" TEXT NOT NULL,
    "signer_title" TEXT,
    "signer_user_id" INTEGER,
    "signature_method" TEXT NOT NULL,
    "signature_data" TEXT NOT NULL,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "document_hash" TEXT NOT NULL,
    "document_version" TEXT NOT NULL,
    "signed_pdf_path" TEXT,

    CONSTRAINT "quote_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "changes" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_user_id_permission_key" ON "user_permissions"("user_id", "permission");

-- CreateIndex
CREATE INDEX "quote_views_quote_id_idx" ON "quote_views"("quote_id");

-- CreateIndex
CREATE INDEX "quote_views_user_id_idx" ON "quote_views"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_signatures_quote_id_key" ON "quote_signatures"("quote_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_views" ADD CONSTRAINT "quote_views_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_views" ADD CONSTRAINT "quote_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_signatures" ADD CONSTRAINT "quote_signatures_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
