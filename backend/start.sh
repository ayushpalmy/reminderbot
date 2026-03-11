#!/bin/bash
cd /app/backend
export $(grep -v '^#' .env | xargs)
exec node server.js
