-- CreateEnum
CREATE TYPE "push_token_platform" AS ENUM ('android', 'ios');

-- CreateEnum
CREATE TYPE "push_notification_outbox_status" AS ENUM ('pending', 'processing', 'sent', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "push_delivery_status" AS ENUM ('pending', 'sent', 'delivered', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "expo_push_token" TEXT NOT NULL,
    "platform" "push_token_platform",
    "device_id" TEXT,
    "disabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_notification_outbox" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "status" "push_notification_outbox_status" NOT NULL DEFAULT 'pending',
    "scheduled_for" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_deliveries" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "outbox_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "push_token_id" UUID,
    "expo_push_token" TEXT,
    "status" "push_delivery_status" NOT NULL DEFAULT 'pending',
    "ticket_id" TEXT,
    "provider_status" TEXT,
    "provider_error_code" TEXT,
    "error_message" TEXT,
    "receipt_check_attempts" INTEGER NOT NULL DEFAULT 0,
    "receipt_next_check_at" TIMESTAMP(3),
    "receipt_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_expo_push_token_key" ON "push_tokens"("expo_push_token");

-- CreateIndex
CREATE INDEX "push_tokens_user_id_disabled_at_idx" ON "push_tokens"("user_id", "disabled_at");

-- CreateIndex
CREATE INDEX "push_notification_outbox_status_scheduled_for_idx" ON "push_notification_outbox"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "push_notification_outbox_user_id_idx" ON "push_notification_outbox"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_notification_outbox_user_id_dedupe_key_key" ON "push_notification_outbox"("user_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "push_deliveries_ticket_id_status_idx" ON "push_deliveries"("ticket_id", "status");

-- CreateIndex
CREATE INDEX "push_deliveries_status_receipt_next_check_at_idx" ON "push_deliveries"("status", "receipt_next_check_at");

-- CreateIndex
CREATE INDEX "push_deliveries_user_id_created_at_idx" ON "push_deliveries"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_deliveries_outbox_id_push_token_id_key" ON "push_deliveries"("outbox_id", "push_token_id");

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_notification_outbox" ADD CONSTRAINT "push_notification_outbox_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_outbox_id_fkey" FOREIGN KEY ("outbox_id") REFERENCES "push_notification_outbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
