-- AlterTable
ALTER TABLE "planned_participants" ADD COLUMN     "photo_byte_size" INTEGER,
ADD COLUMN     "photo_content_type" TEXT,
ADD COLUMN     "photo_object_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "planned_participants_photo_object_key_key" ON "planned_participants"("photo_object_key");

