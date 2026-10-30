-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "starts_at" TIMESTAMPTZ(3),
ADD COLUMN     "ends_at" TIMESTAMPTZ(3);

-- A slot has both times or neither, and ends after it starts. Prisma does not model CHECKs.
ALTER TABLE "teams" ADD CONSTRAINT "teams_schedule_check"
CHECK (("starts_at" IS NULL AND "ends_at" IS NULL) OR ("starts_at" IS NOT NULL AND "ends_at" IS NOT NULL AND "ends_at" > "starts_at"));
