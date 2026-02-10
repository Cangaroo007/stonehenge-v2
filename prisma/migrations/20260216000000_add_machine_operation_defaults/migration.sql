-- CreateEnum: OperationType for machine-operation mapping
CREATE TYPE "OperationType" AS ENUM ('INITIAL_CUT', 'EDGE_POLISHING', 'MITRING', 'LAMINATION', 'CUTOUT');

-- CreateTable: machine_operation_defaults
CREATE TABLE "machine_operation_defaults" (
    "id" TEXT NOT NULL,
    "operation_type" "OperationType" NOT NULL,
    "machine_id" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_operation_defaults_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique operation_type per row
CREATE UNIQUE INDEX "machine_operation_defaults_operation_type_key" ON "machine_operation_defaults"("operation_type");

-- AddForeignKey: machine_operation_defaults → machine_profiles
ALTER TABLE "machine_operation_defaults" ADD CONSTRAINT "machine_operation_defaults_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machine_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
