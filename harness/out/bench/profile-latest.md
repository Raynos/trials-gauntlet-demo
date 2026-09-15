# Frame CPU profile — 058333f — b1-first-ride @ phone (¼ canvas), 300 frames, loadavg 32

## high — sampled 596 ms of JS + GL submit over 300 frames (1.99 ms/frame incl. physics + measurement; render() p50 1.49 ms) · allocations 64.3 MB = 219.5 KB/frame · excluded from the ranking: (idle) 19 ms, readPixels 33283 ms

| # | self ms | % | µs/frame | function | where |
|---|---|---|---|---|---|
| 1 | 110.6 | 18.6 | 369 | `(program)` |  |
| 2 | 42.6 | 7.1 | 142 | `getParameters` | chunk-75Q2W5AA.js:36479 |
| 3 | 38.5 | 6.4 | 128 | `projectObject` | chunk-75Q2W5AA.js:42552 |
| 4 | 34.4 | 5.8 | 115 | `WebGLRenderer.renderBufferDirect` | chunk-75Q2W5AA.js:42252 |
| 5 | 32.4 | 5.4 | 108 | `update` | chunk-75Q2W5AA.js:34640 |
| 6 | 30.5 | 5.1 | 102 | `updateMatrixWorld` | chunk-75Q2W5AA.js:7337 |
| 7 | 17.2 | 2.9 | 57 | `multiplyMatrices` | chunk-75Q2W5AA.js:5617 |
| 8 | 15.2 | 2.5 | 51 | `renderObject` | chunk-75Q2W5AA.js:37887 |
| 9 | 14.5 | 2.4 | 48 | `gl.renderBufferDirect` | (native) |
| 10 | 12.4 | 2.1 | 41 | `intersectsFrustum` | chunk-75Q2W5AA.js:13729 |
| 11 | 11.8 | 2.0 | 39 | `upload` | chunk-75Q2W5AA.js:35762 |
| 12 | 11.1 | 1.9 | 37 | `bindVertexArray` | (native) |
| 13 | 9.0 | 1.5 | 30 | `getProgram` | chunk-75Q2W5AA.js:42725 |
| 14 | 8.7 | 1.5 | 29 | `setProgram` | chunk-75Q2W5AA.js:42832 |
| 15 | 7.2 | 1.2 | 24 | `getProgramCacheKey` | chunk-75Q2W5AA.js:36704 |
| 16 | 7.2 | 1.2 | 24 | `arraysEqual` | chunk-75Q2W5AA.js:35129 |
| 17 | 7.1 | 1.2 | 24 | `now` | (native) |
| 18 | 6.5 | 1.1 | 22 | `update` | chunk-75Q2W5AA.js:34878 |
| 19 | 6.1 | 1.0 | 20 | `refreshUniformsCommon` | chunk-75Q2W5AA.js:40807 |
| 20 | 5.6 | 0.9 | 19 | `copyArray` | chunk-75Q2W5AA.js:35136 |

By file: (native) 5613 % · chunk-75Q2W5AA.js 65 % · bike.ts 2 % · index.ts 1 % · hud.ts 1 % · game.ts 1 % · gltfRider.ts 1 % · rig.ts 0 %

| # | KB/frame | count | allocation site | caller |
|---|---|---|---|---|
| 1 | 87.26 | 8 | `getParameters chunk-75Q2W5AA.js:36479` | getProgram chunk-75Q2W5AA.js:42725 |
| 2 | 26.69 | 8 | `join (native):0` | getProgram chunk-75Q2W5AA.js:42725 |
| 3 | 15.04 | 12 | `setValueM4 chunk-75Q2W5AA.js:35238` | setProgram chunk-75Q2W5AA.js:42832 |
| 4 | 14.19 | 8 | `getProgramCacheKeyParameters chunk-75Q2W5AA.js:36726` | getProgram chunk-75Q2W5AA.js:42725 |
| 5 | 7.60 | 2 | `setValueV3f chunk-75Q2W5AA.js:35172` | setValue chunk-75Q2W5AA.js:35697 |
| 6 | 6.47 | 6 | `next (native):0` | (anonymous) index.ts:1157 |
| 7 | 5.00 | 8 | `setProgram chunk-75Q2W5AA.js:42832` | WebGLRenderer.renderBufferDirect chunk-75Q2W5AA.js:42252 |
| 8 | 3.68 | 4 | `setValueV3f chunk-75Q2W5AA.js:35172` | setProgram chunk-75Q2W5AA.js:42832 |
| 9 | 2.79 | 5 | `setValueM3 chunk-75Q2W5AA.js:35224` | setProgram chunk-75Q2W5AA.js:42832 |
| 10 | 2.50 | 8 | `getProgram chunk-75Q2W5AA.js:42725` | setProgram chunk-75Q2W5AA.js:42832 |
| 11 | 2.14 | 2 | `sort (native):0` | sort chunk-75Q2W5AA.js:37055 |
| 12 | 2.09 | 1 | `derive bike.ts:1551` | step bike.ts:286 |
| 13 | 1.97 | 7 | `values (native):0` | (anonymous) index.ts:1157 |
| 14 | 1.78 | 2 | `refreshTransformUniform chunk-75Q2W5AA.js:40741` | refreshUniformsCommon chunk-75Q2W5AA.js:40807 |
| 15 | 1.65 | 2 | `painterSortStable chunk-75Q2W5AA.js:36961` | sort (native):0 |
| 16 | 1.60 | 2 | `update rig.ts:109` | r.rig.update (native):13 |
| 17 | 1.57 | 2 | `setValueV1fArray chunk-75Q2W5AA.js:35482` | setProgram chunk-75Q2W5AA.js:42832 |
| 18 | 1.56 | 2 | `setValue chunk-75Q2W5AA.js:35697` | setValue chunk-75Q2W5AA.js:35697 |
| 19 | 1.46 | 8 | `projectObject chunk-75Q2W5AA.js:42552` | projectObject chunk-75Q2W5AA.js:42552 |
| 20 | 1.19 | 2 | `setValueM4Array chunk-75Q2W5AA.js:35505` | setProgram chunk-75Q2W5AA.js:42832 |

## low — sampled 390 ms of JS + GL submit over 300 frames (1.30 ms/frame incl. physics + measurement; render() p50 0.89 ms) · allocations 30.7 MB = 104.9 KB/frame · excluded from the ranking: getProgramInfoLog 1279 ms, getShaderInfoLog 2 ms, readPixels 14384 ms, getProgramParameter 0 ms, (idle) 9 ms

| # | self ms | % | µs/frame | function | where |
|---|---|---|---|---|---|
| 1 | 73.8 | 18.9 | 246 | `(program)` |  |
| 2 | 37.7 | 9.7 | 126 | `updateMatrixWorld` | chunk-75Q2W5AA.js:7337 |
| 3 | 26.1 | 6.7 | 87 | `projectObject` | chunk-75Q2W5AA.js:42552 |
| 4 | 16.3 | 4.2 | 54 | `multiplyMatrices` | chunk-75Q2W5AA.js:5617 |
| 5 | 15.2 | 3.9 | 51 | `(garbage collector)` |  |
| 6 | 14.6 | 3.8 | 49 | `WebGLRenderer.renderBufferDirect` | chunk-75Q2W5AA.js:42252 |
| 7 | 11.3 | 2.9 | 38 | `getParameters` | chunk-75Q2W5AA.js:36479 |
| 8 | 11.0 | 2.8 | 37 | `gl.renderBufferDirect` | (native) |
| 9 | 8.6 | 2.2 | 29 | `update` | chunk-75Q2W5AA.js:34640 |
| 10 | 8.2 | 2.1 | 27 | `upload` | chunk-75Q2W5AA.js:35762 |
| 11 | 7.4 | 1.9 | 25 | `renderObject` | chunk-75Q2W5AA.js:37887 |
| 12 | 7.3 | 1.9 | 24 | `getProgram` | chunk-75Q2W5AA.js:42725 |
| 13 | 7.0 | 1.8 | 23 | `setProgram` | chunk-75Q2W5AA.js:42832 |
| 14 | 6.5 | 1.7 | 22 | `update` | chunk-75Q2W5AA.js:34878 |
| 15 | 5.3 | 1.4 | 18 | `now` | (native) |
| 16 | 5.1 | 1.3 | 17 | `intersectsFrustum` | chunk-75Q2W5AA.js:13729 |
| 17 | 4.9 | 1.3 | 16 | `getProgramCacheKey` | chunk-75Q2W5AA.js:36704 |
| 18 | 4.7 | 1.2 | 16 | `setValue` | chunk-75Q2W5AA.js:35697 |
| 19 | 4.6 | 1.2 | 15 | `arraysEqual` | chunk-75Q2W5AA.js:35129 |
| 20 | 3.8 | 1.0 | 13 | `bindVertexArray` | (native) |

By file: (native) 4053 % · chunk-75Q2W5AA.js 60 % · hud.ts 1 % · index.ts 1 % · bike.ts 1 % · gltfRider.ts 1 % · rig.ts 1 % · mapParams.ts 0 %

| # | KB/frame | count | allocation site | caller |
|---|---|---|---|---|
| 1 | 26.72 | 3 | `getParameters chunk-75Q2W5AA.js:36479` | getProgram chunk-75Q2W5AA.js:42725 |
| 2 | 9.77 | 3 | `setValueM4 chunk-75Q2W5AA.js:35238` | setProgram chunk-75Q2W5AA.js:42832 |
| 3 | 9.33 | 3 | `join (native):0` | getProgramCacheKey chunk-75Q2W5AA.js:36704 |
| 4 | 6.04 | 1 | `setValueV3f chunk-75Q2W5AA.js:35172` | setValue chunk-75Q2W5AA.js:35697 |
| 5 | 4.24 | 3 | `getProgramCacheKeyParameters chunk-75Q2W5AA.js:36726` | getProgramCacheKey chunk-75Q2W5AA.js:36704 |
| 6 | 3.52 | 3 | `setProgram chunk-75Q2W5AA.js:42832` | WebGLRenderer.renderBufferDirect chunk-75Q2W5AA.js:42252 |
| 7 | 2.93 | 7 | `next (native):0` | (anonymous) index.ts:1157 |
| 8 | 2.70 | 1 | `setValueM3 chunk-75Q2W5AA.js:35224` | setProgram chunk-75Q2W5AA.js:42832 |
| 9 | 2.38 | 1 | `setValueV3f chunk-75Q2W5AA.js:35172` | setProgram chunk-75Q2W5AA.js:42832 |
| 10 | 1.99 | 1 | `setValueV4f chunk-75Q2W5AA.js:35194` | setProgram chunk-75Q2W5AA.js:42832 |
| 11 | 1.63 | 1 | `update rig.ts:109` | r.rig.update (native):13 |
| 12 | 1.55 | 1 | `LinearToSRGB chunk-75Q2W5AA.js:3573` | refreshFogUniforms chunk-75Q2W5AA.js:40747 |
| 13 | 1.54 | 1 | `refreshFogUniforms chunk-75Q2W5AA.js:40747` | setProgram chunk-75Q2W5AA.js:42832 |
| 14 | 1.34 | 1 | `painterSortStable chunk-75Q2W5AA.js:36961` | sort (native):0 |
| 15 | 1.32 | 1 | `refreshTransformUniform chunk-75Q2W5AA.js:40741` | refreshUniformsCommon chunk-75Q2W5AA.js:40807 |
| 16 | 1.32 | 1 | `sort (native):0` | sort chunk-75Q2W5AA.js:37055 |
| 17 | 1.26 | 1 | `setValue chunk-75Q2W5AA.js:35697` | setValue chunk-75Q2W5AA.js:35697 |
| 18 | 1.11 | 5 | `values (native):0` | (anonymous) index.ts:1157 |
| 19 | 1.08 | 4 | `(anonymous) index.ts:1157` | traverse chunk-75Q2W5AA.js:7273 |
| 20 | 1.03 | 1 | `collide bike.ts:945` | step bike.ts:286 |

