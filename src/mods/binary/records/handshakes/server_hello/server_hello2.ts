import { Binary } from "@hazae41/binary";
import { Array } from "mods/binary/arrays/array.js";
import { UnlengthedArray } from "mods/binary/arrays/unlengthed.js";
import { Number16, Number8 } from "mods/binary/number.js";
import { Opaque } from "mods/binary/opaque.js";
import { Random } from "mods/binary/random.js";
import { Handshake } from "mods/binary/records/handshakes/handshake.js";
import { LengthedVector } from "mods/binary/vectors/lengthed.js";
import { Vector } from "mods/binary/vectors/vector.js";

export class ServerHello2 {
  readonly #class = ServerHello2

  static type = Handshake.types.server_hello

  constructor(
    readonly server_version: number,
    readonly random: Random,
    readonly session_id: Vector<Number8, Opaque>,
    readonly cipher_suite: number,
    readonly compression_methods: Vector<Number8, Array<Number8>>,
    readonly extensions?: Vector<Number16, Opaque>
  ) { }

  get class() {
    return this.#class
  }

  size() {
    return 0
      + 2
      + this.random.size()
      + this.session_id.size()
      + 2
      + this.compression_methods.size()
      + (this.extensions?.size() ?? 0)
  }

  write(binary: Binary) {
    binary.writeUint16(this.server_version)
    this.random.write(binary)
    this.session_id.write(binary)
    binary.writeUint16(this.cipher_suite)
    this.compression_methods.write(binary)
    this.extensions?.write(binary)
  }

  static read(binary: Binary, length: number) {
    const start = binary.offset

    const server_version = binary.readUint16()
    const random = Random.read(binary)
    const session_id = LengthedVector(Number8, Opaque).read(binary)
    const cipher_suite = binary.readUint16()
    const compression_methods = LengthedVector(Number8, UnlengthedArray(Number8)).read(binary)

    if (binary.offset - start !== length)
      throw new Error(`Invalid ${this.name} length`)

    const extensions = binary.offset - start < length
      ? LengthedVector(Number16, Opaque).read(binary)
      : undefined

    return new this(server_version, random, session_id, cipher_suite, compression_methods, extensions)
  }
}