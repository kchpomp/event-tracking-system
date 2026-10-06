-- CreateEnum
CREATE TYPE "activity_action" AS ENUM ('station_scan', 'polymer', 'connection', 'idea');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "city" VARCHAR(100),
ADD COLUMN     "company" VARCHAR(100),
ADD COLUMN     "consented_at" TIMESTAMP(3),
ADD COLUMN     "first_name" VARCHAR(100),
ADD COLUMN     "last_name" VARCHAR(100),
ADD COLUMN     "personal_qr_token" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "event_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "qr_token" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_group" TEXT,
    "success_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "station_visits" (
    "participant_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,

    CONSTRAINT "station_visits_pkey" PRIMARY KEY ("participant_id","station_id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "participant_id" UUID NOT NULL,
    "action_type" "activity_action" NOT NULL,
    "points_awarded" INTEGER NOT NULL,
    "ref_id" UUID NOT NULL,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connections" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "participant_a" UUID NOT NULL,
    "participant_b" UUID NOT NULL,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ideas" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "author_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "expected_result" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ideas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stations_qr_token_key" ON "stations"("qr_token");

-- CreateIndex
CREATE INDEX "stations_event_id_idx" ON "stations"("event_id");

-- CreateIndex
CREATE INDEX "station_visits_station_id_idx" ON "station_visits"("station_id");

-- CreateIndex
CREATE INDEX "activity_log_participant_id_idx" ON "activity_log"("participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_log_once_per_ref" ON "activity_log"("participant_id", "action_type", "ref_id");

-- CreateIndex
CREATE INDEX "connections_participant_b_idx" ON "connections"("participant_b");

-- CreateIndex
CREATE UNIQUE INDEX "connections_pair_key" ON "connections"("participant_a", "participant_b");

-- CreateIndex
CREATE INDEX "ideas_author_id_idx" ON "ideas"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_personal_qr_token_key" ON "users"("personal_qr_token");

-- AddForeignKey
ALTER TABLE "stations" ADD CONSTRAINT "stations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_visits" ADD CONSTRAINT "station_visits_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_visits" ADD CONSTRAINT "station_visits_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_participant_a_fkey" FOREIGN KEY ("participant_a") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_participant_b_fkey" FOREIGN KEY ("participant_b") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
