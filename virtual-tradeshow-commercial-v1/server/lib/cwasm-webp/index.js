/* global WebAssembly */
const fs = require('fs');
const path = require('path');

const stubs = {
  fd_close() { throw new Error('Syscall fd_close not implemented'); },
  fd_seek() { throw new Error('Syscall fd_seek not implemented'); },
  fd_write() { throw new Error('Syscall fd_write not implemented'); }
};

const code = fs.readFileSync(path.join(__dirname, 'webp.wasm'));
const wasmModule = new WebAssembly.Module(code);
const instance = new WebAssembly.Instance(wasmModule, { wasi_snapshot_preview1: stubs });

exports.decode = function (input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const inputPointer = instance.exports.malloc(buf.byteLength);
  const targetView = new Uint8Array(instance.exports.memory.buffer, inputPointer, buf.byteLength);
  targetView.set(buf);

  const metadataPointer = instance.exports.malloc(8);
  const outputPointer = instance.exports.WebPDecodeRGBA(inputPointer, buf.byteLength, metadataPointer, metadataPointer + 4);
  instance.exports.free(inputPointer);

  if (outputPointer === 0) {
    instance.exports.free(metadataPointer);
    throw new Error('Failed to decode WebP image: invalid WebP bitstream');
  }

  const metadata = new Uint32Array(instance.exports.memory.buffer, metadataPointer, 2);
  const [width, height] = metadata;
  instance.exports.free(metadataPointer);

  const outputSize = (width * height * 4);
  const output = new Uint8Array(outputSize);
  output.set(new Uint8Array(instance.exports.memory.buffer, outputPointer, outputSize));
  instance.exports.free(outputPointer);

  return { width, height, data: output };
};
