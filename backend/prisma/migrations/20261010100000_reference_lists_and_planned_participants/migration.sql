-- Reference lists for the sign-up form: users keep ids, the names live in two small tables.
CREATE TABLE "companies" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cities" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "companies_name_key" ON "companies"("name");
CREATE UNIQUE INDEX "cities_name_key" ON "cities"("name");

-- Test data until the real lists exist: ten enterprises and ten cities with SIBUR offices.
-- The ids are fixed (…0001NN companies, …0002NN cities) so tests and fixtures can name them.
INSERT INTO "companies" ("id", "name", "sort_order")
SELECT ('01990000-0000-7000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'Предприятие ' || n, n
FROM generate_series(1, 10) AS n;

INSERT INTO "cities" ("id", "name", "sort_order")
SELECT ('01990000-0000-7000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid, name, n
FROM unnest(ARRAY[
  'Москва', 'Санкт-Петербург', 'Тюмень', 'Тобольск', 'Пермь',
  'Томск', 'Воронеж', 'Тольятти', 'Новокуйбышевск', 'Нижний Новгород'
]) WITH ORDINALITY AS t(name, n);

-- Free text typed so far must not be lost: any value not in the lists becomes a row after them.
INSERT INTO "companies" ("name", "sort_order")
SELECT DISTINCT btrim("company"), 100 FROM "users"
WHERE "company" IS NOT NULL AND btrim("company") <> ''
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "cities" ("name", "sort_order")
SELECT DISTINCT btrim("city"), 100 FROM "users"
WHERE "city" IS NOT NULL AND btrim("city") <> ''
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "users" ADD COLUMN "company_id" UUID, ADD COLUMN "city_id" UUID;

UPDATE "users" u SET "company_id" = c."id" FROM "companies" c WHERE c."name" = btrim(u."company");
UPDATE "users" u SET "city_id" = c."id" FROM "cities" c WHERE c."name" = btrim(u."city");

ALTER TABLE "users" DROP COLUMN "company", DROP COLUMN "city";

CREATE INDEX "users_company_id_idx" ON "users"("company_id");
CREATE INDEX "users_city_id_idx" ON "users"("city_id");

ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_city_id_fkey"
  FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The expected guest list. No foreign key to users: it is matched by email.
CREATE TABLE "planned_participants" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email" VARCHAR(254) NOT NULL,
    "full_name" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planned_participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "planned_participants_email_key" ON "planned_participants"("email");
