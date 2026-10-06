# Деплой в Yandex Cloud: пошаговый гайд для владельца

Что нужно сделать руками, чтобы сайт заработал на ваших адресах вместе с базой данных. Справочники для разработчиков: [DEPLOYMENT.md](DEPLOYMENT.md), [YANDEX_CLOUD.md](YANDEX_CLOUD.md). Все команды ниже для PowerShell, из корня репозитория, если не сказано иное.

## 0. Что делаете вы и что делает Terraform

| Вы делаете руками | Terraform и `release` делают сами |
| --- | --- |
| Аккаунт и платёжный аккаунт Yandex Cloud, облако и каталог | Сеть, **базу PostgreSQL 18**, реестр образов, логи |
| Домен и DNS-зона, три сертификата | API (Serverless Container + API Gateway), задачи по расписанию |
| Адрес отправителя в Postbox (если нужна почта) | Три бакета (приложение, сайт, медиа), сервисные аккаунты, Lockbox |
| Файлы `terraform.tfvars`, пароли и ключи в переменных окружения | DNS-записи на три адреса, ключ Postbox в Lockbox |
| Публикация кода в GitHub, запуск команд | Миграции базы, первое мероприятие с 15 станциями, сборка и выкладка сайтов |

Базу данных вручную создавать не нужно. Время: сам деплой около 40 минут, но делегирование домена может занять до суток, поэтому начните с шага 2.

## 1. Аккаунт, облако, каталог, `cloud_id` и `folder_id`

1. Откройте https://console.yandex.cloud и войдите (или создайте) аккаунт Яндекса.
2. Создайте **платёжный аккаунт** (раздел «Биллинг»): без него база и контейнеры не создадутся. Данные карты или реквизиты юрлица вводите только сами.
3. Создайте **облако** (если его нет). Внутри облака создайте **каталог** с именем `event-tracking-system`: все ресурсы проекта будут в нём.
4. Возьмите идентификаторы:
   - **`cloud_id`**: консоль, список облаков (колонка ID) или страница облака;
   - **`folder_id`**: откройте каталог, ID виден под его названием вверху, а также в адресе `console.yandex.cloud/folders/<folder_id>`.

   Либо командой (после шага 5): `yc resource-manager cloud list` и `yc resource-manager folder list`.
5. Вы должны быть владельцем облака (роль `resource-manager.clouds.owner`): Terraform создаёт сервисные аккаунты и выдаёт им роли.

Запишите оба ID: они пойдут в оба файла `terraform.tfvars` (шаг 7).

## 2. Домен и DNS-зона

Нужен свой домен: сертификаты и адреса бакетов привязаны к нему. Пример ниже: `example.com`, замените на свой.

1. **Купите домен** у любого регистратора (например, REG.RU, Beget, Timeweb). Для `.ru` регистратор попросит подтвердить личность. Либо возьмите поддомен домена, которым вы уже владеете.
2. В консоли: **Cloud DNS → Создать зону**. Зона `example.com.` (с точкой на конце), тип **Публичная**, имя `event-tracking-system`. После создания скопируйте **ID зоны**: это `dns_zone_id` (или `yc dns zone list`).
3. **Делегируйте домен**: в личном кабинете регистратора в настройках DNS-серверов домена укажите ровно два сервера:
   - `ns1.yandexcloud.net`
   - `ns2.yandexcloud.net`
4. Дождитесь применения (от минут до суток). Проверка:

```powershell
nslookup -type=NS example.com 8.8.8.8
```

В ответе должны быть `ns1.yandexcloud.net` и `ns2.yandexcloud.net`. Пока этого нет, к шагу 3 не переходите: сертификат не выпустится.

### Три адреса

Это три поддомена одного домена (не сам домен: записи будут CNAME, на корне они не работают):

| Назначение | Адрес | Переменные в tfvars |
| --- | --- | --- |
| API | `api.example.com` | `api_domain`, `api_certificate_id` |
| Приложение (то, что открывают участники и админ) | `app.example.com` | `webapp_domain`, `webapp_certificate_id` |
| Сайт-визитка | `www.example.com` | `website_domain`, `website_certificate_id` |

Сами записи в DNS создавать не надо: Terraform создаст их в вашей зоне, потому что вы укажете `dns_zone_id`.

## 3. Три сертификата HTTPS

Нужен отдельный сертификат на каждый адрес. Все три выпускаются бесплатно в Certificate Manager.

Для каждого из `api.example.com`, `app.example.com`, `www.example.com`:

1. Консоль: **Certificate Manager → Добавить сертификат → Сертификат Let's Encrypt**.
2. Имя, например `etsys-api`. В поле доменов один адрес (например, `api.example.com`).
3. Тип проверки: **DNS (CNAME)**: он нужен для автоматического продления.
4. Нажмите «Создать». Сертификат получит статус **Validating**.
5. Откройте сертификат, раздел проверки покажет запись типа CNAME (имя вида `_acme-challenge.api.example.com`). Создайте её в вашей зоне: если рядом есть кнопка создания записи, нажмите её, иначе вручную в Cloud DNS: тип `CNAME`, имя и значение скопируйте с экрана. Для `_acme-challenge` должна быть только CNAME, без TXT.
6. Подождите, пока статус станет **Issued** (обычно несколько минут). Нажмите «Показать логи», если не выпускается.
7. Скопируйте **ID сертификата** (страница сертификата или `yc certificate-manager certificate list`): это `*_certificate_id` для этого адреса.

Должно получиться три ID, все в статусе Issued.

## 4. Почта (Postbox): подтверждение отправителя

Почта нужна для «Забыли пароль?». **Важно:** в приложении нет страницы смены пароля, пароль меняется только письмом по этой ссылке. Если почту не подключать, сброс пароля работать не будет (регистрация и вход работают).

Terraform сам создаёт сервисный аккаунт с ролью `postbox.sender` и его ключ в Lockbox. Вам нужно только подтвердить домен:

1. Консоль: **Postbox → Создать адрес**. В поле указывается **домен**, а не email: введите `example.com`.
2. Выберите простую настройку DKIM (ключи создаст Yandex Cloud).
3. Консоль покажет DNS-записи подписи (вид `<selector>._domainkey.example.com`). Создайте их в вашей зоне Cloud DNS **точно как показано**: тип и значение копируйте с экрана.
4. Подождите, пока статус адреса станет **Success** (Yandex проверяет записи сам; обычно до нескольких часов).
5. Отправитель в tfvars: `email_delivery = "postbox"` и `email_from = "no-reply@example.com"`. Адрес должен быть на подтверждённом домене.
6. Перед запуском проверьте на странице Postbox квоты и ограничения вашего аккаунта.

Без почты поставьте `email_delivery = "disabled"` и `email_from = null`.

## 5. Программы на вашем компьютере

Нужны Git, Bun и запущенный Docker Desktop (они уже есть). Остальное ставится один раз:

```powershell
# Yandex Cloud CLI
Invoke-Expression (New-Object System.Net.WebClient).DownloadString('https://storage.yandexcloud.net/yandexcloud-yc/install.ps1')
# AWS CLI (нужен только для выкладки сайтов в Object Storage)
msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi
```

**Terraform** (нужна версия 1.15 или новее в ветке 1.x). Из России сайт HashiCorp недоступен, используйте зеркало Yandex:

1. Скачайте архив `terraform_<версия>_windows_amd64.zip` со страницы https://hashicorp-releases.yandexcloud.net/terraform/ , распакуйте `terraform.exe` в `C:\tools\terraform` и добавьте эту папку в `PATH`.
2. Чтобы Terraform брал провайдеры тоже с зеркала, создайте файл `%APPDATA%\terraform.rc` с содержимым:

```
provider_installation {
  network_mirror {
    url = "https://terraform-mirror.yandexcloud.net/"
    include = ["registry.terraform.io/*/*"]
  }
  direct {
    exclude = ["registry.terraform.io/*/*"]
  }
}
```

Откройте **новое** окно PowerShell и проверьте:

```powershell
yc --version
aws --version
terraform version
docker info
```

Настройте `yc` на ваше облако и каталог (откроет браузер для входа):

```powershell
yc init
yc config list
```

В `yc config list` значения `cloud-id` и `folder-id` должны совпасть с шагом 1: каждая команда деплоя это проверяет и останавливается при расхождении.

## 6. Код в GitHub

Релиз собирается из **запушенной** ветки и требует чистого дерева. Ветку назовите `main` (так в tfvars):

```bash
git branch -M main
git add -A
git commit -m "Подготовка к деплою"
git push -u origin main
git status
```

`git status` должен показать «nothing to commit, working tree clean». Файлы `terraform.tfvars`, `.env` и `*.backend.hcl` в git не попадают (они в `.gitignore`).

## 7. Заполнение `terraform.tfvars`

```powershell
Copy-Item infra/yandex/bootstrap/terraform.tfvars.example infra/yandex/bootstrap/terraform.tfvars
Copy-Item infra/yandex/production/terraform.tfvars.example infra/yandex/production/terraform.tfvars
```

### `infra/yandex/bootstrap/terraform.tfvars`

Бакет для хранения состояния Terraform:

```hcl
cloud_id          = "<cloud_id из шага 1>"
folder_id         = "<folder_id из шага 1>"
zone              = "ru-central1-a"
project_slug      = "event-tracking-system"
state_bucket_name = "etsys-tfstate-<ваши-буквы-и-цифры>"
```

Имя бакета уникально на весь Object Storage: строчные латинские буквы, цифры и дефисы, 3-63 символа.

### `infra/yandex/production/terraform.tfvars`

```hcl
cloud_id     = "<cloud_id>"
folder_id    = "<folder_id>"
project_slug = "event-tracking-system"
git_branch   = "main"

backend_image_name = "backend"

# Пароли и JWT здесь НЕ пишите: они идут через переменные окружения (шаг 8).
database_active_slot            = "blue"
database_owner_password_version = 1
database_blue_password_version  = 1
database_green_password_version = 1

api_domain             = "api.example.com"
api_certificate_id     = "<ID сертификата api, шаг 3>"
webapp_domain          = "app.example.com"
webapp_certificate_id  = "<ID сертификата app>"
website_domain         = "www.example.com"
website_certificate_id = "<ID сертификата www>"
dns_zone_id            = "<ID зоны, шаг 2>"
dns_zone_domain        = "example.com"

enable_cdn               = false
route_static_through_cdn = false

# Имена бакетов приложения и сайта ВСЕГДА равны их доменам.
webapp_bucket_name  = "app.example.com"
website_bucket_name = "www.example.com"
media_bucket_name   = "etsys-media-<ваши-буквы-и-цифры>"

email_delivery = "postbox"
email_from     = "no-reply@example.com"
```

Что важно:
- `dns_zone_domain` это домен зоны без точки, а три адреса его **поддомены**.
- `media_bucket_name` уникален глобально, как и имя бакета состояния.
- Не оставляйте `REPLACE_WITH_...`: проверка остановится.
- Пароли и JWT в файл не пишите: значение из файла перекроет переменную окружения.

## 8. Пароли и ключи (в каждом новом окне PowerShell)

Сгенерируйте и **сохраните в менеджере паролей** четыре значения. Они нужны при каждом `plan`, `apply` и `release`. Потеряете их, смена секретов потребует отдельной процедуры ([YANDEX_CLOUD.md](YANDEX_CLOUD.md#database-password-rotation)).

```powershell
function New-HexSecret([int]$Bytes) {
  $b = New-Object byte[] $Bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  -join ($b | ForEach-Object { $_.ToString('x2') })
}
$env:TF_VAR_database_owner_password = New-HexSecret 16   # 32 символа, нужно от 24
$env:TF_VAR_database_blue_password  = New-HexSecret 16
$env:TF_VAR_database_green_password = New-HexSecret 16
$env:TF_VAR_jwt_secret              = New-HexSecret 32   # 64 hex-символа, как требует проверка
```

Выведите значения (`$env:TF_VAR_jwt_secret` и т.д.), сохраните, а в следующем окне заново присвойте **те же** значения:

```powershell
$env:TF_VAR_database_owner_password = '<сохранённое>'
# и так для blue, green, jwt_secret
```

Для каждого окна нужно ещё два действия:

```powershell
# настоящий bun.exe первым в PATH (shim из npm скрипты запустить не могут)
$env:PATH = "$env:APPDATA\npm\node_modules\bun\bin;" + $env:PATH
# токен Yandex Cloud, живёт 12 часов
$env:YC_TOKEN = (yc iam create-token)
```

## 9. Запуск, по порядку

Сначала пробный прогон `--dry-run` (ничего не создаёт), потом настоящий.

```powershell
bun run infra:bootstrap -- yandex --new --dry-run
bun run infra:bootstrap -- yandex --new
```

Создаёт бакет состояния и ключ к нему. Появятся файлы `infra/yandex/.env.terraform-state` и `backend.backend.hcl`: **скопируйте `.env.terraform-state` в менеджер паролей**.

```powershell
bun run infra:apply -- yandex --dry-run
bun run infra:apply -- yandex
```

Создаёт сеть, **базу PostgreSQL** (до 15-20 минут), реестр, бакеты, сервисные аккаунты, Lockbox, DNS-записи.

### Где задаётся администратор

Только при **первом** релизе, через две переменные окружения. Email любой ваш настоящий, пароль случайный, не короче 12 символов:

```powershell
$env:ADMIN_SEED_EMAIL    = 'owner@example.com'
$env:ADMIN_SEED_PASSWORD = '<случайный пароль от 12 символов>'
bun run release -- yandex --dry-run
bun run release -- yandex
Remove-Item Env:ADMIN_SEED_EMAIL, Env:ADMIN_SEED_PASSWORD
```

Релиз собирает образ, загружает его в реестр, **запускает миграции базы** и создаёт первое мероприятие с 15 станциями, переключает API и задачи, выкладывает оба сайта и проверяет адреса. Не передавайте эти переменные повторно: новое значение сбросит пароль админа.

Если релиз остановился на проверке адресов (DNS ещё не разошёлся), подождите 5-10 минут и запустите `bun run release -- yandex` ещё раз: команды безопасно повторять.

## 10. Проверка, что всё заработало

1. https://api.example.com/health/ready отвечает HTTP 200.
2. https://www.example.com открывается (сайт-визитка).
3. https://app.example.com открывается; войдите email и паролем администратора, откроется `/admin`.
4. **Смените пароль админа.** Страницы смены нет: выйдите, на странице входа «Забыли пароль?», введите email админа, письмо придёт через Postbox, по ссылке задайте новый пароль. Если почта отключена, оставьте сгенерированный пароль, но помните, что он остаётся в Lockbox и состоянии Terraform.
5. `/admin/stations`: QR станций, распечатайте и проверьте каждый телефоном.
6. Зарегистрируйте тестового участника на телефоне по HTTPS-адресу и пройдите станцию.

## 11. Типичные ошибки

| Сообщение или симптом | Причина и решение |
| --- | --- |
| `yc targets cloud/folder ..., expected ...` | `yc` смотрит в другой каталог: `yc config set cloud-id ...` и `yc config set folder-id ...` |
| `terraform is not installed` или не скачиваются провайдеры | Нет Terraform в `PATH` или нет файла `terraform.rc` с зеркалом (шаг 5) |
| `REPLACE_WITH_` в сообщении | В tfvars остался шаблон |
| Ошибка про переменную `jwt_secret` или `database_..._password` | В этом окне PowerShell не заданы четыре `TF_VAR_*` (шаг 8) |
| `Unauthenticated` или `token expired` | Токен живёт 12 часов: `$env:YC_TOKEN = (yc iam create-token)` |
| Сертификат не выпускается | DNS-зона не делегирована или не создана CNAME `_acme-challenge` (шаги 2-3) |
| `BucketAlreadyExists` | Имя бакета занято: выберите другое `media_bucket_name` или `state_bucket_name`. Для `app.`/`www.` имя равно домену: домен должен быть вашим |
| `release` ругается на ветку или дерево | Не запушено или есть незакоммиченные файлы (шаг 6) |
| Релиз упал на проверке URL | DNS ещё не разошёлся: подождите и повторите `release` |
| Письма не приходят | Адрес в Postbox не в статусе Success или `email_from` не на подтверждённом домене |
| Docker не отвечает | Запустите Docker Desktop и дождитесь Engine running |

Скрипты `scripts/infra.mjs` до сих пор проверялись только тестами, на настоящем облаке и на Windows они не запускались. Если какая-то команда не находится, проверьте `PATH` в этом окне.

## 12. Что можно не делать сразу

- Уведомления в Monitoring (два оповещения): [YANDEX_CLOUD.md](YANDEX_CLOUD.md#alerts), после первого релиза.
- CDN: оставьте `enable_cdn = false`.
- Доступ к базе для чтения: [YANDEX_CLOUD.md](YANDEX_CLOUD.md#operator-database-access), публичного адреса у базы нет.
