# Third-party notices

- Mediabunny (MPL-2.0), https://github.com/Vanilagy/mediabunny: MP4 encoding. Used unmodified from npm.
- Vite, TypeScript (MIT / Apache-2.0): build tools only.
- Design inspired by the open-source MoneyPrinterTurbo project (MIT); no code was copied.
- transformers.js (@huggingface/transformers, Apache-2.0) with onnxruntime-web (MIT): on-device depth estimation, loaded only when 3D photo motion is used.
- Depth Anything V2 Small, onnx-community/depth-anything-v2-small (Apache-2.0): the depth model, fetched by the browser from Hugging Face. The Base and Large variants are CC-BY-NC and must not be used.
- Cartoon characters (Bilal, Baji, Ustad, Chacha): ClientoraHQ's own artwork from the Clientora Studio repo, not third-party.
- kokoro-js (Apache-2.0) and the Kokoro-82M v1.0 ONNX model (onnx-community/Kokoro-82M-v1.0-ONNX, Apache-2.0): the free on-device English voice, fetched by the browser from Hugging Face.
- phonemizer (Apache-2.0, by xenova), which includes eSpeak NG compiled to WebAssembly. eSpeak NG is GPL-3.0; this is why Kahanio as a whole is licensed GPL-3.0-or-later (see LICENSE).
- Microsoft Azure Speech (online service, called only by worker/ with the owner's key) and Cloudflare Turnstile (bot check).
