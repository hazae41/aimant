import { Secrets } from "mods/ciphers/secrets.js"

export class AES_128_GCM {
  readonly #class = AES_128_GCM

  static readonly cipher_type = "aead" as const
  static readonly enc_key_length = 16 as const
  static readonly block_length = 16 as const
  static readonly fixed_iv_length = 4 as const
  static readonly record_iv_length = 8 as const

  constructor(
    readonly secrets: Secrets, // TODO
    readonly encryption_key: CryptoKey,
    readonly decryption_key: CryptoKey,
  ) { }

  static async init(secrets: Secrets) {
    const encryption = await crypto.subtle.importKey("raw", secrets.client_write_key, { name: "AES-GCM", length: 128 }, false, ["encrypt"])
    const decryption = await crypto.subtle.importKey("raw", secrets.server_write_key, { name: "AES-GCM", length: 128 }, false, ["decrypt"])

    return new this(secrets, encryption, decryption)
  }

  get class() {
    return this.#class
  }

  get cipher_type() {
    return this.#class.cipher_type
  }

  get enc_key_length() {
    return this.#class.enc_key_length
  }

  get block_length() {
    return this.#class.block_length
  }

  get fixed_iv_length() {
    return this.#class.fixed_iv_length
  }

  get record_iv_length() {
    return this.#class.record_iv_length
  }

  async encrypt(nonce: Uint8Array, block: Uint8Array, additionalData: Uint8Array) {
    return new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", length: 128, iv: nonce, additionalData }, this.encryption_key, block))
  }

  async decrypt(nonce: Uint8Array, block: Uint8Array, additionalData: Uint8Array) {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", length: 128, iv: nonce, additionalData }, this.decryption_key, block))
  }
}