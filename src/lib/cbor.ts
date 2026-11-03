// src/lib/cbor.ts
/**
 * Zero-Dependency RFC 8949 CBOR Encoder and Decoder
 * 100% Zero-Buffer implementation cross-compatible with Browser, Node, Edge, Deno, and Bun.
 * Strictly uses Uint8Array, DataView, TextEncoder, TextDecoder, and lookup tables.
 */

// Base64 and Base64URL characters
const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64URL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// Pre-computed 256-element lookup table for Base64 and Base64URL decoding
const B64_LOOKUP = new Int16Array(256).fill(-1);
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;
}
B64_LOOKUP["-".charCodeAt(0)] = 62;
B64_LOOKUP["_".charCodeAt(0)] = 63;

/**
 * Converts Uint8Array or byte array to a hex string
 */
export function bytesToHex(bytes: Uint8Array | number[]): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Converts a hex string to Uint8Array without Node.js Buffer
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.trim();
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string: length must be even");
  }
  const len = cleanHex.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const byte = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(`Invalid hex character at index ${i * 2}`);
    }
    bytes[i] = byte;
  }
  return bytes;
}

/**
 * Decodes a Base64 or Base64URL string to Uint8Array without Node.js Buffer or atob
 */
export function base64UrlToBytes(str: string): Uint8Array {
  let clean = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 61) break; // Stop at '=' padding
    if (B64_LOOKUP[code] !== -1) {
      clean += str[i];
    }
  }

  const len = clean.length;
  if (len === 0) return new Uint8Array(0);

  const validChunks = Math.floor(len / 4);
  const remainder = len % 4;
  let byteLen = validChunks * 3;
  if (remainder === 2) byteLen += 1;
  else if (remainder === 3) byteLen += 2;

  const bytes = new Uint8Array(byteLen);
  let byteIdx = 0;

  for (let i = 0; i < validChunks * 4; i += 4) {
    const c1 = B64_LOOKUP[clean.charCodeAt(i)];
    const c2 = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const c3 = B64_LOOKUP[clean.charCodeAt(i + 2)];
    const c4 = B64_LOOKUP[clean.charCodeAt(i + 3)];
    const triple = (c1 << 18) | (c2 << 12) | (c3 << 6) | c4;
    bytes[byteIdx++] = (triple >> 16) & 0xff;
    bytes[byteIdx++] = (triple >> 8) & 0xff;
    bytes[byteIdx++] = triple & 0xff;
  }

  if (remainder === 2) {
    const c1 = B64_LOOKUP[clean.charCodeAt(len - 2)];
    const c2 = B64_LOOKUP[clean.charCodeAt(len - 1)];
    const pair = (c1 << 18) | (c2 << 12);
    bytes[byteIdx++] = (pair >> 16) & 0xff;
  } else if (remainder === 3) {
    const c1 = B64_LOOKUP[clean.charCodeAt(len - 3)];
    const c2 = B64_LOOKUP[clean.charCodeAt(len - 2)];
    const c3 = B64_LOOKUP[clean.charCodeAt(len - 1)];
    const triple = (c1 << 18) | (c2 << 12) | (c3 << 6);
    bytes[byteIdx++] = (triple >> 16) & 0xff;
    bytes[byteIdx++] = (triple >> 8) & 0xff;
  }

  return bytes;
}

/**
 * Alias for base64UrlToBytes supporting standard Base64
 */
export function base64ToBytes(str: string): Uint8Array {
  return base64UrlToBytes(str);
}

/**
 * Encodes Uint8Array to a Base64URL string (unpadded, RFC 4648 §5) without Buffer
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let result = "";
  const len = bytes.length;
  const chunkCount = Math.floor(len / 3);

  for (let i = 0; i < chunkCount * 3; i += 3) {
    const triple = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    result +=
      B64URL_CHARS[(triple >> 18) & 0x3f] +
      B64URL_CHARS[(triple >> 12) & 0x3f] +
      B64URL_CHARS[(triple >> 6) & 0x3f] +
      B64URL_CHARS[triple & 0x3f];
  }

  const remainder = len % 3;
  if (remainder === 1) {
    const single = bytes[len - 1] << 16;
    result +=
      B64URL_CHARS[(single >> 18) & 0x3f] +
      B64URL_CHARS[(single >> 12) & 0x3f];
  } else if (remainder === 2) {
    const pair = (bytes[len - 2] << 16) | (bytes[len - 1] << 8);
    result +=
      B64URL_CHARS[(pair >> 18) & 0x3f] +
      B64URL_CHARS[(pair >> 12) & 0x3f] +
      B64URL_CHARS[(pair >> 6) & 0x3f];
  }

  return result;
}

/**
 * Encodes Uint8Array to a standard Base64 string (with '=' padding) without Buffer
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let result = "";
  const len = bytes.length;
  const chunkCount = Math.floor(len / 3);

  for (let i = 0; i < chunkCount * 3; i += 3) {
    const triple = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    result +=
      B64_CHARS[(triple >> 18) & 0x3f] +
      B64_CHARS[(triple >> 12) & 0x3f] +
      B64_CHARS[(triple >> 6) & 0x3f] +
      B64_CHARS[triple & 0x3f];
  }

  const remainder = len % 3;
  if (remainder === 1) {
    const single = bytes[len - 1] << 16;
    result +=
      B64_CHARS[(single >> 18) & 0x3f] +
      B64_CHARS[(single >> 12) & 0x3f] +
      "==";
  } else if (remainder === 2) {
    const pair = (bytes[len - 2] << 16) | (bytes[len - 1] << 8);
    result +=
      B64_CHARS[(pair >> 18) & 0x3f] +
      B64_CHARS[(pair >> 12) & 0x3f] +
      B64_CHARS[(pair >> 6) & 0x3f] +
      "=";
  }

  return result;
}

/**
 * Internal expandable byte buffer for zero-dependency CBOR encoding
 */
class CborWriter {
  private buffer: Uint8Array;
  private offset: number;

  constructor(initialCapacity = 256) {
    this.buffer = new Uint8Array(initialCapacity);
    this.offset = 0;
  }

  private ensureCapacity(needed: number): void {
    if (this.offset + needed > this.buffer.length) {
      const newCap = Math.max(this.buffer.length * 2, this.offset + needed);
      const newBuf = new Uint8Array(newCap);
      newBuf.set(this.buffer);
      this.buffer = newBuf;
    }
  }

  public writeByte(b: number): void {
    this.ensureCapacity(1);
    this.buffer[this.offset++] = b & 0xff;
  }

  public writeBytes(bytes: Uint8Array): void {
    this.ensureCapacity(bytes.length);
    this.buffer.set(bytes, this.offset);
    this.offset += bytes.length;
  }

  public writeTypeAndLength(majorType: number, length: number | bigint): void {
    const major = (majorType & 0x07) << 5;

    if (typeof length === "bigint") {
      if (length <= BigInt(0xffffffff)) {
        this.writeTypeAndLength(majorType, Number(length));
        return;
      }
      this.writeByte(major | 27);
      this.ensureCapacity(8);
      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.offset, 8);
      view.setBigUint64(0, length, false);
      this.offset += 8;
      return;
    }

    if (length < 24) {
      this.writeByte(major | length);
    } else if (length <= 0xff) {
      this.writeByte(major | 24);
      this.writeByte(length);
    } else if (length <= 0xffff) {
      this.writeByte(major | 25);
      this.ensureCapacity(2);
      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.offset, 2);
      view.setUint16(0, length, false);
      this.offset += 2;
    } else if (length <= 0xffffffff) {
      this.writeByte(major | 26);
      this.ensureCapacity(4);
      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.offset, 4);
      view.setUint32(0, length, false);
      this.offset += 4;
    } else {
      this.writeByte(major | 27);
      this.ensureCapacity(8);
      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.offset, 8);
      view.setBigUint64(0, BigInt(length), false);
      this.offset += 8;
    }
  }

  public writeFloat64(value: number): void {
    this.writeByte((7 << 5) | 27);
    this.ensureCapacity(8);
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.offset, 8);
    view.setFloat64(0, value, false);
    this.offset += 8;
  }

  public toUint8Array(): Uint8Array {
    return this.buffer.slice(0, this.offset);
  }
}

/**
 * Recursively encodes a JavaScript value into CBOR representation
 */
function encodeItem(value: any, writer: CborWriter): void {
  if (value === false) {
    writer.writeByte((7 << 5) | 20); // 0xf4
    return;
  }
  if (value === true) {
    writer.writeByte((7 << 5) | 21); // 0xf5
    return;
  }
  if (value === null) {
    writer.writeByte((7 << 5) | 22); // 0xf6
    return;
  }
  if (value === undefined) {
    writer.writeByte((7 << 5) | 23); // 0xf7
    return;
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      if (value >= 0) {
        writer.writeTypeAndLength(0, value);
      } else {
        const negArg = -1 - value;
        writer.writeTypeAndLength(1, negArg);
      }
    } else {
      writer.writeFloat64(value);
    }
    return;
  }

  if (typeof value === "bigint") {
    if (value >= BigInt(0)) {
      writer.writeTypeAndLength(0, value);
    } else {
      const negArg = BigInt(-1) - value;
      writer.writeTypeAndLength(1, negArg);
    }
    return;
  }

  if (typeof value === "string") {
    const strBytes = new TextEncoder().encode(value);
    writer.writeTypeAndLength(3, strBytes.length);
    writer.writeBytes(strBytes);
    return;
  }

  if (value instanceof Uint8Array) {
    writer.writeTypeAndLength(2, value.length);
    writer.writeBytes(value);
    return;
  }

  if (Array.isArray(value)) {
    writer.writeTypeAndLength(4, value.length);
    for (let i = 0; i < value.length; i++) {
      encodeItem(value[i], writer);
    }
    return;
  }

  if (value instanceof Map) {
    writer.writeTypeAndLength(5, value.size);
    for (const [k, v] of value.entries()) {
      encodeItem(k, writer);
      encodeItem(v, writer);
    }
    return;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    writer.writeTypeAndLength(5, entries.length);
    for (let i = 0; i < entries.length; i++) {
      encodeItem(entries[i][0], writer);
      encodeItem(entries[i][1], writer);
    }
    return;
  }

  throw new Error(`Unsupported type for CBOR encoding: ${typeof value}`);
}

/**
 * Encodes a JavaScript value to RFC 8949 CBOR binary format
 */
export function encodeCbor(value: any): Uint8Array {
  const writer = new CborWriter();
  encodeItem(value, writer);
  return writer.toUint8Array();
}

/**
 * Decodes RFC 8949 CBOR binary data into JavaScript values
 */
export function decodeCbor(bytes: Uint8Array): any {
  if (!bytes || bytes.length === 0) {
    throw new Error("Cannot decode empty CBOR bytes");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  function decodeItem(): any {
    if (offset >= bytes.length) {
      throw new Error("Unexpected end of CBOR data");
    }

    const initialByte = bytes[offset++];
    const majorType = initialByte >> 5;
    const additionalInfo = initialByte & 0x1f;

    let length = 0;
    let bigLength: bigint | null = null;

    if (additionalInfo < 24) {
      length = additionalInfo;
    } else if (additionalInfo === 24) {
      if (offset >= bytes.length) throw new Error("Truncated CBOR single-byte length");
      length = view.getUint8(offset++);
    } else if (additionalInfo === 25) {
      if (offset + 2 > bytes.length) throw new Error("Truncated CBOR 2-byte length");
      length = view.getUint16(offset, false);
      offset += 2;
    } else if (additionalInfo === 26) {
      if (offset + 4 > bytes.length) throw new Error("Truncated CBOR 4-byte length");
      length = view.getUint32(offset, false);
      offset += 4;
    } else if (additionalInfo === 27) {
      if (offset + 8 > bytes.length) throw new Error("Truncated CBOR 8-byte length");
      if (majorType === 7) {
        const floatVal = view.getFloat64(offset, false);
        offset += 8;
        return floatVal;
      }
      bigLength = view.getBigUint64(offset, false);
      offset += 8;
      if (bigLength <= BigInt(Number.MAX_SAFE_INTEGER)) {
        length = Number(bigLength);
      } else {
        if (majorType === 0) return bigLength;
        if (majorType === 1) return BigInt(-1) - bigLength;
        length = Number(bigLength);
      }
    } else if (additionalInfo === 31) {
      // Indefinite length marker
      length = -1;
    }

    // Major Type 0: Unsigned Integer
    if (majorType === 0) {
      return bigLength !== null && bigLength > BigInt(Number.MAX_SAFE_INTEGER)
        ? bigLength
        : length;
    }

    // Major Type 1: Negative Integer (-1 - argument)
    if (majorType === 1) {
      return bigLength !== null && bigLength > BigInt(Number.MAX_SAFE_INTEGER)
        ? BigInt(-1) - bigLength
        : -1 - length;
    }

    // Major Type 2: Byte String
    if (majorType === 2) {
      if (length < 0) throw new Error("Indefinite-length byte string not supported");
      if (offset + length > bytes.length) throw new Error("Truncated CBOR byte string");
      const slice = bytes.slice(offset, offset + length);
      offset += length;
      return slice;
    }

    // Major Type 3: UTF-8 Text String
    if (majorType === 3) {
      if (length < 0) throw new Error("Indefinite-length text string not supported");
      if (offset + length > bytes.length) throw new Error("Truncated CBOR text string");
      const strBytes = bytes.slice(offset, offset + length);
      offset += length;
      return new TextDecoder("utf-8").decode(strBytes);
    }

    // Major Type 4: Array
    if (majorType === 4) {
      const arr: any[] = [];
      if (length >= 0) {
        for (let i = 0; i < length; i++) {
          arr.push(decodeItem());
        }
      } else {
        // Indefinite length array (stops on break 0xff)
        while (offset < bytes.length && bytes[offset] !== 0xff) {
          arr.push(decodeItem());
        }
        if (offset < bytes.length && bytes[offset] === 0xff) {
          offset++; // Consume break marker
        }
      }
      return arr;
    }

    // Major Type 5: Map / Object
    if (majorType === 5) {
      const obj: Record<string, any> = {};
      if (length >= 0) {
        for (let i = 0; i < length; i++) {
          const key = decodeItem();
          const val = decodeItem();
          obj[typeof key === "string" ? key : String(key)] = val;
        }
      } else {
        // Indefinite length map (stops on break 0xff)
        while (offset < bytes.length && bytes[offset] !== 0xff) {
          const key = decodeItem();
          const val = decodeItem();
          obj[typeof key === "string" ? key : String(key)] = val;
        }
        if (offset < bytes.length && bytes[offset] === 0xff) {
          offset++; // Consume break marker
        }
      }
      return obj;
    }

    // Major Type 6: Semantic Tag
    if (majorType === 6) {
      // Return tagged content
      return decodeItem();
    }

    // Major Type 7: Simple Values and Floats
    if (majorType === 7) {
      if (additionalInfo === 20) return false;
      if (additionalInfo === 21) return true;
      if (additionalInfo === 22) return null;
      if (additionalInfo === 23) return undefined;

      if (additionalInfo === 25) {
        // 16-bit half precision float
        const half = view.getUint16(offset, false);
        offset += 2;
        const sign = half & 0x8000 ? -1 : 1;
        const exp = (half & 0x7c00) >> 10;
        const frac = half & 0x03ff;
        if (exp === 0) {
          return sign * 2 ** -14 * (frac / 1024);
        } else if (exp === 0x1f) {
          return frac ? NaN : sign * Infinity;
        }
        return sign * 2 ** (exp - 15) * (1 + frac / 1024);
      }

      if (additionalInfo === 26) {
        const f32 = view.getFloat32(offset, false);
        offset += 4;
        return f32;
      }
    }

    throw new Error(`Unsupported CBOR major type: ${majorType} (info: ${additionalInfo})`);
  }

  const result = decodeItem();
  return result;
}
