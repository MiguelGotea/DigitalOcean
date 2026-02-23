#!/bin/bash
export DEBUG='whatsapp-web.js*'
export PORT=3001
cd /var/www/wsp-crmbot
node src/app.js > debug_protocol.log 2>&1 &
echo $! > debug.pid
echo "Debug process started with PID $(cat debug.pid)"
