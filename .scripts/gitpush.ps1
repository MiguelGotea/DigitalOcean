# Script para hacer commit y push rápido al repo DigitalOcean
git add .
git commit -m "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git push
