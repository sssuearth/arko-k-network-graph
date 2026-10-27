#!/bin/bash
export PATH="$HOME/.local/node24/bin:$PATH"
cd "$(dirname "$0")/.."
exec npm run dev
