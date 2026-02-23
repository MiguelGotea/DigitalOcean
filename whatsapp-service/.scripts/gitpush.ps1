# PowerShell — Push rápido a GitHub
# Uso: .\.scripts\gitpush.ps1

$fecha = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$mensaje = $args[0]
if (-not $mensaje) { $mensaje = $fecha }

git add -A
git commit -m $mensaje

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Nada que commitear o error en commit." -ForegroundColor Yellow
    exit 0
}

git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Push exitoso: $mensaje" -ForegroundColor Green
} else {
    Write-Host "❌ Error en push." -ForegroundColor Red
}
