import { DataTexture, LinearFilter, RedFormat, UnsignedByteType, Vector2, type Material } from 'three';
import { Fog } from '../shared/fog';

/**
 * Fog of war: one byte per tile (0 unexplored, ~110 explored, 255 in sight) for a window of the world around the
 * camera, sampled by every world material so terrain outside your vision goes dim.
 */
const FW = 768;
const data = new Uint8Array(FW * FW);
export const fowTexture = new DataTexture(data, FW, FW, RedFormat, UnsignedByteType);
fowTexture.magFilter = LinearFilter;
fowTexture.minFilter = LinearFilter;
fowTexture.needsUpdate = true;

export const fowUniforms = {
  fowTex: { value: fowTexture },
  fowSize: { value: FW },
  fowOrigin: { value: new Vector2(0, 0) },
  fowOn: { value: 1 },
};

/** Refills the window around (cx, cy) from the fog store: explored chunk by chunk, then what's in sight. */
export function updateFow(fog: Fog, cx: number, cy: number): void {
  const ox = Math.floor(cx) - FW / 2, oy = Math.floor(cy) - FW / 2;
  fowUniforms.fowOrigin.value.set(ox, oy);
  data.fill(0);
  const cps = Math.ceil(fog.size / 32);
  for (let ky = Math.max(0, Math.floor(oy / 32)); ky <= Math.floor((oy + FW - 1) / 32) && ky < cps; ky++) {
    for (let kx = Math.max(0, Math.floor(ox / 32)); kx <= Math.floor((ox + FW - 1) / 32) && kx < cps; kx++) {
      const seen = fog.seen.get(ky * cps + kx);
      if (!seen) continue;
      for (let ly = 0; ly < 32; ly++) {
        const y = ky * 32 + ly - oy;
        if (y < 0 || y >= FW) continue;
        for (let lx = 0; lx < 32; lx++) {
          const x = kx * 32 + lx - ox;
          if (x >= 0 && x < FW && seen[ly * 32 + lx]) data[y * FW + x] = 110;
        }
      }
    }
  }
  const vw = Fog.W;
  for (let vy = 0; vy < vw; vy++) {
    const y = fog.oy + vy - oy;
    if (y < 0 || y >= FW) continue;
    for (let vx = 0; vx < vw; vx++) {
      if (!fog.vis[vy * vw + vx]) continue;
      const x = fog.ox + vx - ox;
      if (x >= 0 && x < FW) data[y * FW + x] = 255;
    }
  }
  fowTexture.needsUpdate = true;
}

export function fillFow(v: number): void {
  data.fill(v);
  fowTexture.needsUpdate = true;
}

export function withFow<T extends Material>(m: T): T {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.fowTex = fowUniforms.fowTex;
    shader.uniforms.fowSize = fowUniforms.fowSize;
    shader.uniforms.fowOrigin = fowUniforms.fowOrigin;
    shader.uniforms.fowOn = fowUniforms.fowOn;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFowUv;\nuniform float fowSize;\nuniform vec2 fowOrigin;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFowUv = ((modelMatrix * vec4(transformed, 1.0)).xz - fowOrigin) / fowSize;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFowUv;\nuniform sampler2D fowTex;\nuniform float fowOn;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        if (fowOn > 0.5) {
          float fv = texture2D(fowTex, vFowUv).r;
          float vis = smoothstep(0.5, 0.95, fv);
          float ex = smoothstep(0.03, 0.4, fv);
          vec3 col = gl_FragColor.rgb;
          float gray = dot(col, vec3(0.3, 0.59, 0.11));
          vec3 dim = mix(vec3(gray), col, 0.4) * 0.55;
          col = mix(dim, col, vis);
          col = mix(col * 0.07, col, ex);
          gl_FragColor.rgb = col;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'fow';
  return m;
}
