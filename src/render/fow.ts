import { DataTexture, LinearFilter, RedFormat, UnsignedByteType, type Material } from 'three';
import { MAP_SIZE } from '../shared/constants';

/**
 * Fog of war: one byte per tile (0 unexplored, ~110 explored, 255 in sight),
 * sampled by every world material so terrain outside your vision goes dim.
 */
const data = new Uint8Array(MAP_SIZE * MAP_SIZE);
export const fowTexture = new DataTexture(data, MAP_SIZE, MAP_SIZE, RedFormat, UnsignedByteType);
fowTexture.magFilter = LinearFilter;
fowTexture.minFilter = LinearFilter;
fowTexture.needsUpdate = true;

export const fowUniforms = {
  fowTex: { value: fowTexture },
  fowSize: { value: MAP_SIZE },
  fowOn: { value: 1 },
};

export function updateFow(explored: Uint8Array, visible: Uint8Array): void {
  for (let i = 0; i < data.length; i++) data[i] = visible[i] ? 255 : explored[i] ? 110 : 0;
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
    shader.uniforms.fowOn = fowUniforms.fowOn;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFowUv;\nuniform float fowSize;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFowUv = (modelMatrix * vec4(transformed, 1.0)).xz / fowSize;');
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
