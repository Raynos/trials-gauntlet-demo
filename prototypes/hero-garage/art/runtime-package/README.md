# Local runtime package

Run from the prototype directory:

```sh
npm run build
node tools/package-runtime.mjs
python3 -m http.server 4181 --directory runtime-dist
```

The packager reads `dist` without modifying it and creates the dedicated generated `runtime-dist` directory. It includes the current catalog's desktop and mobile assets, built JS/CSS, both HTML pages, their referenced images and the bundled runtime libraries' license notices. All paused head/hair studies are excluded. No source or public assets are deleted.

`reports/runtime-package.json` records every packaged file's SHA-256 and bytes, checked local references, and excluded files. Repeated execution against identical input produces the same manifest. Catalog URL fields reject external schemes, protocol-relative URLs, backslashes and traversal; missing referenced files fail packaging. Every copied output is rehashed before reporting success.

For this round, the existing Vite build was fresh: its index timestamp was later than `src/main.ts` and `src/style.css`, and its catalog matched the public catalog byte-for-byte. No rebuild was necessary. Commands run were `node tools/package-runtime.mjs` twice plus manifest hash comparison; parent owns recorded browser verification of the packaged preview.

This directory is a local prototype distribution, not a public deployment or evidence that production art/device gates are complete.

Parent verification: `reports/whole-package-round17.json` records an 8-second full-scene WebKit orbit/landing capture from port 4182, no browser errors and byte-identical deterministic canvas replay. Sequential decoded video frames were inspected; the assembly renders, but art quality remains provisional.
