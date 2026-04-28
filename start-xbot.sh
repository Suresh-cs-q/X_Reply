#!/usr/bin/env bash
PM2=/opt/homebrew/bin/pm2
BOT_DIR="/Users/suresh/x-reply-bot"

cd "$BOT_DIR" || { echo "Could not cd to $BOT_DIR"; exit 1; }

echo "Starting x-reply-bot..."
"$PM2" start ecosystem.config.cjs --only x-reply-bot
echo ""
"$PM2" status x-reply-bot
echo ""
echo "x-reply-bot is running."
echo "Live logs:  $PM2 logs x-reply-bot"
echo "Dashboard:  https://cloud.trigger.dev/projects/v3/proj_xntuspxcqkgbblizsxdl"
echo ""
echo "If the bot was stopped for more than ~10 minutes, the scheduling chain"
echo "may have expired. If you don't see new runs within ~10 min, open the"
echo "dashboard above, click 'reply-tick', and hit Test once to re-kick."
echo ""
read -n 1 -s -r -p "Press any key to close this window..."
echo ""
