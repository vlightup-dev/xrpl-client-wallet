# XRPL Testnet Wallet – Chrome Extension

Chrome extension built with **React** and **Vite** that creates and manages an **XRPL (XRP Ledger) wallet** on Testnet using [xrpl.js](https://js.xrpl.org/).

- [XRPL.js Get Started](https://xrpl.org/docs/tutorials/javascript/build-apps/get-started)

## Features

- **Create a new wallet** – Set a password; a new XRPL wallet is generated and the seed is stored encrypted (PBKDF2 + AES-GCM).
- **Unlock** – Enter your password to decrypt the wallet and open the dashboard.
- **Dashboard** – View your address, balance (from Testnet), and **fund your wallet** via the Testnet faucet.

## Prerequisites

- Chrome (or Chromium-based browser) for the extension.
- No external wallet required; the extension holds the wallet (encrypted) locally.

## Setup

```bash
npm install
npm run build
```

## Load in Chrome

1. Open `chrome://extensions/`
2. Turn **Developer mode** on
3. Click **Load unpacked**
4. Select the **`dist`** folder (created by `npm run build`)

## Development

- **Build once:** `npm run build`
- **Watch mode:** `npm run dev` (rebuilds on file changes; reload the extension in `chrome://extensions/` after changes)

## Usage

1. Click the extension icon to open the popup.
2. **Create a new wallet** – Set a password (and confirm). A new XRPL wallet is created and you are taken to the dashboard.
3. **Unlock** (next time) – Enter your password to open the dashboard.
4. **Dashboard** – Your address and balance are shown. Use **Fund your wallet** to open the Testnet faucet; paste your address there to receive test XRP.

## XRPL Testnet

- **Faucet:** [XRPL Testnet Faucet](https://faucet.altnet.rippletest.net/) – get test XRP
- **Explorer:** [Testnet Explorer](https://testnet.xrpl.org/) – view accounts and transactions

The extension connects to Testnet at `wss://s.altnet.rippletest.net:51233` to fetch balance. Test tokens have no real value.

## Project structure

```
wallet/
├── public/
│   └── manifest.json       # Chrome extension manifest (v3)
├── src/
│   ├── App.tsx             # View state + wallet create/unlock flow
│   ├── walletStorage.ts    # Encrypted seed storage (chrome.storage)
│   ├── components/         # HomeNoWallet, HomeUnlock, CreatePassword, UnlockedDashboard
│   ├── main.tsx
│   └── index.css
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```
