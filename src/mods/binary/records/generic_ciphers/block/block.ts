import { Binary } from "@hazae41/binary"
import { Bytes } from "libs/bytes/bytes.js"
import { Opaque } from "mods/binary/opaque.js"
import { BlockCiphertextRecord, PlaintextRecord } from "mods/binary/records/record.js"
import { Exportable, Writable } from "mods/binary/writable.js"
import { BlockEncrypter } from "mods/ciphers/encryptions/encryption.js"

/**
 * (y % m) where (x + y) % m == 0
 * @nomaths Calculate the remaining y to add to x in order to reach the next m multiple
 * @param x value
 * @param m modulus
 * @returns y
 */
function modulup(x: number, m: number) {
  return (m - ((x + m) % m)) % m
}

export class GenericBlockCipher {
  readonly #class = GenericBlockCipher

  constructor(
    readonly iv: Uint8Array,
    readonly block: Uint8Array
  ) { }

  get class() {
    return this.#class
  }

  size() {
    return this.iv.length + this.block.length
  }

  write(binary: Binary) {
    binary.write(this.iv)
    binary.write(this.block)
  }

  static read(binary: Binary, length: number) {
    const start = binary.offset

    const iv = binary.read(16)
    const block = binary.read(length - 16)

    if (binary.offset - start !== length)
      throw new Error(`Invalid ${this.name} length`)

    return new this(iv, block)
  }

  static async encrypt<T extends Writable & Exportable>(record: PlaintextRecord<T>, encrypter: BlockEncrypter, sequence: bigint) {
    const iv = Bytes.random(16)

    const content = record.fragment.export()

    const premac = Binary.allocUnsafe(8 + record.size())
    premac.writeUint64(sequence)
    record.write(premac)

    const mac = await encrypter.macher.write(premac.bytes)

    const length = content.length + mac.length
    const padding_length = modulup(length + 1, 16)
    const padding = Bytes.allocUnsafe(padding_length + 1)
    padding.fill(padding_length)

    const plaintext = Bytes.concat([content, mac, padding])
    const ciphertext = await encrypter.encrypt(iv, plaintext)

    // console.log("-> iv", iv.length, Bytes.toHex(iv))
    // console.log("-> plaintext", plaintext.length, Bytes.toHex(plaintext))
    // console.log("-> content", content.length, Bytes.toHex(content))
    // console.log("-> mac", mac.length, Bytes.toHex(mac))
    // console.log("-> ciphertext", ciphertext.length, Bytes.toHex(ciphertext))

    return new this(iv, ciphertext)
  }

  async decrypt(record: BlockCiphertextRecord, encrypter: BlockEncrypter, sequence: bigint) {
    const plaintext = await encrypter.decrypt(this.iv, this.block)

    const content = plaintext.subarray(0, -encrypter.macher.mac_length)
    const mac = plaintext.subarray(-encrypter.macher.mac_length)

    // console.log("<- content", content.length, Bytes.toHex(content))
    // console.log("<- mac", mac.length, Bytes.toHex(mac))

    return new Opaque(content)
  }

  export() {
    const binary = Binary.allocUnsafe(this.size())
    this.write(binary)
    return binary.bytes
  }
}