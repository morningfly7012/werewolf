#!/usr/bin/env bash
# 自動更新腳本：檢查 GitHub 上 main 分支有沒有新版本，有的話就拉下來、
# 重新安裝相依套件並重啟服務。建議用 cron 定時執行（見 README）。
#
# 用法：
#   chmod +x scripts/auto-update.sh
#   ./scripts/auto-update.sh
#
# 可用環境變數：
#   BRANCH      要追蹤的分支（預設 main）
#   PM2_NAME    pm2 服務名稱（預設 werewolf）

set -euo pipefail

# 切到專案根目錄（此腳本位於 scripts/ 底下）
cd "$(dirname "$0")/.."

BRANCH="${BRANCH:-main}"
PM2_NAME="${PM2_NAME:-werewolf}"

echo "[$(date '+%F %T')] 檢查更新（分支 $BRANCH）..."

git fetch --quiet origin "$BRANCH"
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "[$(date '+%F %T')] 已是最新版本，無需更新。"
  exit 0
fi

echo "[$(date '+%F %T')] 發現新版本，開始更新： $LOCAL -> $REMOTE"

# 強制對齊遠端（部署機不應有本機修改；如有會被覆蓋）
git reset --hard "origin/$BRANCH"

# 安裝相依套件（package-lock 有變動時才會真的重裝）
npm install --omit=dev

# 重啟服務：優先用 pm2，否則提示
if command -v pm2 >/dev/null 2>&1 && pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
  echo "[$(date '+%F %T')] 已透過 pm2 重啟服務 $PM2_NAME。"
else
  echo "[$(date '+%F %T')] 更新完成，但找不到 pm2 服務 '$PM2_NAME'，請自行重啟（例如重新執行 npm start）。"
fi

echo "[$(date '+%F %T')] 更新完成。"
