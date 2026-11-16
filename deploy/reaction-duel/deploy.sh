#!/usr/bin/env bash
# 반응속도 대결 게임만 Vercel 프로젝트(reaction-duel-one-phone)로 배포합니다.
# 사용법: bash deploy/reaction-duel/deploy.sh   (vercel CLI 로그인 필요)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$(mktemp -d)"
cp -r "$ROOT/reaction" "$OUT/"
cp "$ROOT/deploy/reaction-duel/vercel.json" "$OUT/vercel.json"
cd "$OUT"
vercel link --yes --project reaction-duel-one-phone
vercel deploy --prod --yes
