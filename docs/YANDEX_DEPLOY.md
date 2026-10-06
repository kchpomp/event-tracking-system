# Деплой в Yandex Cloud: команды по порядку

Команды запускайте в PowerShell из корня репозитория. **Пока идёт деплой, VPN должен быть выключен**: через него API Yandex Cloud и реестр образов то доступны, то нет, и команды обрываются по таймауту.

> **Срок.** Образы хранятся в Yandex Container Registry. По [странице закрытия сервиса](https://yandex.cloud/ru/docs/container-registry/sunset): с 13 октября 2026 новые продажи прекращены, с 10 ноября только чтение (выпустить обновление нельзя), 14 декабря полная остановка. Разверните проект до 13 октября, сделайте все релизы до 10 ноября и до закрытия перенесите каталог по [руководству Yandex](https://yandex.cloud/ru/docs/container-registry/tutorials/container-registry-migration) (адреса `cr.yandex/...` сохраняются).

## Ваши значения

| Что | Значение |
| --- | --- |
| Домен | `формула-будущего.рф` |
| Он же для Yandex Cloud и Terraform (латиницей) | `xn----7sbeieg1bhrin1bebe5g.xn--p1ai` |
| Приложение, API, сайт | `app.`, `api.`, `www.` + домен выше |

## Шаг 1. В консоли Yandex Cloud (в браузере, https://console.yandex.cloud)

1. **Биллинг:** создайте платёжный аккаунт (карта российского банка) и пополните баланс.
2. **Каталог:** создайте каталог `event-tracking-system`.
3. **Cloud DNS → Создать зону:** зона `xn----7sbeieg1bhrin1bebe5g.xn--p1ai.` (с точкой на конце), тип «Публичная». У регистратора домена в DNS-серверах укажите `ns1.yandexcloud.net` и `ns2.yandexcloud.net`. Проверка (в ответе должны быть оба сервера):

```powershell
nslookup -type=NS xn----7sbeieg1bhrin1bebe5g.xn--p1ai 8.8.8.8
```

4. **Certificate Manager → Добавить сертификат → Let's Encrypt:** три сертификата, по одному домену в каждом: `api.xn----7sbeieg1bhrin1bebe5g.xn--p1ai`, `app.xn----7sbeieg1bhrin1bebe5g.xn--p1ai`, `www.xn----7sbeieg1bhrin1bebe5g.xn--p1ai`. Тип проверки DNS (CNAME): запись `_acme-challenge` создайте в зоне кнопкой рядом с проверкой или вручную (тип CNAME, имя и значение с экрана). Дождитесь статуса **Issued** у всех трёх.
5. **Postbox → Создать адрес** для домена `xn----7sbeieg1bhrin1bebe5g.xn--p1ai`, простая настройка DKIM; записи, которые покажет консоль, создайте в зоне. Дождитесь статуса **Success**. Если Postbox не принимает такой домен, пропустите шаг и добавьте ключ `-NoMail` на шаге 4 (сброс пароля по почте тогда работать не будет).

## Шаг 2. Программы (один раз)

Нужны Bun, Docker Desktop и Git (они уже есть). Остальное:

```powershell
# Yandex Cloud CLI (на вопрос о PATH ответьте Y)
Invoke-Expression (New-Object System.Net.WebClient).DownloadString('https://storage.yandexcloud.net/yandexcloud-yc/install.ps1')

# AWS CLI без прав администратора
Invoke-WebRequest https://awscli.amazonaws.com/AWSCLIV2.msi -OutFile "$env:TEMP\AWSCLIV2.msi"
msiexec /a "$env:TEMP\AWSCLIV2.msi" /qn TARGETDIR="$env:USERPROFILE\tools\awscli"

# Terraform: скачайте архив terraform_<версия>_windows_amd64.zip (версия от 1.15 до 1.x)
# со страницы https://hashicorp-releases.yandexcloud.net/terraform/ в папку Загрузки, затем:
New-Item -ItemType Directory -Force C:\tools\terraform
Expand-Archive "$env:USERPROFILE\Downloads\terraform_1.16.5_windows_amd64.zip" C:\tools\terraform -Force
```

Пути к этим программам скрипты ниже добавляют в `PATH` сами.

## Шаг 3. Вход в Yandex Cloud (один раз)

Откроется браузер: войдите в аккаунт Яндекса, выберите ваше облако и каталог `event-tracking-system`, зону `ru-central1-a`.

```powershell
yc init
yc config list
```

## Шаг 4. Подготовка (один раз)

Скрипт сам находит в вашем облаке зону DNS и сертификаты, создаёт оба файла `terraform.tfvars`, секреты (три пароля базы и JWT-секрет), скачивает провайдер Terraform и спрашивает домен, email и пароль администратора (от 12 символов, латиницей):

```powershell
.\scripts\deploy-setup.ps1
```

На вопрос о домене введите `формула-будущего.рф`. Без почты: `.\scripts\deploy-setup.ps1 -NoMail`. Скрипт безопасно запускать повторно, существующие файлы он не меняет.

**Сохраните копию файла `C:\Users\<вы>\.etsys\secrets.ps1` в менеджере паролей.** Менять эти значения после первого деплоя нельзя.

## Шаг 5. Код в GitHub

Релиз собирается из запушенной ветки `main` и требует чистого рабочего дерева:

```bash
git add -A
git commit -m "Подготовка к деплою"
git push
git status
```

`git status` должен показать «nothing to commit, working tree clean».

## Шаг 6. Запуск

В **каждом новом окне** PowerShell сначала подключите окружение (первый релиз с ключом `-WithAdmin`, он задаёт администратора):

```powershell
cd "D:\Projects\Event Station Tracker YandexCloud"
. .\scripts\deploy-env.ps1 -WithAdmin
```

Команды по порядку (сначала `--dry-run`, потом настоящая). Если команда оборвалась, прочитайте ошибку и запустите её ещё раз: повтор безопасен.

```powershell
bun run infra:bootstrap -- yandex --new --dry-run
bun run infra:bootstrap -- yandex --new
```

Создаёт хранилище состояния Terraform и файл `infra\yandex\.env.terraform-state`. **Сохраните его копию в менеджере паролей.**

```powershell
bun run infra:apply -- yandex --dry-run
bun run infra:apply -- yandex
```

Создаёт сеть, базу PostgreSQL (15-20 минут), реестр, бакеты, Lockbox, DNS-записи. С этого момента начинаются списания.

```powershell
bun run release -- yandex --dry-run
bun run release -- yandex
```

Собирает образ, запускает миграции, создаёт администратора и мероприятие с 15 станциями, выкладывает приложение и сайт. Администратор создаётся только первым релизом: следующие релизы запускайте **без** `-WithAdmin`.

## Шаг 7. Проверка

1. `https://api.xn----7sbeieg1bhrin1bebe5g.xn--p1ai/health/ready` отвечает 200.
2. `https://app.xn----7sbeieg1bhrin1bebe5g.xn--p1ai` открывается; войдите email и паролем администратора.
3. `/admin/users`: хостес сначала сама регистрируется на `/signup`, затем выберите ей роль «Хостес».
4. `/admin/stations`: распечатайте QR станций и проверьте каждый телефоном.
5. Пароль администратора меняется только через «Забыли пароль?» (нужна почта): выйдите и пройдите эту ссылку.
6. При первом открытии сайта внизу виден баннер про cookie; на `/privacy` открывается Политика конфиденциальности. Её текст и текст согласия пока шаблоны с пустыми реквизитами: до мероприятия заполните и покажите юристу файлы `webapp/src/features/auth/consent-text.ts` и `privacy-text.ts`, затем сделайте релиз ([YANDEX_UPDATE.md](YANDEX_UPDATE.md)).

## Если ошибка

| Ошибка | Что делать |
| --- | --- |
| `i/o timeout`, `DeadlineExceeded`, `dial tcp` к `api.cloud.yandex.net`, `iam...`, `cr.yandex` | Выключите VPN. Проверка: `Test-NetConnection api.cloud.yandex.net -Port 443` должна дать `TcpTestSucceeded : True` |
| `Failed to install provider`, `Invalid provider registry host` | Не подключено окружение или провайдер не скачан: в этом окне выполните `. .\scripts\deploy-env.ps1`, при необходимости `.\scripts\deploy-setup.ps1` (скачает провайдер) |
| `Unauthenticated`, `token expired` | Токен живёт 12 часов: снова `. .\scripts\deploy-env.ps1` |
| В `deploy-setup.ps1` «нет зоны» или «нет сертификата» | Шаг 1 не закончен: зона DNS или сертификаты не созданы, или сертификат ещё не `ISSUED` |
| Релиз: рабочее дерево не чистое | `git add -A`, коммит, `git push` (в том числе обновлённые `.terraform.lock.hcl`) |
| `BucketAlreadyExists` | Имя бакета занято: в `infra\yandex\production\terraform.tfvars` (`media_bucket_name`) или `infra\yandex\bootstrap\terraform.tfvars` (`state_bucket_name`) допишите к имени несколько цифр и повторите команду |
| Письма не приходят | Адрес в Postbox не в статусе Success, либо запустите setup с `-NoMail` |
| Docker не отвечает | Запустите Docker Desktop |

## Репетиция перед мероприятием

С двумя-тремя телефонами (iPhone Safari, Android Chrome): регистрация (обе галочки), вход, «Забыли пароль?»; сканирование станции камерой; «Диффузия» между двумя участниками; «Колба идей»; хостес находит участника и начисляет баллы; администратор закрывает и снова открывает мероприятие на `/admin/stations`. Оповещения в Monitoring: [YANDEX_CLOUD.md](YANDEX_CLOUD.md#alerts). Нагрузка, обновления и откат: [YANDEX_UPDATE.md](YANDEX_UPDATE.md).

## Сколько это стоит

База PostgreSQL платная круглосуточно (цену хоста `s3-c2-m8` и диска смотрите в калькуляторе Yandex Cloud). По данным документации, с НДС: Serverless Containers 18,97 ₽ за млн вызовов (бесплатно 1 млн), API Gateway 142,3 ₽ за млн запросов (бесплатно 100 тысяч), Postbox 2 000 писем в месяц бесплатно, дальше 80,32 ₽ за 1 000, Lockbox около 20 ₽ в месяц за версию секрета. Сертификаты отдельно не тарифицируются.
