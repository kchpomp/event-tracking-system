-- AlterTable
ALTER TABLE "events" ADD COLUMN     "live_override" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "live_team_id" UUID;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_live_team_id_fkey" FOREIGN KEY ("live_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
