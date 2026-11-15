-- Create session table before modifying it
CREATE TABLE IF NOT EXISTS "user_sessions" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire"
ON "user_sessions"("expire");

-- Add farm columns safely (they may already exist)
ALTER TABLE "farms"
ADD COLUMN IF NOT EXISTS "location" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "operator" VARCHAR(120);

-- Convert session data to JSONB
ALTER TABLE "user_sessions"
ALTER COLUMN "sess" SET DATA TYPE JSONB
USING "sess"::JSONB;

-- Create parcels table
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

CREATE INDEX "parcels_farm_id_idx"
ON "parcels"("farm_id");

ALTER TABLE "parcels"
ADD CONSTRAINT "parcels_farm_id_fkey"
FOREIGN KEY ("farm_id") REFERENCES "farms"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
