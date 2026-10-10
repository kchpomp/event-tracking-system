-- The expected list is split in two: participants and hostesses are counted and exported apart.
CREATE TYPE "planned_kind" AS ENUM ('participant', 'hostess');

ALTER TABLE "planned_participants" ADD COLUMN "kind" "planned_kind" NOT NULL DEFAULT 'participant';
