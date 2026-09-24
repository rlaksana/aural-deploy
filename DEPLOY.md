# Panduan Deploy Docker — Aural

Runbook resmi jalur Docker (VPS + Docker Compose + Caddy). Panduan untuk tim ops/operator. Jalur Vercel tidak dicakup di sini.

---

## 0. Informasi yang harus disiapkan

Kumpulkan semua item ini **sebelum** mulai. Tanpa item bertanda **(wajib)** deploy tidak bisa jalan.

### A. Server

| Item | Keterangan | Wajib |
|---|---|---|
| VPS | Ubuntu 24.04, **RAM ≥ 2 GB**, disk ≥ 20 GB (build Next.js butuh RAM; kalau 2 GB pas-pasan siapkan swap 2 GB) | ✅ |
| IP publik VPS | Untuk DNS dan SSH | ✅ |
| Akses SSH | User dengan sudo + SSH key (bukan password) | ✅ |
| Firewall | Port terbuka: 22, 80, 443 saja | ✅ |

### B. Domain

| Item | Keterangan | Wajib |
|---|---|---|
| Domain | Mis. `aural.perusahaan.com` | ✅ |
| Akses DNS | Bisa membuat **A record** domain → IP VPS | ✅ |

### C. Kredensial

| Item | Keterangan | Wajib |
|---|---|---|
| Supabase project | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (ambil dari dashboard Supabase → Settings → API) | ✅ |
| Supabase schema | Project sudah termigrasi (`npx supabase db push` dari workstation) + bucket Storage **`recordings`** sudah dibuat | ✅ |
| MiniMax API key | `MINIMAX_API_KEY` — dipakai semua LLM + voice ASR/TTS. Relay menolak start tanpa ini | ✅ |
| Akses clone repo | Repo public: `https://github.com/1146345502/aural-oss.git` | ✅ |

### D. Operator (laptop yang menjalankan deploy)

| Item | Keterangan | Wajib |
|---|---|---|
| Node.js ≥ 20.9 + npm | Untuk menjalankan script deploy | ✅ |
| `AURAL_DEPLOY_HOST` | SSH target, mis. `deploy@203.0.113.10` (atau alias di `~/.ssh/config`) | ✅ |
| `AURAL_DEPLOY_DIR` | Path repo di server, default `/opt/aural` | opsional |
| `AURAL_DEPLOY_URL` | URL health check pasca-deploy, mis. `https://aural.perusahaan.com` | disarankan |

---

## 1. Setup server (sekali saja)

```bash
# Masuk ke VPS
ssh root@<IP_VPS>

# Install Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sh

# Firewall
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable

# Buat user deploy + direktori app (jangan deploy sebagai root)
adduser deploy && usermod -aG sudo,docker deploy
mkdir -p /opt/aural && chown deploy:deploy /opt/aural
```

Lalu sebagai user `deploy`:

```bash
su - deploy
git clone https://github.com/1146345502/aural-oss.git /opt/aural
cd /opt/aural
cp .env.example .env
```

Isi `.env` (nilai dari checklist bagian C):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# AI / Voice
MINIMAX_API_KEY=<minimax-key>

# App + reverse proxy
NEXT_PUBLIC_APP_URL=https://<domain>
DOMAIN=<domain>
LOG_LEVEL=info
```

> **Penting:** biarkan `NEXT_PUBLIC_VOICE_RELAY_URL` **kosong**. Browser client otomatis memakai `wss://<domain>/ws/voice` yang di-proxy Caddy. Isi nilai ini hanya jika voice relay di-host terpisah.

Arahkan DNS: buat **A record** `<domain>` → IP VPS **sebelum** langkah 2, agar Caddy langsung berhasil menerbitkan sertifikat TLS.

## 2. Deploy (per rilis, dari laptop operator)

Pastikan rilis sudah di-push ke `origin/main` (CI hijau), lalu:

```bash
AURAL_DEPLOY_HOST=deploy@<IP_VPS> \
AURAL_DEPLOY_URL=https://<domain> \
npm run deploy:docker
```

Script otomatis: (1) gate — branch `main`, tree bersih, `HEAD == origin/main`; (2) SSH ke server; (3) `git pull --rebase` + `docker compose up -d --build`; (4) health check `AURAL_DEPLOY_URL`.

Deploy pertama kali membangun image dari nol (± 5–10 menit). Deploy berikutnya memakai cache dan jauh lebih cepat.

## 3. Verifikasi pasca-deploy

```bash
ssh deploy@<IP_VPS> "cd /opt/aural && docker compose ps"   # 3 service: web, voice-relay, caddy → Up
ssh deploy@<IP_VPS> "cd /opt/aural && docker compose logs voice-relay --tail 20"  # harus: "Listening on ws://localhost:8766", tanpa error
curl -I https://<domain>                                    # HTTP/2 200/307 + sertifikat valid
```

Uji fungsional dari browser: buka `https://<domain>`, login, jalankan satu interview mode **Voice** end-to-end (mic connect → TTS keluar → jawaban tersimpan), dan satu interview **Chat** (bukti koneksi Supabase server-side benar).

## 4. Troubleshooting

| Gejala | Penyebab umum | Perbaikan |
|---|---|---|
| `voice-relay` restart terus, log `MINIMAX_API_KEY is required` | Key kosong/salah di `.env` server | Perbaiki `.env`, lalu `docker compose up -d` |
| Caddy tidak menerbitkan sertifikat | DNS belum mengarah / port 80 tertutup | Cek A record + `ufw status`, tunggu beberapa menit |
| Build gagal `Killed` saat `next build` | RAM kurang | Tambah swap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`, build ulang |
| `502` pada `/ws/voice` | `voice-relay` mati | `docker compose logs voice-relay`, perbaiki, `docker compose up -d` |
| Login gagal, log `web` error Supabase | Kredensial Supabase salah / schema belum dimigrasi | Verifikasi `.env` + `npx supabase db push` dari workstation |

**Rollback:** `ssh deploy@<IP_VPS> "cd /opt/aural && git checkout <tag/commit-lama> && docker compose up -d --build"`.
