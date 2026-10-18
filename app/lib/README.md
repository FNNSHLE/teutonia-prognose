# Vendored libraries

Unmodified UMD builds, loaded as classic `<script>` tags in `app/index.html`. No build step, no
`package.json`. To update: add the new file with the version in its name, adjust this list and the script
tags, and bump `?v=` in `app/index.html`.

| File | Library | License | Global |
| --- | --- | --- | --- |
| `preact-10.29.2.umd.js` | Preact 10.29.2 | MIT | `window.preact` |
| `preact-hooks-10.29.2.umd.js` | Preact Hooks 10.29.2, expects `window.preact`, load after Preact | MIT | `window.preactHooks` |
| `htm-3.1.1.umd.js` | htm 3.1.1 | Apache-2.0 | `window.htm` |

Sources and checksums:

```
preact-10.29.2.umd.js        https://unpkg.com/preact@10.29.2/dist/preact.umd.js
                             sha256 08b3e370787c8206405e960a0aad5d605e46f5255346f8e715fbe65b4b8639e3
preact-hooks-10.29.2.umd.js  https://unpkg.com/preact@10.29.2/hooks/dist/hooks.umd.js
                             sha256 c3f9c0224475e2110202da5fe054f65f04b7aa35932017b08645d1b0d3342748
htm-3.1.1.umd.js             https://unpkg.com/htm@3.1.1/dist/htm.umd.js
                             sha256 7a31776e04bd4afde0d4308177d26f377716fcf7e4bd70be590746d6aa594f08
```

Verify: `shasum -a 256 app/lib/*.js`
