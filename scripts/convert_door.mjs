// Normalize optional door GLBs at build time. No Basis/Emscripten worker in the browser.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';

const require = createRequire(import.meta.url);
const BASISU = 'KHR_texture_basisu';
const KTX2 = Buffer.from('ab4b5458203230bb0d0a1a0a', 'hex');
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const MAX_INPUT = 12 * 1024 * 1024;
const MAX_OUTPUT = 80 * 1024 * 1024;
const MAX_PIXELS = 24 * 1024 * 1024;
const RGBA32 = 13; // Three.js r170 TranscoderFormat.RGBA32
const align4 = n => Math.ceil(n / 4) * 4;
const integer = n => Number.isSafeInteger(n) && n >= 0;
const assert = (ok, message) => { if (!ok) throw new Error(message); };

export function readGLB(raw) {
  assert(raw.length >= 28 && raw.toString('ascii', 0, 4) === 'glTF' && raw.readUInt32LE(4) === 2 && raw.readUInt32LE(8) === raw.length, 'Invalid GLB header');
  const chunks = [];
  for (let p = 12; p < raw.length;) {
    assert(p + 8 <= raw.length, 'Truncated GLB chunk');
    const n = raw.readUInt32LE(p), type = raw.readUInt32LE(p + 4);
    p += 8;
    assert(n % 4 === 0 && p + n <= raw.length, 'Invalid GLB chunk length');
    chunks.push({ type, data: raw.subarray(p, p + n) });
    p += n;
  }
  assert(chunks.length === 2 && chunks[0].type === 0x4e4f534a && chunks[1].type === 0x004e4942, 'Expected JSON and embedded BIN chunks');
  const doc = JSON.parse(chunks[0].data.toString('utf8'));
  assert(doc.asset?.version === '2.0' && Array.isArray(doc.buffers) && doc.buffers.length && Array.isArray(doc.bufferViews), 'Invalid glTF document');
  const len = doc.buffers[0].byteLength;
  assert(integer(len) && len <= chunks[1].data.length && chunks[1].data.length - len < 4, 'Invalid embedded buffer length');
  assert(doc.buffers.every(b => !('uri' in b)) && (doc.images || []).every(i => !('uri' in i)), 'External resources not allowed');
  return { doc, bin: chunks[1].data.subarray(0, len) };
}

export function writeGLB(doc, bin) {
  const json = Buffer.from(JSON.stringify(doc)), j = Buffer.alloc(align4(json.length), 0x20), b = Buffer.alloc(align4(bin.length));
  json.copy(j); bin.copy(b);
  const total = 12 + 8 + j.length + 8 + b.length;
  assert(total <= MAX_OUTPUT, 'Converted GLB exceeds size budget');
  const header = Buffer.alloc(12), jc = Buffer.alloc(8), bc = Buffer.alloc(8);
  header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
  jc.writeUInt32LE(j.length); jc.write('JSON', 4);
  bc.writeUInt32LE(b.length); bc.write('BIN\0', 4);
  return Buffer.concat([header, jc, j, bc, b], total);
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii'), size = Buffer.alloc(4), checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, checksum]);
}

// PNG carries no color profile: GLTFLoader assigns the color space from the material slot.
export function encodePNG(width, height, rgba) {
  assert(integer(width) && integer(height) && width > 0 && height > 0 && width <= 4096 && height <= 4096 && rgba.length === width * height * 4, 'Invalid RGBA texture');
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width); head.writeUInt32BE(height, 4); head[8] = 8; head[9] = 6;
  const stride = width * 4, rows = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const input = y * stride, out = y * (stride + 1);
    rows[out] = 1; // lossless PNG Sub filter, good compression for color and normal maps
    for (let x = 0; x < stride; x++) rows[out + 1 + x] = (rgba[input + x] - (x >= 4 ? rgba[input + x - 4] : 0)) & 255;
  }
  return Buffer.concat([PNG, pngChunk('IHDR', head), pngChunk('IDAT', deflateSync(rows, { level: 6 })), pngChunk('IEND', Buffer.alloc(0))]);
}

export function makeDecoder(module) {
  return raw => {
    assert(raw.length >= 80 && raw.subarray(0, 12).equals(KTX2), 'Invalid KTX2 signature');
    const width = raw.readUInt32LE(20), height = raw.readUInt32LE(24);
    assert(width > 0 && height > 0 && width <= 4096 && height <= 4096, 'KTX2 texture exceeds dimension budget');
    const file = new module.KTX2File(new Uint8Array(raw));
    try {
      assert(file.isValid() && (file.isETC1S() || file.isUASTC()) && !file.isHDR(), 'Unsupported Basis texture encoding');
      assert(file.getWidth() === width && file.getHeight() === height && (file.getLayers() || 1) === 1 && file.getFaces() === 1 && file.getLevels() > 0, 'Only 2D LDR textures supported');
      assert(file.startTranscoding(), 'Basis startTranscoding failed');
      const size = file.getImageTranscodedSizeInBytes(0, 0, 0, RGBA32);
      assert(size === width * height * 4, 'Unexpected decoded texture dimensions');
      const rgba = new Uint8Array(size);
      assert(file.transcodeImage(rgba, 0, 0, 0, RGBA32, 0, -1, -1), 'Basis transcodeImage failed');
      return { width, height, rgba };
    } finally { try { file.close(); } finally { file.delete(); } }
  };
}

export async function convertGLB(raw, decode) {
  assert(raw.length <= MAX_INPUT, 'Door GLB exceeds input budget');
  const { doc, bin } = readGLB(raw);
  let size = bin.length, pixels = 0, converted = 0;
  const additions = [bin];
  const images = doc.images || [];
  const targets = new Set();
  for (const tex of doc.textures || []) {
    const basis = tex.extensions?.[BASISU];
    if (basis) {
      assert(integer(basis.source) && basis.source < images.length, 'Invalid Basis texture source');
      targets.add(basis.source);
      tex.source = basis.source;
      delete tex.extensions[BASISU];
      if (!Object.keys(tex.extensions).length) delete tex.extensions;
    }
  }
  for (let i = 0; i < images.length; i++) if (images[i].mimeType === 'image/ktx2') targets.add(i);
  for (const i of targets) {
    const image = images[i], view = doc.bufferViews[image.bufferView];
    const offset = view?.byteOffset || 0, len = view?.byteLength;
    assert(view?.buffer === 0 && integer(offset) && integer(len) && offset + len <= bin.length, 'Invalid embedded KTX2 image view');
    const source = bin.subarray(offset, offset + len);
    assert(source.length >= 80 && source.subarray(0, 12).equals(KTX2), 'Invalid embedded KTX2 image');
    const w = source.readUInt32LE(20), h = source.readUInt32LE(24);
    assert(w > 0 && h > 0 && w <= 4096 && h <= 4096 && (pixels += w * h) <= MAX_PIXELS, 'Door texture pixel budget exceeded');
    const decoded = await decode(source);
    assert(decoded.width === w && decoded.height === h, 'Decoded KTX2 dimensions mismatch');
    const png = encodePNG(w, h, decoded.rgba);
    const padding = align4(size) - size;
    additions.push(Buffer.alloc(padding)); size += padding;
    image.bufferView = doc.bufferViews.length;
    image.mimeType = 'image/png';
    doc.bufferViews.push({ buffer: 0, byteOffset: size, byteLength: png.length });
    additions.push(png); size += png.length; converted++;
    assert(size <= MAX_OUTPUT, 'Door texture size budget exceeded');
  }
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    if (doc[key]) {
      doc[key] = doc[key].filter(e => e !== BASISU);
      if (!doc[key].length) delete doc[key];
    }
  }
  // Meshopt compressed geometry and its fallback buffer remain untouched.
  // Retain original buffer bytes so unrelated accessors/views keep their offsets.
  doc.buffers[0].byteLength = size;
  return { raw: writeGLB(doc, Buffer.concat(additions, size)), converted };
}

export async function normalizeDoors(root, decode) {
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const models = manifest.door_models || {}, output = {};
  let records = manifest.files.filter(f => !f.file.startsWith('door/'));
  for (const quality of ['1k', '2k']) {
    const rel = `door/${quality}.glb`, target = `door/${quality}-png.glb`;
    if (models[quality] !== `/assets/polyhaven/${rel}`) continue;
    const original = path.join(root, rel), dest = path.join(root, target);
    try {
      const source = fs.readFileSync(original);
      const record = manifest.files.find(f => f.file === rel);
      assert(record && createHash('sha256').update(source).digest('hex') === record.sha256, 'Door source checksum mismatch');
      const result = await convertGLB(source, decode);
      fs.writeFileSync(dest, result.raw);
      records.push({ ...record, file: target, bytes: result.raw.length, source_sha256: record.sha256,
        sha256: createHash('sha256').update(result.raw).digest('hex'), md5: createHash('md5').update(result.raw).digest('hex'), texture_format: 'png' });
      output[quality] = `/assets/polyhaven/${target}`;
      console.log(`Door ${quality}: ${result.converted} Basis textures converted to PNG; ${result.raw.length} bytes`);
    } catch (error) {
      fs.rmSync(dest, { force: true });
      console.warn(`Optional door ${quality}: ${error.message}; local model active`);
    } finally { fs.rmSync(original, { force: true }); }
  }
  manifest.door_models = output;
  manifest.realism_status = { ...manifest.realism_status, door: Object.keys(output).length ? 'downloaded' : 'local' };
  manifest.files = records;
  manifest.bytes = records.reduce((n, f) => n + f.bytes, 0);
  fs.writeFileSync(manifestPath + '.tmp', JSON.stringify(manifest, null, 2));
  fs.renameSync(manifestPath + '.tmp', manifestPath);
  return manifest;
}

async function main() {
  const root = process.argv[2], basisDir = process.argv[3];
  assert(root && basisDir, 'Usage: node convert_door.mjs ASSET_ROOT BASIS_DIR');
  let decoderPromise;
  const decode = async raw => {
    decoderPromise ??= (async () => {
      // Three ships a CommonJS wrapper in an ESM package. Copy only in the build stage.
      const wrapper = path.join(path.dirname(path.resolve(root)), 'door-basis-transcoder.cjs');
      fs.copyFileSync(path.join(basisDir, 'basis_transcoder.js'), wrapper);
      const BASIS = require(wrapper);
      const module = await BASIS({ wasmBinary: fs.readFileSync(path.join(basisDir, 'basis_transcoder.wasm')) });
      module.initializeBasis();
      return makeDecoder(module);
    })();
    return (await decoderPromise)(raw);
  };
  await normalizeDoors(root, decode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
