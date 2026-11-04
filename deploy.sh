#!/usr/bin/env bash
# Notaku — deploy / update dalam satu perintah.
#
# Cara pakai di server (LXC/VM Proxmox, jaringan privat):
#   1. Clone repo ini, atau ekstrak zip-nya, lalu masuk ke foldernya:
#        git clone https://github.com/gemhelixx17/vibe-notes.git
#        cd vibe-notes
#        chmod +x deploy.sh
#   2. Jalankan:
#        sudo ./deploy.sh
#      Untuk update berikutnya, cukup:
#        cd vibe-notes && git pull && sudo ./deploy.sh
#      Script yang sama dipakai untuk deploy pertama dan update:
#      - deploy pertama: menyalin kode ke /opt/notaku, memasang systemd, menjalankan
#      - update: membackup versi lama, menyalin kode baru, data/ TIDAK ditimpa,
#        lalu me-restart service dan mengecek /api/health
#
# Opsi:
#   --dir DIR        target install, default /opt/notaku
#   --port PORT      port server, default 3000
#   --user USER      user service systemd, default www-data (fallback: nobody)
#   --no-systemd     jangan pasang systemd, jalankan manual dengan nohup
#   --docker         pakai Docker Compose, bukan systemd (lihat README bagian Docker)
#   --check          dry-run: hanya periksa prasyarat, tanpa mengubah apa pun
#   --status         hanya cek service dan /api/health, tanpa deploy
#   --help           tampilkan bantuan
#
# Data Anda aman: data/notaku.db tidak pernah dihapus script ini.
# Jangan ekspos port ini langsung ke internet. Pakai Caddy/Tailscale
# seperti di README.md.
set -euo pipefail

DIR="/opt/notaku"
PORT="3000"
USER="www-data"
USE_SYSTEMD=1
DOCKER=0
CHECK=0
STATUS_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --user) USER="$2"; shift 2 ;;
    --no-systemd) USE_SYSTEMD=0; shift ;;
    --docker) DOCKER=1; USE_SYSTEMD=0; shift ;;
    --check) CHECK=1; shift ;;
    --status) STATUS_ONLY=1; shift ;;
    --help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Opsi tidak dikenal: $1 (lihat --help)" >&2; exit 2 ;;
  esac
done

log() { echo "[notaku] $*"; }
die() { echo "[notaku] GAGAL: $*" >&2; exit 1; }

if [ "$STATUS_ONLY" = 1 ]; then
  if [ "$DOCKER" = 1 ]; then
    (cd "$DIR" 2>/dev/null && docker compose ps) || docker ps --filter name=notaku || true
  elif [ "$USE_SYSTEMD" = 1 ] && command -v systemctl >/dev/null 2>&1; then
    systemctl status notaku --no-pager || true
  fi
  curl -fsS "http://127.0.0.1:${PORT}/api/health" && echo && log "Sehat."
  exit 0
fi

# Prasyarat: harus dijalankan dari root repo (ada server.py dan public/).
[ -f "server.py" ] || die "server.py tidak ditemukan. Jalankan script ini dari folder repo Notaku."
[ -d "public" ] || die "folder public/ tidak ditemukan. Jalankan script ini dari folder repo Notaku."
if [ "$DOCKER" = 1 ]; then
  command -v docker >/dev/null 2>&1 || die "docker tidak ditemukan. Instal Docker dulu di server, atau jalankan tanpa --docker."
  docker compose version >/dev/null 2>&1 || die "docker compose tidak ditemukan. Instal Docker Compose plugin dulu."
else
  command -v python3 >/dev/null 2>&1 || die "python3 tidak ditemukan. Instal dulu: sudo apt update && sudo apt install -y python3"
fi
command -v curl >/dev/null 2>&1 || log "PERINGATAN: curl tidak ditemukan, cek health akan dilewati."

if [ "$CHECK" = 1 ]; then
  log "Check OK: server.py dan public/ ada. Target: $DIR, port: $PORT, docker: $([ "$DOCKER" = 1 ] && echo ya || echo tidak), systemd: $([ "$USE_SYSTEMD" = 1 ] && echo ya || echo tidak)."
  if [ -d "$DIR" ]; then log "Target sudah ada: ini akan menjadi UPDATE (data/ dipertahankan)."; else log "Target belum ada: ini akan menjadi DEPLOY BARU."; fi
  exit 0
fi

if [ "$USE_SYSTEMD" = 1 ] && [ "$(id -u)" -ne 0 ]; then
  die "Pasang systemd butuh root. Jalankan dengan sudo, atau pakai --no-systemd."
fi
if ! id "$USER" >/dev/null 2>&1; then
  log "User $USER tidak ada, pakai nobody."
  USER="nobody"
fi

# Backup versi lama (kode saja, data dipisah dan tidak ikut dibackup-hapus).
if [ -d "$DIR" ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  BACKUP="/opt/notaku-backup-${STAMP}"
  log "Update: backup versi lama ke $BACKUP (data/ tidak ikut dipindah)."
  cp -a "$DIR" "$BACKUP"
  # Hapus data dari backup agar backup tidak membesar dan tidak membingungkan:
  # data asli tetap di $DIR/data dan akan dipertahankan di bawah.
  rm -rf "$BACKUP/data"
else
  log "Deploy baru ke $DIR."
fi

mkdir -p "$DIR"
# Salin kode baru, tapi JANGAN timpa data/ yang sudah ada.
cp -a server.py deploy.sh README.md Dockerfile docker-compose.yml .dockerignore "$DIR/" 2>/dev/null || true
cp -a public "$DIR/"
mkdir -p "$DIR/data"
# Jika ini deploy pertama dan belum ada data, data/ kosong akan dibuat server.py saat jalan.
if [ "$USE_SYSTEMD" = 1 ]; then
  chown -R "$USER":"$USER" "$DIR" 2>/dev/null || chown -R "$USER" "$DIR" || true
else
  log "Mode --no-systemd: file di $DIR, service tidak dipasang."
fi

if [ "$DOCKER" = 1 ]; then
  # Alih dari systemd ke Docker: hentikan service lama agar port tidak bentrok.
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet notaku 2>/dev/null; then
    log "Menghentikan service systemd notaku lama (alih ke Docker)."
    systemctl stop notaku || true
    systemctl disable notaku || true
  fi
  cd "$DIR"
  export NOTAKU_PORT="$PORT"
  docker compose up -d --build
  sleep 3
  docker compose ps || true
elif [ "$USE_SYSTEMD" = 1 ]; then
  cat > /etc/systemd/system/notaku.service <<EOF
[Unit]
Description=Notaku
After=network.target

[Service]
WorkingDirectory=$DIR
ExecStart=/usr/bin/python3 server.py --port $PORT
Restart=always
User=$USER

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now notaku
  sleep 2
  systemctl status notaku --no-pager || true
else
  # Jalankan manual di latar, simpan log di target.
  cd "$DIR" && nohup python3 server.py --port "$PORT" > "$DIR/notaku.log" 2>&1 &
  sleep 2
fi

if command -v curl >/dev/null 2>&1; then
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
    log "SELESAI dan SEHAT: http://127.0.0.1:${PORT}/api/health"
  else
    die "Service jalan tapi health check gagal. Cek: docker compose -f $DIR/docker-compose.yml logs 2>/dev/null; systemctl status notaku; $DIR/notaku.log"
  fi
else
  log "SELESAI (cek health dilewati karena curl tidak ada). Buka http://127.0.0.1:${PORT}/"
fi
log "Langkah berikutnya (sekali saja, di Caddy Anda): reverse_proxy ke 127.0.0.1:${PORT} atau IP guest ini, lihat README.md."
