# PowerShell - Push rapido a GitHub
# Uso: .\.scripts\gitpush.ps1 ["mensaje opcional"]

$fecha = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$mensaje = $args[0]
if (-not $mensaje) { $mensaje = $fecha }

git add -A
git commit -m $mensaje

if ($LASTEXITCODE -ne 0) {
    Write-Host "Nada que commitear o error en commit." -ForegroundColor Yellow
    exit 0
}

# Pull previo por si el repo en GitHub cambio (sync)
Write-Host "Sincronizando con cambios remotos..." -ForegroundColor Yellow
git pull origin main --rebase

git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "Push exitoso - GitHub Actions desplegara al VPS automaticamente." -ForegroundColor Green
}
else {
    Write-Host "Error en push." -ForegroundColor Red
}
