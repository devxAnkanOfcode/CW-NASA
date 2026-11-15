-- AlterTable
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'grower';

-- CreateTable
CREATE TABLE "farms" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "farms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "farms_user_id_idx" ON "farms"("user_id");

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
