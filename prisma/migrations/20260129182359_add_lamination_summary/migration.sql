-- CreateEnum
CREATE TYPE "CustomerUserRole" AS ENUM ('CUSTOMER_ADMIN', 'CUSTOMER_APPROVER', 'CUSTOMER_VIEWER', 'CUSTOM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Permission" ADD VALUE 'UPLOAD_FILES';
ALTER TYPE "Permission" ADD VALUE 'MANAGE_CUSTOMER_USERS';
ALTER TYPE "Permission" ADD VALUE 'DOWNLOAD_QUOTES';
ALTER TYPE "Permission" ADD VALUE 'VIEW_PROJECT_UPDATES';

-- AlterTable
ALTER TABLE "slab_optimizations" ADD COLUMN     "laminationSummary" JSONB;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "customer_user_role" "CustomerUserRole";

-- AddForeignKey
ALTER TABLE "quote_signatures" ADD CONSTRAINT "quote_signatures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
