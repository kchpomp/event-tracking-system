-- Administrators can close new sign-ups; existing events keep accepting them.
ALTER TABLE "events" ADD COLUMN "registration_open" BOOLEAN NOT NULL DEFAULT true;
