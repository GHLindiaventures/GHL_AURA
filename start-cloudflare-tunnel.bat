@echo off
title Cloudflare Tunnel - Sales Rep App
echo ========================================================
echo  Starting Cloudflare Quick Tunnel for Sales Rep App
echo  Forwarding to http://localhost:5173 (Frontend + API)
echo ========================================================
cloudflared tunnel --url http://localhost:5173
pause
