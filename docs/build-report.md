# Build report — Spire Smash (3D, three.js)

Размеры по сетям одинаковы для всех вариантов. Сгенерировано `python tools/build_playable.py --variant all`.


| network | file | size | limit | ok |
|---|---|---|---|---|
| applovin | `applovin.html` | 0.78 MB | 5 MB | yes |
| unity | `unity.html` | 0.78 MB | 5 MB | yes |
| ironsource | `ironsource.html` | 0.78 MB | 5 MB | yes |
| mintegral | `mintegral.html` | 0.78 MB | 5 MB | yes |
| google | `google.zip` | 0.22 MB | 5 MB | yes |
| meta | `meta.html` | 0.78 MB | 2 MB | yes |
| preview | `preview.html` | 0.78 MB | 5 MB | yes |

## What the bytes are (before base64 for images/models, +33% inline)

| part | size |
|---|---|
| three.js (tree-shaken) | 713 KB |
| game code (minified) | 44 KB |
| image hand | 7 KB |
