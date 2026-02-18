-- CreateTable
CREATE TABLE "custom_room_presets" (
    "id" TEXT NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "description" TEXT,
    "piece_config" JSONB NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 1,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_room_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_room_presets_company_id_usage_count_idx" ON "custom_room_presets"("company_id", "usage_count" DESC);

-- CreateIndex
CREATE INDEX "custom_room_presets_company_id_name_idx" ON "custom_room_presets"("company_id", "name");

-- AddForeignKey
ALTER TABLE "custom_room_presets" ADD CONSTRAINT "custom_room_presets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
