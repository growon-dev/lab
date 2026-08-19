# lab

Small WebGL experiments. Each one lives in its own folder.

## pool-can

While everyone builds oceans, I built a pool.

A night pool rendered with Three.js, with one drink can floating in it. Click the can and the water takes on that flavor's color, spreading out from the point of impact. Click the bucket on the poolside to pour it back out. Click anywhere else and the palms sway.

**Live: [can.growon.kr](https://can.growon.kr)**

### What's in it

- Water surface driven by a custom GLSL vertex/fragment shader pair. The same wave function runs on the CPU too, so the can and the bucket float on the exact surface you see.
- Can labels drawn into a 2D canvas at runtime and wrapped onto the mesh as a texture, so a new flavor is just a palette entry in `src/flavors.js`.
- A CRT curvature pass over the whole scene. Pointer coordinates are warped through the same curve, so clicks land where they look like they land.
- Honors `prefers-reduced-motion`: wave amplitude, splashes, and camera drift all scale down.

### Running it

```bash
cd pool-can
npm install
npm run dev
```

Build with `npm run build`. Pushing to `main` builds this folder and publishes it to GitHub Pages.

### Stack

Three.js `0.185.1`, Vite, no framework. Anton and Noto Sans KR come from Google Fonts.
