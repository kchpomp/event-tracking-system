-- AlterEnum
ALTER TYPE "user_role" ADD VALUE 'hostess';

-- AlterTable
ALTER TABLE "activity_log" ADD COLUMN     "awarded_by_id" UUID;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_awarded_by_id_fkey" FOREIGN KEY ("awarded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
