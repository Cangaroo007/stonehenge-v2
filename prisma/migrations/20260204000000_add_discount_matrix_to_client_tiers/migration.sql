-- AlterTable
-- Add discount_matrix JSON field to client_tiers table
ALTER TABLE "client_tiers" ADD COLUMN "discount_matrix" JSONB;
