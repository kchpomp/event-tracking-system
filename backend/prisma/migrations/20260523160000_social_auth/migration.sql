-- AlterTable
ALTER TABLE "users" ADD COLUMN     "apple_subject" TEXT,
ADD COLUMN     "google_subject" TEXT,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_apple_subject_key" ON "users"("apple_subject");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_subject_key" ON "users"("google_subject");
