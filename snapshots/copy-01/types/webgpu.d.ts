interface Navigator {
  gpu?: GPU;
}

interface GPU {
  requestAdapter(): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): GPUTextureFormat;
}

interface GPUAdapter {
  requestDevice(): Promise<GPUDevice>;
}

type GPUTextureFormat = string;

interface GPUDevice extends EventTarget {
  queue: GPUQueue;
  lost: Promise<{ message: string; reason: string }>;
  destroy(): void;
  createShaderModule(descriptor: { label?: string; code: string }): GPUShaderModule;
  createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
  createBuffer(descriptor: { size: number; usage: number }): GPUBuffer;
  createBindGroup(descriptor: { layout: GPUBindGroupLayout; entries: Array<{ binding: number; resource: { buffer: GPUBuffer } }> }): GPUBindGroup;
  createCommandEncoder(): GPUCommandEncoder;
  addEventListener(type: "uncapturederror", listener: (event: GPUUncapturedErrorEvent) => void): void;
}

interface GPUUncapturedErrorEvent extends Event {
  error: { message: string };
}

interface GPUShaderModule {
  getCompilationInfo(): Promise<{ messages: Array<{ type: string; lineNum: number; linePos: number; message: string }> }>;
}

interface GPURenderPipeline {
  getBindGroupLayout(index: number): GPUBindGroupLayout;
}

interface GPURenderPipelineDescriptor {
  label?: string;
  layout: "auto";
  vertex: { module: GPUShaderModule; entryPoint: string };
  fragment: { module: GPUShaderModule; entryPoint: string; targets: Array<{ format: GPUTextureFormat }> };
  primitive: { topology: "triangle-list" };
}

interface GPUCanvasContext {
  configure(descriptor: { device: GPUDevice; format: GPUTextureFormat; alphaMode: "premultiplied" }): void;
  getCurrentTexture(): { createView(): GPUTextureView };
}

interface HTMLCanvasElement {
  getContext(contextId: "webgpu"): GPUCanvasContext | null;
}

interface GPUBuffer {
  readonly label?: string;
}
interface GPUBindGroup {
  readonly label?: string;
}
interface GPUBindGroupLayout {
  readonly label?: string;
}
interface GPUTextureView {
  readonly label?: string;
}

interface GPUQueue {
  writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: Float32Array): void;
  submit(commandBuffers: GPUCommandBuffer[]): void;
}

interface GPUCommandEncoder {
  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder;
  finish(): GPUCommandBuffer;
}

interface GPURenderPassDescriptor {
  colorAttachments: Array<{
    view: GPUTextureView;
    clearValue: { r: number; g: number; b: number; a: number };
    loadOp: "clear";
    storeOp: "store";
  }>;
}

interface GPURenderPassEncoder {
  setPipeline(pipeline: GPURenderPipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup): void;
  draw(vertexCount: number, instanceCount: number, firstVertex: number, firstInstance: number): void;
  end(): void;
}

interface GPUCommandBuffer {
  readonly label?: string;
}

declare const GPUBufferUsage: {
  UNIFORM: number;
  COPY_DST: number;
};
