-- AlterTable: Add new fields to quote_templates for section configuration and branding overrides
ALTER TABLE "quote_templates" ADD COLUMN "description" TEXT;
ALTER TABLE "quote_templates" ADD COLUMN "format_type" TEXT NOT NULL DEFAULT 'COMPREHENSIVE';
ALTER TABLE "quote_templates" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "quote_templates" ADD COLUMN "sections_config" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "quote_templates" ADD COLUMN "custom_intro_text" TEXT;
ALTER TABLE "quote_templates" ADD COLUMN "custom_primary_colour" TEXT;
ALTER TABLE "quote_templates" ADD COLUMN "custom_accent_colour" TEXT;
ALTER TABLE "quote_templates" ADD COLUMN "show_logo" BOOLEAN NOT NULL DEFAULT true;
