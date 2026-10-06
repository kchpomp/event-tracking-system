<#
Подключайте в начале КАЖДОГО нового окна PowerShell, из корня репозитория (с точкой в начале):

    . .\scripts\deploy-env.ps1

Для первого релиза, который создаёт администратора, добавьте ключ:

    . .\scripts\deploy-env.ps1 -WithAdmin

Скрипт ничего не создаёт: он только задаёт переменные окружения этого окна (пути к программам,
конфигурацию Terraform, секреты и токен Yandex Cloud).
#>
param([switch]$WithAdmin)

$state = Join-Path $env:USERPROFILE '.etsys'
$env:Path = "$env:APPDATA\npm\node_modules\bun\bin;C:\tools\terraform;$env:USERPROFILE\tools\awscli\Amazon\AWSCLIV2;$env:USERPROFILE\yandex-cloud\bin;" + $env:Path
$env:YC_CLI_INITIALIZATION_SILENCE = 'true'
$env:TF_CLI_CONFIG_FILE = Join-Path $state 'terraform.rc'

if (-not (Test-Path $env:TF_CLI_CONFIG_FILE)) {
  Write-Warning 'Нет файла настроек Terraform. Сначала выполните: .\scripts\deploy-setup.ps1'
  return
}
. (Join-Path $state 'secrets.ps1')
if ($WithAdmin) { . (Join-Path $state 'admin.ps1') }

$env:YC_TOKEN = (yc iam create-token)
if (-not $env:YC_TOKEN) {
  Write-Warning 'Не удалось получить токен Yandex Cloud. Выполните yc init и проверьте, что VPN выключен.'
  return
}
Write-Host 'Окружение готово. Можно запускать команды деплоя.'
