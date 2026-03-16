# Rothley Price Lock — Shopify App

A private Shopify app for **rothley.myshopify.com** that hides prices and locks the Add to Cart button based on fully configurable rules.

Built with:
- **React + Shopify Polaris** — native-looking admin UI
- **Node.js + Express** — backend via Netlify Functions (serverless)
- **SQLite (better-sqlite3)** — local database stored in `/tmp` on Netlify
- **Shopify ScriptTag API** — injects the storefront script automatically

---

## Features

| Feature | Description |
|---|---|
| **What to Lock** | Entire store, or select: Collections, Products, Variants, Pages, Blogs, Articles |
| **Specific targets** | Pick individual collections/products by handle |
| **What to hide** | Prices, Add to Cart, Buy Now, Checkout, Nav links |
| **Access criteria** | Logged In, Customer Tag, Email Domain, Passcode, Country, State, City, IP, Selected Customer |
| **Access mode** | Allow (whitelist) or Restrict (blacklist) |
| **Button customiser** | Text, colour, font size, padding, margin, border radius, custom CSS class, redirect URL |
| **Element selectors** | Override CSS selectors to work with any custom theme |
| **Live preview** | See exactly how the button will look before saving |
| **Script management** | One-click script registration via Shopify ScriptTag API |

---

## Project Structure

```
rothley-price-lock/
├── netlify/
│   └── functions/
│       ├── api.js              ← Main REST API (rules, settings, Shopify data)
│       ├── auth.js             ← Shopify OAuth handler
│       └── lib/
│           ├── db.js           ← SQLite database + all queries
│           ├── shopify.js      ← Shopify Admin API client
│           └── auth-middleware.js
├── src/
│   ├── App.jsx                 ← Root with Polaris Frame + navigation
│   ├── main.jsx
│   ├── lib/
│   │   └── api.js              ← Frontend API client
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── RulesPage.jsx
│   │   ├── RuleEditor.jsx      ← Main rule builder (4 tabs)
│   │   ├── ScriptPage.jsx
│   │   └── SettingsPage.jsx
│   └── components/
│       └── ButtonPreview.jsx
├── public/
│   └── storefront-script.js   ← Injected into Rothley's storefront
├── netlify.toml
├── vite.config.js
├── .env.example
└── README.md
```

---

## Setup: Step by Step

### 1. Create the app in Shopify Partner Dashboard

1. Go to [partners.shopify.com](https://partners.shopify.com)
2. Click **Apps → Create app → Create app manually**
3. Name it **"Rothley Price Lock"**
4. Set **App URL** to `https://YOUR-NETLIFY-SITE.netlify.app` (placeholder for now)
5. Set **Allowed redirection URLs** to `https://YOUR-NETLIFY-SITE.netlify.app/auth/callback`
6. Copy your **API Key** and **API Secret** — you'll need them next

### 2. Clone & configure locally

```bash
git clone https://github.com/YOUR-USERNAME/rothley-price-lock.git
cd rothley-price-lock

# Install frontend deps
npm install

# Install function deps
cp package-functions.json netlify/functions/package.json
cd netlify/functions && npm install && cd ../..

# Create your .env file
cp .env.example .env
```

Edit `.env`:

```env
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
HOST=https://rothley-price-lock.netlify.app   # update after first deploy
SHOP=rothley.myshopify.com
SESSION_SECRET=your_random_secret_string_32_chars_min
SHOPIFY_API_VERSION=2025-01
DB_PATH=/tmp/rothley-price-lock.db
```

### 3. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-USERNAME/rothley-price-lock.git
git push -u origin main
```

### 4. Deploy to Netlify

1. Go to [app.netlify.com](https://app.netlify.com)
2. Click **Add new site → Import an existing project**
3. Connect your GitHub account and select `rothley-price-lock`
4. Build settings (auto-detected from `netlify.toml`):
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
5. Click **Deploy site**
6. Once deployed, copy your Netlify URL (e.g. `https://rothley-price-lock.netlify.app`)

### 5. Set Netlify environment variables

In **Netlify → Site → Environment variables**, add:

| Variable | Value |
|---|---|
| `SHOPIFY_API_KEY` | Your Shopify app API key |
| `SHOPIFY_API_SECRET` | Your Shopify app API secret |
| `HOST` | `https://your-site.netlify.app` |
| `SHOP` | `rothley.myshopify.com` |
| `SESSION_SECRET` | Random 32+ char string |
| `SHOPIFY_API_VERSION` | `2025-01` |
| `DB_PATH` | `/tmp/rothley-price-lock.db` |
| `VITE_HOST` | `https://your-site.netlify.app` |
| `VITE_SHOP` | `rothley.myshopify.com` |

Trigger a redeploy after adding variables.

### 6. Update Shopify app URLs

Back in the Shopify Partner Dashboard, update:
- **App URL:** `https://your-site.netlify.app`
- **Allowed redirection URLs:** `https://your-site.netlify.app/auth/callback`

### 7. Install the app on your store

Visit:
```
https://your-site.netlify.app/auth?shop=rothley.myshopify.com
```

This will trigger the Shopify OAuth flow. Click **Install** when prompted.

### 8. Register the storefront script

Once inside the app admin, go to **Script & Embed** and click **Register Script on Store**.

This makes a single API call to Shopify to inject `storefront-script.js` on every page of rothley.com automatically.

---

## Local Development

Install [Netlify CLI](https://docs.netlify.com/cli/get-started/):

```bash
npm install -g netlify-cli
netlify login
netlify dev
```

This runs both the Vite frontend (port 5173) and Netlify Functions (port 8888) together at `http://localhost:8888`.

For OAuth to work locally you need a public HTTPS URL. Use [ngrok](https://ngrok.com):

```bash
ngrok http 8888
```

Update your `.env` `HOST` to the ngrok URL and update the Shopify Partner Dashboard app URLs too.

---

## How the storefront script works

The `public/storefront-script.js` file:

1. Loads `/api/config.json` from the Netlify app
2. Reads the current customer from `window.Shopify.customer` (Shopify exposes this on the storefront)
3. Detects the current page type (product, collection, etc.)
4. For each active rule that matches the page, checks if the customer passes the criteria
5. If the customer should be locked out:
   - Hides all price elements matching the configured CSS selectors
   - Replaces Add to Cart buttons with the custom lock button
   - Optionally prevents checkout
6. Uses `MutationObserver` to re-apply on dynamically loaded content (AJAX pagination, infinite scroll)

---

## Important Notes

### SQLite on Netlify
Netlify Functions run in ephemeral containers — data in `/tmp` **does not persist** between function invocations on the free tier. For production use with persistent rules, upgrade to one of:
- **Neon.tech** (free PostgreSQL) — replace better-sqlite3 with `pg`
- **PlanetScale** (free MySQL) — replace with `mysql2`
- **Netlify Blobs** (Netlify's own KV storage)

For a single-store private app with infrequently changed rules, the current setup works well since rules are seeded on first startup.

### Shopify ScriptTag deprecation notice
Shopify has announced ScriptTag API deprecation for some use cases. The manual theme embed option (`/script` page) is provided as an alternative. Always check [Shopify's changelog](https://shopify.dev/changelog) for the latest.
