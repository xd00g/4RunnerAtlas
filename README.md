# 4Runner Atlas

An interactive parts explorer for a 2005 Toyota 4Runner Sport 4WD V8, by [Nebulys](https://www.nebulys.net).

[Open the live viewer](https://4runner.nebulys.net/)

Select, isolate and explode vehicle systems, switch between spatial and grid layouts, and inspect component descriptions and qualified part-number references. Includes night lighting and an illustrative engine animation. Current coverage: 69 views and 779 documented component records.

## Run locally

Requires Node.js 20 or later and a browser with WebGL. There are no npm package dependencies.

```sh
npm run assets
npm start
```

Open http://127.0.0.1:8795/. Set `PORT` to use another port.

The first command downloads only the public viewer catalogs and GLB models from the live site, checks their locked SHA-256 hashes, and stores them in the ignored `data/` directory. The models total about 192.7 MB before HTTP compression. Models are distributed separately to keep this repository focused on application source. If the live assets change, use a matching asset lock and source release; mismatched files are rejected.

To produce static files for another web server:

```sh
npm run build
```

Serve `dist/` through HTTP. Opening the files directly with `file://` is not supported.

## Source layout

- `src/`: viewer JavaScript, HTML, CSS, branding and bundled rendering dependencies.
- `scripts/`: public-asset setup, local server and static build.
- `assets-lock.json`: public catalog/model filenames and integrity hashes.

No analytics tracker is included. Manuals, private reference files, infrastructure configuration, editable models and print packages are not part of this repository.

## Model limitations and credits

Coverage is partial and geometry is illustrative. Dimensions, mechanical clearances, installed variants and replacement fitment are not verified. An exploded view is not a repair procedure; engine animation is not a mechanical simulation.

The exterior is credited to Pitstop 3D in the acquired file and was obtained through sadiqminhas on Sketchfab, under CC BY 4.0. Both credits and source links are retained in `src/licenses.html`. Changes include Sport lettering, a viper-cut front bumper, assembly separation and approximate internal systems.

Three.js and its bundled helpers retain their MIT license. Inter, Sora and JetBrains Mono retain their SIL Open Font License notices. See `src/licenses.html` and the notices under `src/vendor/` and `src/brand/fonts/`. These notices apply to their respective assets; no blanket license for all project code is implied.
