# 🔧 Setup Cloudflare Worker - Step by Step

## Step 1: Daftar Akun Cloudflare (GRATIS)
1. Buka https://dash.cloudflare.com/sign-up
2. Daftar pake email + password
3. Verifikasi email

## Step 2: Install Wrangler CLI
```bash
# Install Node.js dulu kalau belum ada
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Wrangler (Cloudflare CLI)
npm install -g wrangler

# Login ke Cloudflare
wrangler login
```
→ Browser akan buka, klik "Allow" untuk authorize

## Step 3: Deploy Worker
```bash
# Masuk ke folder project
cd /root/multi-tools

# Init & deploy worker
wrangler deploy worker.js --name toolbox-api
```

→ Worker akan deploy ke: `https://toolbox-api.<your-subdomain>.workers.dev`

## Step 4: Custom Domain (opsional)
Untuk pake `api.romanzx.dev`:
1. Buka Cloudflare Dashboard → Workers & Pages
2. Klik worker "toolbox-api" → Settings → Triggers
3. Tambah Custom Domain: `api.romanzx.dev`
4. DNS record otomatis ditambahkan

## Step 5: Update Frontend
Ganti `API_BASE` di index.html ke worker URL kamu.

## DONE! 🎉
Worker sekarang bisa handle request dari frontend.
