/*
  Warnings:

  - You are about to drop the column `apple_subject` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `google_subject` on the `users` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "users_apple_subject_key";

-- DropIndex
DROP INDEX "users_google_subject_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "apple_subject",
DROP COLUMN "google_subject",
ALTER COLUMN "personal_qr_token" SET DEFAULT gen_random_uuid()::text;
