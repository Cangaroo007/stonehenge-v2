-- CreateTable
CREATE TABLE "machine_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kerf_width_mm" INTEGER NOT NULL DEFAULT 8,
    "max_slab_length_mm" INTEGER,
    "max_slab_width_mm" INTEGER,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "machine_profiles_name_key" ON "machine_profiles"("name");

-- Insert default GMM Bridge Saw
INSERT INTO "machine_profiles" ("id", "name", "kerf_width_mm", "max_slab_length_mm", "max_slab_width_mm", "is_default", "is_active", "created_at", "updated_at")
VALUES (
    'cm' || substr(md5(random()::text), 1, 24),
    'GMM Bridge Saw',
    8,
    3200,
    1600,
    true,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
