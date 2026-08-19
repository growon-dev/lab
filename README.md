# pool-can

An interactive WebGL experiment featuring a nocturnal pool scene, built with Three.js.

Clicking the floating can causes the water to adopt the drink's color, propagating outward from the point of impact. Interacting with the poolside bucket drains the color, restoring the original state. Clicking anywhere else in the scene triggers a gentle sway in the surrounding palm trees.

Live Demo: [can.growon.kr](https://can.growon.kr)

## Key Features

- Custom GLSL Shaders & Physics: The water surface is driven by a custom vertex and fragment shader pair. The same wave calculations are synchronized on the CPU, ensuring the can and bucket float precisely on the rendered surface.
- Dynamic Texture Generation: Can labels are rendered to a 2D canvas at runtime and applied as textures to the mesh. Introducing a new flavor requires only a new palette entry in `src/flavors.js`.
- Post-Processing & Raycasting: A CRT curvature effect is applied globally across the scene. Pointer coordinates are inversely mapped through the distortion curve to ensure precise hit detection and raycasting.
- Accessibility: Fully respects the `prefers-reduced-motion` media query by automatically scaling down wave amplitude, particle splashes, and ambient camera drift.

## Local Development

```bash
cd pool-can
npm install
npm run dev
```

Run `npm run build` for a production bundle. Any push to `main` builds this folder and publishes it to GitHub Pages.

## Stack

Three.js `0.185.1` and Vite, no framework. Anton and Noto Sans KR are served from Google Fonts.
