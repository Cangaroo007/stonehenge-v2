-- CreateTable
CREATE TABLE "edge_profile_templates" (
    "id" TEXT NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "edge_top" TEXT,
    "edge_bottom" TEXT,
    "edge_left" TEXT,
    "edge_right" TEXT,
    "is_built_in" BOOLEAN NOT NULL DEFAULT false,
    "is_shared" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" INTEGER,
    "suggested_piece_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edge_profile_templates_pkey" PRIMARY KEY ("id")
);
