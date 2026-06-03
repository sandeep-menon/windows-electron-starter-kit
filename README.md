# windows-electron-starter-kit

A production-ready Electron starter template with React, TypeScript, Tailwind CSS v4, shadcn/ui, electron-store, and electron-log.

## Stack

| Layer | Technology |
|---|---|
| Framework | [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/) |
| UI | [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) |
| Persistence | [electron-store](https://github.com/sindresorhus/electron-store) |
| Logging | [electron-log](https://github.com/megahertz/electron-log) |

## Getting Started

```bash
# Clone
git clone https://github.com/sandeep-menon/windows-electron-starter-kit.git
cd windows-electron-starter-kit

# Install
npm install

# Develop
npm run dev

# Build
npm run build
```

## Available Scripts

- `npm run dev`: Start the app in development mode with hot reload.
- `npm run build`: Build and package the app for distribution.

## Project Structure

```
electron-starter-kit/
├── src/
│   ├── main/           # Electron main process
│   ├── preload/        # Preload scripts
│   └── renderer/       # React app (UI)
├── electron-builder.yml
├── electron.vite.config.ts
├── package.json
├── tsconfig.json
├── tsconfig.node.json
└── tsconfig.web.json
```

## Features

- ⚡ Hot reload via electron-vite
- 🎨 shadcn/ui components with Tailwind CSS v4
- 💾 Persistent storage via electron-store
- 📋 Structured logging via electron-log with IPC bridge
- 🔒 Secure IPC with typed contextBridge

## Troubleshooting

### 1) Electron binary download fails

If the Electron distributable does not download during installation, run:

```bash
node .\\node_modules\\electron\\install.js
```

Then retry:

```bash
npm install
```

### 2) App icon is not updated in build output

To apply a custom icon consistently, update all of the following files:

- `resources/icon.png`
- `build/icon.png`
- `build/icon.ico`

Icon requirements:

- `icon.ico` should be at least 256x256.
- Use square source assets to avoid scaling artifacts.
- Re-run `npm run build` after replacing icon files.

### 3) Build succeeds but packaged app looks stale

If assets appear outdated:

- Remove previous output directories (for example `dist/`, if present).
- Re-run `npm run build`.
- Confirm you are launching the newly generated package.

## License

MIT