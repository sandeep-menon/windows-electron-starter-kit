# windows-electron-starter-kit

A production-ready Electron starter with React, TypeScript, Tailwind CSS v4, shadcn/ui, electron-store, and electron-log - batteries included.

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
cd electron-starter-kit

# Install
npm install

# Develop
npm run dev

# Build
npm run build
```

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

## License

MIT

## Trouble Shooting

1. If electron distributable is not downloading, run:
```bash
node .\node_modules\electron\install.js
```
