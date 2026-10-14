@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "app\abruf.ps1"
