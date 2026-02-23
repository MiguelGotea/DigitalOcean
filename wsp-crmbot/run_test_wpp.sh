#!/bin/bash
cd /var/www/wsp-crmbot
export DEBUG='whatsapp-web.js*'
node test_wpp.js > test_output.log 2>&1
