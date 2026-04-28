#!/usr/bin/env bash
PM2=/opt/homebrew/bin/pm2

echo "Stopping x-reply-bot..."
"$PM2" stop x-reply-bot
echo ""
"$PM2" status x-reply-bot
echo ""
echo "x-reply-bot is stopped."
echo "The next queued run will be canceled by Trigger.dev after its TTL (~10 min)."
echo "To resume: double-click start-xbot.sh"
echo ""
read -n 1 -s -r -p "Press any key to close this window..."
echo ""
