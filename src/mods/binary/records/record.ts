import { Binary } from "@hazae41/binary"
import { Exportable, Writable } from "mods/binary/fragment.js"
import { Opaque } from "mods/binary/opaque.js"
import { GenericAEADCipher } from "mods/binary/records/generic_ciphers/aead/aead.js"
import { GenericBlockCipher } from "mods/binary/records/generic_ciphers/block/block.js"
import { AEADEncrypter, BlockEncrypter, Encrypter } from "mods/ciphers/encryptions/encryption.js"

export namespace Record {

  export const types = {
    invalid: 0,
    change_cipher_spec: 20,
    alert: 21,
    handshake: 22,
    application_data: 23
  }

}

export class RecordHeader {
  readonly #class = RecordHeader

  constructor(
    readonly subtype: number,
    readonly version: number,
    readonly length: number
  ) { }

  size() {
    return 1 + 2 + 2
  }

  write(binary: Binary) {
    binary.writeUint8(this.subtype)
    binary.writeUint16(this.version)
    binary.writeUint16(this.length)
  }

  static tryRead(binary: Binary) {
    const start = binary.offset

    try {
      const header = this.read(binary)

      if (binary.remaining < header.length)
        throw new Error(`Partial record`)

      return header
    } catch (e: unknown) {
      binary.offset = start
    }
  }

  static read(binary: Binary) {
    const type = binary.readUint8()
    const version = binary.readUint16()
    const length = binary.readUint16()

    return new this(type, version, length)
  }
}


export class PlaintextRecord<T extends Writable & Exportable> {
  readonly #class = PlaintextRecord<T>

  constructor(
    readonly subtype: number,
    readonly version: number,
    readonly fragment: T
  ) { }

  get class() {
    return this.#class
  }

  static from<T extends Writable & Exportable>(
    header: RecordHeader,
    fragment: T
  ) {
    return new this<T>(header.subtype, header.version, fragment)
  }

  size() {
    return 1 + 2 + 2 + this.fragment.size()
  }

  write(binary: Binary) {
    binary.writeUint8(this.subtype)
    binary.writeUint16(this.version)
    binary.writeUint16(this.fragment.size())
    this.fragment.write(binary)
  }

  static read(binary: Binary, length: number) {
    const start = binary.offset

    const subtype = binary.readUint8()
    const version = binary.readUint16()
    const size = binary.readUint16()
    const fragment = Opaque.read(binary, size)

    if (binary.offset - start !== length)
      throw new Error(`Invalid ${this.name} length`)

    return new this(subtype, version, fragment)
  }

  export() {
    const binary = Binary.allocUnsafe(this.size())
    this.write(binary)
    return binary.bytes
  }

  async encrypt(encrypter: Encrypter, sequence: bigint) {
    if (encrypter.cipher_type === "block") {
      const gcipher = await GenericBlockCipher.encrypt<T>(this, encrypter, sequence)
      return new BlockCiphertextRecord(this.subtype, this.version, gcipher)
    }

    if (encrypter.cipher_type === "aead") {
      const gcipher = await GenericAEADCipher.encrypt<T>(this, encrypter, sequence)
      return new AEADCiphertextRecord(this.subtype, this.version, gcipher)
    }

    throw new Error(`Invalid cipher type`)
  }
}

export class BlockCiphertextRecord {
  readonly #class = BlockCiphertextRecord

  constructor(
    readonly subtype: number,
    readonly version: number,
    readonly fragment: GenericBlockCipher
  ) { }

  get class() {
    return this.#class
  }

  static from(header: RecordHeader, fragment: GenericBlockCipher) {
    return new this(header.subtype, header.version, fragment)
  }

  size() {
    return 1 + 2 + 2 + this.fragment.size()
  }

  write(binary: Binary) {
    binary.writeUint8(this.subtype)
    binary.writeUint16(this.version)
    binary.writeUint16(this.fragment.size())
    this.fragment.write(binary)
  }

  export() {
    const binary = Binary.allocUnsafe(this.size())
    this.write(binary)
    return binary.bytes
  }

  async decrypt(encrypter: BlockEncrypter, sequence: bigint) {
    const fragment = await this.fragment.decrypt(this, encrypter, sequence)
    return new PlaintextRecord(this.subtype, this.version, fragment)
  }
}

export class AEADCiphertextRecord {
  readonly #class = AEADCiphertextRecord

  constructor(
    readonly subtype: number,
    readonly version: number,
    readonly fragment: GenericAEADCipher
  ) { }

  get class() {
    return this.#class
  }

  static from(header: RecordHeader, fragment: GenericAEADCipher) {
    return new this(header.subtype, header.version, fragment)
  }

  size() {
    return 1 + 2 + 2 + this.fragment.size()
  }

  write(binary: Binary) {
    binary.writeUint8(this.subtype)
    binary.writeUint16(this.version)
    binary.writeUint16(this.fragment.size())
    this.fragment.write(binary)
  }

  export() {
    const binary = Binary.allocUnsafe(this.size())
    this.write(binary)
    return binary.bytes
  }

  async decrypt(encrypter: AEADEncrypter, sequence: bigint) {
    const fragment = await this.fragment.decrypt(this, encrypter, sequence)
    return new PlaintextRecord(this.subtype, this.version, fragment)
  }
}