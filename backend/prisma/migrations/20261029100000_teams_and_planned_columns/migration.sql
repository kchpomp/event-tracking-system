-- AlterEnum
ALTER TYPE "activity_action" ADD VALUE 'team_bonus';

-- AlterTable: the guest list gets its five columns. Rows loaded before keep their name: the first
-- word becomes the first name and the rest the last name (the photo match ignores the order).
ALTER TABLE "planned_participants"
ADD COLUMN     "city" VARCHAR(100),
ADD COLUMN     "department" VARCHAR(100),
ADD COLUMN     "first_name" VARCHAR(100),
ADD COLUMN     "last_name" VARCHAR(100);

UPDATE "planned_participants"
SET "first_name" = left(split_part(btrim("full_name"), ' ', 1), 100),
    "last_name" = left(NULLIF(btrim(substr(btrim("full_name"), length(split_part(btrim("full_name"), ' ', 1)) + 1)), ''), 100)
WHERE "full_name" IS NOT NULL AND btrim("full_name") <> '';

ALTER TABLE "planned_participants" DROP COLUMN "full_name";

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "team_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "teams_name_key" ON "teams"("name");

-- CreateIndex
CREATE INDEX "users_team_id_idx" ON "users"("team_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
