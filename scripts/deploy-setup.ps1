<#
Одноразовая подготовка к деплою в Yandex Cloud. Запуск из корня репозитория:

    .\scripts\deploy-setup.ps1

Что делает (повторный запуск безопасен: уже существующие файлы не перезаписываются):
  1. создаёт папку %USERPROFILE%\.etsys и в ней секреты (пароли базы, JWT-секрет);
  2. скачивает провайдер Terraform для Yandex Cloud в локальную папку и пишет конфигурацию
     Terraform, которая берёт провайдер оттуда (зеркало Yandex часто обрывается);
  3. по вашему облаку и домену находит ID зоны DNS и трёх сертификатов и создаёт оба
     файла terraform.tfvars;
  4. спрашивает email и пароль администратора и сохраняет их в %USERPROFILE%\.etsys\admin.ps1.
#>
param(
  [string]$Domain,
  [string]$AdminEmail,
  [string]$AdminPassword,
  [string]$StateDir = (Join-Path $env:USERPROFILE '.etsys'),
  [switch]$NoMail
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$env:Path = "$env:APPDATA\npm\node_modules\bun\bin;C:\tools\terraform;$env:USERPROFILE\tools\awscli\Amazon\AWSCLIV2;$env:USERPROFILE\yandex-cloud\bin;" + $env:Path
$env:YC_CLI_INITIALIZATION_SILENCE = 'true'

function Say($text) { Write-Host $text }
function New-HexSecret([int]$Bytes) {
  $b = New-Object byte[] $Bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  -join ($b | ForEach-Object { $_.ToString('x2') })
}
function Protect-File($path) { icacls $path /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null }
# Запрос к yc с повторами: сеть до API Yandex Cloud иногда обрывается (особенно при включённом VPN).
function Get-YcText([string[]]$ycArgs) {
  $previous = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try {
    for ($i = 1; $i -le 4; $i++) {
      $out = (& yc @ycArgs 2>$null | Out-String).Trim()
      if ($LASTEXITCODE -eq 0 -and $out) { return $out }
      Start-Sleep -Seconds 5
    }
  } finally { $ErrorActionPreference = $previous }
  throw "Нет связи с Yandex Cloud (yc $($ycArgs -join ' ')). Отключите VPN и запустите скрипт ещё раз."
}

# --- 0. нужные программы ---
$missing = @('bun', 'terraform', 'aws', 'yc', 'docker', 'git') | Where-Object { -not (Get-Command $_ -ErrorAction SilentlyContinue) }
if ($missing) { throw "Не найдены программы: $($missing -join ', '). Установите их по шагу 2 гайда." }

# --- 1. секреты ---
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
$secrets = Join-Path $StateDir 'secrets.ps1'
if (Test-Path $secrets) {
  Say "[1/5] Секреты уже есть: $secrets (не меняю)"
} else {
  @(
    '# Секреты деплоя. Никому не показывайте и не коммитьте. Сохраните копию в менеджере паролей.',
    "`$env:TF_VAR_database_owner_password = '$(New-HexSecret 16)'",
    "`$env:TF_VAR_database_blue_password = '$(New-HexSecret 16)'",
    "`$env:TF_VAR_database_green_password = '$(New-HexSecret 16)'",
    "`$env:TF_VAR_jwt_secret = '$(New-HexSecret 32)'"
  ) | Set-Content -Path $secrets -Encoding ascii
  Protect-File $secrets
  Say "[1/5] Секреты созданы: $secrets (сохраните копию в менеджере паролей)"
}

# --- 2. провайдер Terraform и его конфигурация ---
$providerVersion = [regex]::Match((Get-Content "$repo\infra\yandex\production\versions.tf" -Raw), '\bversion\s*=\s*"(\d+\.\d+\.\d+)"').Groups[1].Value
if (-not $providerVersion) { throw 'Не удалось определить версию провайдера из infra/yandex/production/versions.tf' }
$mirror = Join-Path $StateDir 'tf-mirror'
$providerDir = Join-Path $mirror "registry.terraform.io\yandex-cloud\yandex\$providerVersion\windows_amd64"
if (Test-Path (Join-Path $providerDir "terraform-provider-yandex_v$providerVersion.exe")) {
  Say "[2/5] Провайдер $providerVersion уже скачан"
} else {
  Say "[2/5] Скачиваю провайдер $providerVersion (около 40 МБ, до 10 попыток)..."
  $url = "https://terraform-mirror.yandexcloud.net/registry.terraform.io/yandex-cloud/yandex/terraform-provider-yandex_${providerVersion}_windows_amd64.zip"
  $zip = Join-Path $env:TEMP "terraform-provider-yandex_$providerVersion.zip"
  $ok = $false
  for ($i = 1; $i -le 10 -and -not $ok; $i++) {
    try { Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 900; $ok = $true }
    catch { Say "      попытка $i не удалась, повторяю"; Start-Sleep -Seconds 5 }
  }
  if (-not $ok) { throw 'Не удалось скачать провайдер: зеркало Yandex недоступно. Отключите VPN и запустите скрипт ещё раз.' }
  New-Item -ItemType Directory -Force -Path $providerDir | Out-Null
  Expand-Archive -Path $zip -DestinationPath $providerDir -Force
  Remove-Item $zip
}
$rc = Join-Path $StateDir 'terraform.rc'
$mirrorPath = $mirror.Replace('\', '/')
@"
provider_installation {
  filesystem_mirror {
    path    = "$mirrorPath"
    include = ["registry.terraform.io/yandex-cloud/yandex"]
  }
  network_mirror {
    url     = "https://terraform-mirror.yandexcloud.net/"
    include = ["registry.terraform.io/*/*"]
    exclude = ["registry.terraform.io/yandex-cloud/yandex"]
  }
  direct {
    exclude = ["registry.terraform.io/*/*"]
  }
}
"@ | Set-Content -Path $rc -Encoding ascii

# --- 3. облако и домен ---
$cloudId = ((& yc config get cloud-id 2>$null) | Out-String).Trim()
$folderId = ((& yc config get folder-id 2>$null) | Out-String).Trim()
if (-not $cloudId -or -not $folderId) { throw 'yc не настроен. Выполните yc init (шаг 3 гайда) и запустите скрипт ещё раз.' }
if (-not $Domain) { $Domain = (Read-Host 'Ваш домен, например формула-будущего.рф').Trim() }
$ascii = (New-Object System.Globalization.IdnMapping).GetAscii($Domain.ToLowerInvariant())
Say "[3/5] Облако $cloudId, каталог $folderId, домен для Terraform: $ascii"

$zone = @((Get-YcText @('dns', 'zone', 'list', '--format', 'json') | ConvertFrom-Json) | Where-Object { $_.zone -eq "$ascii." })
if ($zone.Count -ne 1) { throw "В Cloud DNS нет зоны '$ascii.' (шаг 1 гайда)." }
$certs = (Get-YcText @('certificate-manager', 'certificate', 'list', '--format', 'json') | ConvertFrom-Json)
$certId = @{}
foreach ($name in 'api', 'app', 'www') {
  $found = @($certs | Where-Object { $_.domains -contains "$name.$ascii" })
  if ($found.Count -ne 1) { throw "Нет сертификата для $name.$ascii в Certificate Manager (шаг 1 гайда)." }
  if ($found[0].status -ne 'ISSUED') { throw "Сертификат для $name.$ascii в статусе $($found[0].status), ждите ISSUED." }
  $certId[$name] = $found[0].id
}

# --- 4. terraform.tfvars ---
$bootstrapVars = Join-Path $repo 'infra\yandex\bootstrap\terraform.tfvars'
if (Test-Path $bootstrapVars) { Say "[4/5] $bootstrapVars уже есть (не меняю)" } else {
  @"
cloud_id          = "$cloudId"
folder_id         = "$folderId"
zone              = "ru-central1-a"
project_slug      = "event-tracking-system"
state_bucket_name = "etsys-tfstate-$(New-HexSecret 4)"
"@ | Set-Content -Path $bootstrapVars -Encoding ascii
  Say "[4/5] Создан $bootstrapVars"
}
$productionVars = Join-Path $repo 'infra\yandex\production\terraform.tfvars'
if (Test-Path $productionVars) { Say "      $productionVars уже есть (не меняю)" } else {
  $mail = if ($NoMail) { "email_delivery = `"disabled`"`r`nemail_from     = null" } else { "email_delivery = `"postbox`"`r`nemail_from     = `"no-reply@$ascii`"" }
  @"
cloud_id     = "$cloudId"
folder_id    = "$folderId"
project_slug = "event-tracking-system"
git_branch   = "main"

backend_image_name = "backend"

# Database passwords and JWT secret come from environment variables (secrets.ps1), not from this file.
database_active_slot            = "blue"
database_owner_password_version = 1
database_blue_password_version  = 1
database_green_password_version = 1

api_domain             = "api.$ascii"
api_certificate_id     = "$($certId['api'])"
webapp_domain          = "app.$ascii"
webapp_certificate_id  = "$($certId['app'])"
website_domain         = "www.$ascii"
website_certificate_id = "$($certId['www'])"
dns_zone_id            = "$($zone[0].id)"
dns_zone_domain        = "$ascii"

enable_cdn               = false
route_static_through_cdn = false

webapp_bucket_name  = "app.$ascii"
website_bucket_name = "www.$ascii"
media_bucket_name   = "etsys-media-$(New-HexSecret 4)"

$mail
"@ | Set-Content -Path $productionVars -Encoding ascii
  Say "      Создан $productionVars"
}

# --- 5. администратор ---
$adminFile = Join-Path $StateDir 'admin.ps1'
if (Test-Path $adminFile) { Say "[5/5] Администратор уже задан: $adminFile (не меняю)" } else {
  if (-not $AdminEmail) { $AdminEmail = (Read-Host 'Email администратора (им вы войдёте в приложение)').Trim() }
  if (-not $AdminPassword) {
    $secure = Read-Host 'Пароль администратора (от 12 символов)' -AsSecureString
    $AdminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBigUni([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  }
  if ($AdminEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw 'Email администратора указан неверно.' }
  if ($AdminPassword.Length -lt 12) { throw 'Пароль администратора должен быть не короче 12 символов.' }
  if ($AdminPassword -notmatch '^[\x20-\x7E]+$') { throw 'В пароле администратора используйте только латинские буквы, цифры и знаки (без кириллицы).' }
  @(
    "`$env:ADMIN_SEED_EMAIL = '$($AdminEmail.Replace("'", "''"))'",
    "`$env:ADMIN_SEED_PASSWORD = '$($AdminPassword.Replace("'", "''"))'"
  ) | Set-Content -Path $adminFile -Encoding ascii
  Protect-File $adminFile
  Say "[5/5] Администратор сохранён: $adminFile"
}

Say ''
Say 'Готово. Дальше: закоммитьте и отправьте код (git add -A; git commit; git push), затем шаг запуска из гайда.'
