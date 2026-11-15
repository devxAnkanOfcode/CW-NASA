-- AlterTable
ALTER TABLE "farms" ADD COLUMN     "location" VARCHAR(255),
ADD COLUMN     "operator" VARCHAR(120);

-- AlterTable
ALTER TABLE "user_sessions" ALTER COLUMN "sess" SET DATA TYPE JSONB;

-- CreateTable
CREATE TABLE "parcels" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "crop" VARCHAR(100) NOT NULL,
    "acres" DOUBLE PRECISION NOT NULL,
    "location" VARCHAR(255),
    "irrigation" VARCHAR(100),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "stage" VARCHAR(100),
    "soil_type" VARCHAR(100),
    "farm_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "parcels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parcels_farm_id_idx" ON "parcels"("farm_id");

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
