# Vendored runtime dependencies

OpenCode's plugin loader cannot resolve bare package imports (`node_modules`
lookup) from under non-ASCII paths such as `C:\Users\Sebastián\...`
(`Cannot find package ...` at plugin load). Everything in this directory is
therefore imported via **relative paths only** — no `node_modules` lookup is
needed at load time. `hub/vendor/package.json` pins `{"type":"commonjs"}` so
these CJS files are not parsed as ESM under the plugin's `"type": "module"`.

## Contents (versions per sibling `package.json`)

| Package | Version | Files |
|---|---|---|
| `bonjour-service` | 1.4.4 | `dist/**` (`.js` + `.d.ts`, maps dropped) |
| `multicast-dns` | 7.2.5 | `index.js` |
| `fast-deep-equal` | 3.1.3 | `index.js`, `es6/index.js` (+ `.d.ts`) |
| `dns-packet` | 5.6.1 | `index.js`, `classes.js`, `opcodes.js`, `optioncodes.js`, `rcodes.js`, `types.js` |
| `thunky` | 1.1.0 | `index.js` |
| `@leichtgewicht/ip-codec` | 2.0.5 | flattened to `ip-codec/index.cjs` |

## Rewritten specifiers (relative to each importing file)

- `bonjour-service/dist/lib/mdns-server.js`: `multicast-dns` → `../../../multicast-dns/index.js`, `fast-deep-equal/es6` → `../../../fast-deep-equal/es6/index.js`
- `multicast-dns/index.js`: `dns-packet` → `../dns-packet/index.js`, `thunky` → `../thunky/index.js`
- `dns-packet/index.js`: `@leichtgewicht/ip-codec` → `../ip-codec/index.cjs`
- `hub/src/hub.ts`: `bonjour-service` → `../vendor/bonjour-service/dist/index.js`

## Regenerating

1. `bun install` (or `npm install`) in `hub/` to refresh `../node_modules`.
2. Re-copy the files listed above (keep the directory layout).
3. Re-apply the specifier rewrites listed above.
4. Smoke-test: `node -e "const m=require('./vendor/bonjour-service/dist/index.js');const C=m.default||m;const b=new C();console.log('VENDOR-OK',typeof b.publish);b.destroy()"` from `hub/`.
