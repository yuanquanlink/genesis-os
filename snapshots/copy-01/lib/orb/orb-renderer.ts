// Ported from lersent001/orb (MIT): src/orb-renderer.ts + shader-source.ts.
// The shader is served from /public/orb/effect.wgsl so Genesis does not need a
// Vite raw-loader path and the renderer can remain a client-only integration.

import { writeOrbUniforms } from "@/lib/orb/orb-uniforms";
import { type OrbParams } from "@/lib/orb/presets";

export type OrbRendererOptions = {
  canvas: HTMLCanvasElement;
  getParams: () => OrbParams;
  onError: (error: Error) => void;
  onReady: () => void;
};

const vertexAndFragment = `
struct VOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> VOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0),
  );
  var out: VOut;
  out.pos = vec4<f32>(p[i], 0.0, 1.0);
  let uv01 = (p[i] + vec2<f32>(1.0)) * 0.5;
  out.uv = vec2<f32>(uv01.x, 1.0 - uv01.y);
  return out;
}

@fragment
fn fs_main(in: VOut) -> @location(0) vec4<f32> {
  let c = orbGlassLiquidAnim(in.uv);
  let fc = vec2<f32>(in.uv.x, 1.0 - in.uv.y) * u.size;
  let uv = (2.0 * fc - u.size) / max(min(u.size.x, u.size.y), 1.0);
  let rad = max(u.radius, 0.05);
  let t = u.time * u.speed;
  let contourRad = rad * glsContourScale(uv, t, u.contourDeform);
  let pd = length(uv) / contourRad;
  let ballA = 1.0 - smoothstep(
    0.99 - mfEdgeD(u.edgeSoftness),
    1.01 + mfEdgeD(u.edgeSoftness),
    pd,
  );
  let lum = max(c.r, max(c.g, c.b));
  let q = (2.0 * fc - u.size) / u.size;
  let fitEnd = 1.0;
  let fitFeather = 2.0 / max(min(u.size.x, u.size.y), 1.0);
  let fitStart = min(mix(contourRad, fitEnd, 0.5), fitEnd - fitFeather);
  let fit = 1.0 - smoothstep(fitStart, fitEnd, max(abs(q.x), abs(q.y)));
  let alpha = select(ballA, max(ballA, lum), u.edgeGlow > 0.0);
  return vec4<f32>(c.rgb * fit, clamp(alpha, 0.0, 1.0) * fit);
}
`;

type NavigatorWithGpu = Navigator & { gpu?: GPU };

let shaderSourcePromise: Promise<string> | null = null;

function loadShaderSource() {
  shaderSourcePromise ??= fetch("/orb/effect.wgsl", { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`Orb shader load failed: ${response.status}`);
      return response.text();
    })
    .then((effectSource) => `${effectSource}\n${vertexAndFragment}`);
  return shaderSourcePromise;
}

export function createOrbRenderer({
  canvas,
  getParams,
  onError,
  onReady,
}: OrbRendererOptions): () => void {
  let disposed = false;
  let animationFrame = 0;
  let device: GPUDevice | null = null;
  let readyNotified = false;
  let failed = false;

  function fail(error: Error): void {
    if (disposed || failed) return;
    failed = true;
    cancelAnimationFrame(animationFrame);
    device?.destroy();
    onError(error);
  }

  async function start(): Promise<void> {
    const gpu = (navigator as NavigatorWithGpu).gpu;
    if (!gpu) throw new Error("当前浏览器不支持 WebGPU");
    const adapter = await gpu.requestAdapter();
    if (!adapter) throw new Error("未找到可用的 WebGPU 适配器");
    device = await adapter.requestDevice();
    if (disposed) {
      device.destroy();
      return;
    }

    const context = canvas.getContext("webgpu");
    if (!context) throw new Error("无法创建 WebGPU 画布上下文");
    const gpuContext = context as GPUCanvasContext;
    const format = gpu.getPreferredCanvasFormat();
    gpuContext.configure({ device, format, alphaMode: "premultiplied" });

    const shader = device.createShaderModule({
      label: "genesis-orb-glass-liquid",
      code: await loadShaderSource(),
    });
    const compilation = await shader.getCompilationInfo();
    const compilationErrors = compilation.messages.filter((message) => message.type === "error");
    if (compilationErrors.length > 0) {
      throw new Error(compilationErrors.map((message) => `${message.lineNum}:${message.linePos} ${message.message}`).join("\n"));
    }

    const pipeline = device.createRenderPipeline({
      label: "genesis-orb-glass-liquid-pipeline",
      layout: "auto",
      vertex: { module: shader, entryPoint: "vs_main" },
      fragment: { module: shader, entryPoint: "fs_main", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    const values = new Float32Array(120);
    const uniformBuffer = device.createBuffer({
      size: values.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });
    const startedAt = performance.now();

    device.lost.then((info) => fail(new Error(`WebGPU 设备已断开：${info.message || info.reason}`)));
    device.addEventListener("uncapturederror", (event) => {
      event.preventDefault();
      fail(new Error(`WebGPU 渲染错误：${event.error.message}`));
    });

    function resize(): void {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    }

    function frame(now: number): void {
      if (disposed || failed || !device) return;
      try {
        resize();
        writeOrbUniforms(values, canvas.width, canvas.height, (now - startedAt) / 1000, getParams());
        device.queue.writeBuffer(uniformBuffer, 0, values);
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: gpuContext.getCurrentTexture().createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: "clear",
              storeOp: "store",
            },
          ],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3, 1, 0, 0);
        pass.end();
        device.queue.submit([encoder.finish()]);
        if (!readyNotified) {
          readyNotified = true;
          onReady();
        }
        animationFrame = requestAnimationFrame(frame);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    }

    animationFrame = requestAnimationFrame(frame);
  }

  start().catch((error: unknown) => {
    fail(error instanceof Error ? error : new Error(String(error)));
  });

  return () => {
    disposed = true;
    cancelAnimationFrame(animationFrame);
    device?.destroy();
  };
}
