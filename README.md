# GemWallet XRPL Testnet – Chrome Extension

Chrome extension built with **React** and **Vite** that integrates with [GemWallet](https://gemwallet.app) for **XRPL (XRP Ledger) on testnet**.

- [GemWallet API Reference](https://gemwallet.app/docs/api/gemwallet-api-reference)

## Prerequisites

1. **GemWallet extension** installed in Chrome  
   - [Chrome Web Store – GemWallet](https://chromewebstore.google.com/detail/gem-wallet/mlbiliclbknfnaefhmhdkfcfahfddpkp)
2. **GemWallet set to Testnet**  
   - Open GemWallet → **Settings** → **Network** → choose **Testnet**

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
2. **Check GemWallet** – verifies the GemWallet extension is installed.
3. **Connect Wallet** – reads address and network from GemWallet.
4. The popup shows:
   - Wallet address (when connected)
   - Current network (Mainnet / Testnet / Devnet)
   - A **Testnet** badge when GemWallet is on Testnet, or a hint to switch to Testnet in GemWallet.

The extension listens to GemWallet **walletChanged** and **networkChanged** events and refreshes the displayed data when you switch wallet or network.

## Project structure

```
gem-wallet/
├── public/
│   └── manifest.json       # Chrome extension manifest (v3)
├── src/
│   ├── App.tsx             # Popup UI + GemWallet API usage
│   ├── App.css
│   ├── main.tsx
│   ├── index.css
│   └── vite-env.d.ts
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## XRPL Testnet

- **Faucet:** [XRPL Testnet Faucet](https://faucet.altnet.rippletest.net/) (for test XRP)
- **Explorer:** [Testnet Explorer](https://testnet.xrpl.org/)

After loading the extension and setting GemWallet to Testnet, use **Connect Wallet** in the popup to confirm the address and that the network is **Testnet**.
