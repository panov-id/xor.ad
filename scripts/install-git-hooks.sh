#!/usr/bin/env bash
# Install the project's git hooks into this checkout's .git/hooks (git hooks are not versioned).
#   post-commit — rebuild the project map from the commit, in the background (scripts/map-on-commit.sh).
set -euo pipefail
root=$(git rev-parse --show-toplevel)
hooks=$(git -C "$root" rev-parse --git-path hooks)
mkdir -p "$hooks"
cat > "$hooks/post-commit" <<'EOF'
#!/usr/bin/env bash
# Installed by scripts/install-git-hooks.sh: the map follows the commit, never blocks it.
root=$(git rev-parse --show-toplevel)
log=$(git rev-parse --git-path map-on-commit.log)
nohup bash "$root/scripts/map-on-commit.sh" > "$log" 2>&1 &
EOF
chmod +x "$hooks/post-commit"
echo "installed: $hooks/post-commit"
