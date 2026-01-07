# ONNX Runtime WASM Files

Copy the following files from `node_modules/onnxruntime-web/dist/` to this directory after running `npm install`:

```bash
cp node_modules/onnxruntime-web/dist/ort-wasm*.wasm public/onnx/
```

Required files:
- `ort-wasm.wasm`
- `ort-wasm-simd.wasm`
- `ort-wasm-threaded.wasm`
- `ort-wasm-simd-threaded.wasm`

These files are required for ONNX Runtime Web to work correctly.
