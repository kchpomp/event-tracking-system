-- The first list of cities (migration 20261010100000) was written from memory and three entries did
-- not hold up against public sources: Новокуйбышевск belongs to Rosneft, and no SIBUR site was found
-- in Санкт-Петербург or Тюмень. Replace those by id, so a database that already has the earlier
-- list ends up with the same ten cities as a fresh one.
--   Нижневартовск: Белозерный ГПК and Нижневартовский ГПЗ (Юграгазпереработка)
--   Губкинский:    Губкинский ГПЗ (СибурТюменьГаз)
--   Дзержинск:     СИБУР-Нефтехим
--   Кстово:        СИБУР-Кстово
--   Северск:       Томскнефтехим (the plant is in Северск, not in the city of Томск)
UPDATE "cities" SET "name" = 'Кстово'        WHERE "id" = '01990000-0000-7000-8000-000000000202';
UPDATE "cities" SET "name" = 'Нижневартовск' WHERE "id" = '01990000-0000-7000-8000-000000000203';
UPDATE "cities" SET "name" = 'Северск'       WHERE "id" = '01990000-0000-7000-8000-000000000206';
UPDATE "cities" SET "name" = 'Губкинский'    WHERE "id" = '01990000-0000-7000-8000-000000000209';
UPDATE "cities" SET "name" = 'Дзержинск'     WHERE "id" = '01990000-0000-7000-8000-000000000210';
