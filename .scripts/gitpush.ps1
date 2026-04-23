# PowerShell - Push rapido a GitHub
# Uso: .\.scripts\gitpush.ps1 ["mensaje opcional"]

# Auto-navegar a la raíz (GPS Interno)
Set-Location $PSScriptRoot
Set-Location ..

# Script Tanque v7 (Anti-Choque)
git add .
$msg = $args[0]
if (-not $msg) { $msg = "Human Push $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" }

git commit -m "$msg" 2>$null

Write-Host "🚀 Intentando sincronizar y subir cambios..." -ForegroundColor Cyan
git pull origin main --rebase

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️ Conflicto con el Bot detectado. Aplicando reparación de Hierro..." -ForegroundColor Yellow
    git rebase --abort 2>$null
    git pull origin main --no-rebase -X ours
    git add .
    git commit -m "$msg (Conflict Resolved)" 2>$null
}

git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ ¡Subida completada con éxito! (GitHub Actions desplegará al VPS)" -ForegroundColor Green
} else {
    Write-Host "❌ Error en push." -ForegroundColor Red
}
