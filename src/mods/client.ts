import { Opaque, Readable, Writable } from "@hazae41/binary"
import { Bytes } from "@hazae41/bytes"
import { Cascade, SuperTransformStream } from "@hazae41/cascade"
import { Cursor } from "@hazae41/cursor"
import { Some } from "@hazae41/option"
import { Plume, StreamEvents, SuperEventTarget } from "@hazae41/plume"
import { Err, Ok, Panic } from "@hazae41/result"
import { BigMath } from "libs/bigmath/index.js"
import { PRF } from "mods/algorithms/prf/prf.js"
import { List } from "mods/binary/lists/writable.js"
import { Number24 } from "mods/binary/numbers/number24.js"
import { Alert } from "mods/binary/records/alerts/alert.js"
import { ChangeCipherSpec } from "mods/binary/records/change_cipher_spec/change_cipher_spec.js"
import { Certificate2 } from "mods/binary/records/handshakes/certificate/certificate2.js"
import { CertificateRequest2 } from "mods/binary/records/handshakes/certificate_request/certificate_request2.js"
import { ClientHello2 } from "mods/binary/records/handshakes/client_hello/client_hello2.js"
import { ClientKeyExchange2DH } from "mods/binary/records/handshakes/client_key_exchange/client_key_exchange2_dh.js"
import { NamedCurve } from "mods/binary/records/handshakes/extensions/elliptic_curves/named_curve.js"
import { Finished2 } from "mods/binary/records/handshakes/finished/finished2.js"
import { Handshake } from "mods/binary/records/handshakes/handshake.js"
import { ServerHello2 } from "mods/binary/records/handshakes/server_hello/server_hello2.js"
import { ServerHelloDone2 } from "mods/binary/records/handshakes/server_hello_done/server_hello_done2.js"
import { ServerDHParams } from "mods/binary/records/handshakes/server_key_exchange/server_dh_params.js"
import { AEADCiphertextRecord, BlockCiphertextRecord, PlaintextRecord, Record } from "mods/binary/records/record.js"
import { Vector } from "mods/binary/vectors/writable.js"
import { Cipher } from "mods/ciphers/cipher.js"
import { Secrets } from "mods/ciphers/secrets.js"
import { ClientKeyExchange2ECDH } from "./binary/records/handshakes/client_key_exchange/client_key_exchange2_ecdh.js"
import { ServerECDHParams } from "./binary/records/handshakes/server_key_exchange/server_ecdh_params.js"
import { ReadableServerKeyExchange2 } from "./binary/records/handshakes/server_key_exchange/server_key_exchange2.js"
import { ServerKeyExchange2DHSigned } from "./binary/records/handshakes/server_key_exchange/server_key_exchange2_dh_signed.js"
import { ServerKeyExchange2ECDHSigned } from "./binary/records/handshakes/server_key_exchange/server_key_exchange2_ecdh_signed.js"
import { Secp256r1 } from "./ciphers/curves/secp256r1.js"
import { InvalidStateError, UnsupportedCipherError, UnsupportedVersionError } from "./errors.js"
import { Extensions } from "./extensions.js"
import { ClientChangeCipherSpecState, HandshakeState, ServerKeyExchangeState, TlsClientDuplexState } from "./state.js"

export interface TlsClientDuplexParams {
  ciphers: Cipher[]
  signal?: AbortSignal
}

export type TlsClientDuplexReadEvents = StreamEvents & {
  handshaked: undefined
}

export class TlsClientDuplex {
  readonly #class = TlsClientDuplex

  readonly read = new SuperEventTarget<TlsClientDuplexReadEvents>()
  readonly write = new SuperEventTarget<StreamEvents>()

  readonly #reader: SuperTransformStream<Opaque, Opaque>
  readonly #writer: SuperTransformStream<Writable, Writable>

  readonly readable: ReadableStream<Opaque>
  readonly writable: WritableStream<Writable>

  #buffer = Cursor.allocUnsafe(65535)

  #state: TlsClientDuplexState = { type: "none", client_encrypted: false, server_encrypted: false }

  constructor(
    readonly subduplex: ReadableWritablePair<Opaque, Writable>,
    readonly params: TlsClientDuplexParams
  ) {
    const { signal } = params

    this.#reader = new SuperTransformStream({
      transform: this.#onReaderWrite.bind(this)
    })

    this.#writer = new SuperTransformStream({
      start: this.#onWriterStart.bind(this),
      transform: this.#onWriterWrite.bind(this)
    })

    const read = this.#reader.start()
    const write = this.#writer.start()

    this.readable = read.readable
    this.writable = write.writable

    subduplex.readable
      .pipeTo(read.writable, { signal })
      .then(this.#onReadClose.bind(this))
      .catch(this.#onReadError.bind(this))
      .then(r => r.ignore())
      .catch(console.error)

    write.readable
      .pipeTo(subduplex.writable, { signal })
      .then(this.#onWriteClose.bind(this))
      .catch(this.#onWriteError.bind(this))
      .then(r => r.ignore())
      .catch(console.error)
  }

  async #onReadClose(): Promise<Ok<void>> {
    console.debug(`${this.#class.name}.onReadClose`)

    this.#reader.closed = {}

    await this.read.emit("close", undefined)

    return Ok.void()
  }

  async #onWriteClose(): Promise<Ok<void>> {
    console.debug(`${this.#class.name}.onWriteClose`)

    this.#writer.closed = {}

    await this.write.emit("close", undefined)

    return Ok.void()
  }

  async #onReadError(reason?: unknown): Promise<Err<unknown>> {
    const error = Cascade.filter(reason)

    console.debug(`${this.#class.name}.onReadError`, { error: error.inner })

    this.#reader.closed = { reason }
    this.#writer.controller.inner.error(reason)

    await this.read.emit("error", error.inner)

    return Cascade.rethrow(error)
  }

  async #onWriteError(reason?: unknown): Promise<Err<unknown>> {
    const error = Cascade.filter(reason)

    console.debug(`${this.#class.name}.onWriteError`, { error: error.inner })

    this.#writer.closed = { reason }
    this.#reader.controller.inner.error(reason)

    await this.write.emit("error", error.inner)

    return Cascade.rethrow(error)
  }

  async #onWriterStart() {
    if (this.#state.type !== "none")
      return new Err(new InvalidStateError())

    const client_hello = ClientHello2.default(this.params.ciphers)

    const client_random = Writable.tryWriteToBytes(client_hello.random).unwrap()
    const client_extensions = Extensions.getClientExtensions(client_hello)

    const handshake = Handshake.from(client_hello)
    const messages = [Writable.tryWriteToBytes(handshake).unwrap()]

    this.#state = { ...this.#state, type: "handshake", messages, step: "client_hello", client_random, client_extensions }

    const record = PlaintextRecord.from(handshake, 0x0301)
    this.#writer.enqueue(record)

    await Plume.tryWaitStream(this.read, "handshaked", () => {
      return new Ok(new Some(Ok.void()))
    }, AbortSignal.timeout(1000)).then(r => r.unwrap())

    return Ok.void()
  }

  async #onReaderWrite(chunk: Opaque) {
    // console.debug(this.#class.name, "<-", chunk)

    if (this.#buffer.offset)
      await this.#onReadBuffered(chunk.bytes)
    else
      await this.#onReadDirect(chunk.bytes)

    return Ok.void()
  }

  /**
   * Read from buffer
   * @param chunk 
   * @returns 
   */
  async #onReadBuffered(chunk: Uint8Array) {
    this.#buffer.tryWrite(chunk).unwrap()
    const full = new Uint8Array(this.#buffer.before)

    this.#buffer.offset = 0
    await this.#onReadDirect(full)
  }

  /**
   * Zero-copy reading
   * @param chunk 
   * @returns 
   */
  async #onReadDirect(chunk: Uint8Array) {
    const cursor = new Cursor(chunk)

    while (cursor.remaining) {
      const record = Readable.tryReadOrRollback(PlaintextRecord, cursor).ignore()

      if (record.isErr()) {
        this.#buffer.tryWrite(cursor.after).unwrap()
        break
      }

      await this.#onRecord(record.get(), this.#state)
    }
  }

  async #onWriterWrite(chunk: Writable) {
    if (this.#state.type !== "handshaked")
      return new Err(new InvalidStateError())

    const state = this.#state

    const { version, encrypter } = state
    const type = Record.types.application_data

    const plaintext = new PlaintextRecord(type, version, chunk)
    const ciphertext = await plaintext.tryEncrypt(encrypter, state.client_sequence++)

    this.#writer.enqueue(ciphertext.unwrap())

    return Ok.void()
  }

  async #onRecord(record: PlaintextRecord<Opaque>, state: TlsClientDuplexState) {
    if (state.server_encrypted)
      return await this.#onCiphertextRecord(record, state)

    return await this.#onPlaintextRecord(record, state)
  }

  async #onCiphertextRecord(record: PlaintextRecord<Opaque>, state: TlsClientDuplexState & { server_encrypted: true }) {
    if (state.encrypter.cipher_type === "block") {
      const cipher = BlockCiphertextRecord.tryFrom(record).unwrap()
      const plain = await cipher.tryDecrypt(state.encrypter, state.server_sequence++)
      return await this.#onPlaintextRecord(plain.unwrap(), state)
    }

    if (state.encrypter.cipher_type === "aead") {
      const cipher = AEADCiphertextRecord.tryFrom(record).unwrap()
      const plain = await cipher.tryDecrypt(state.encrypter, state.server_sequence++)
      return await this.#onPlaintextRecord(plain.unwrap(), state)
    }

    throw new Panic(`Invalid cipher type`)
  }

  async #onPlaintextRecord(record: PlaintextRecord<Opaque>, state: TlsClientDuplexState) {
    if (record.subtype === Alert.type)
      return await this.#onAlert(record, state)
    if (record.subtype === Handshake.type)
      return await this.#onHandshake(record, state)
    if (record.subtype === ChangeCipherSpec.type)
      return await this.#onChangeCipherSpec(record, state)
    if (record.subtype === Record.types.application_data)
      return await this.#onApplicationData(record, state)

    console.warn(record)
  }

  async #onAlert(record: PlaintextRecord<Opaque>, state: TlsClientDuplexState) {
    const alert = record.fragment.tryInto(Alert).unwrap()

    console.debug(alert)

    if (alert.description === Alert.descriptions.close_notify)
      return new Ok(this.#reader.terminate())
    if (alert.level === Alert.levels.fatal)
      return new Err(new Error(`Fatal alert ${alert.description}`))

    console.warn(`Warning alert ${alert.description}`)
  }

  async #onChangeCipherSpec(record: PlaintextRecord<Opaque>, state: TlsClientDuplexState) {
    if (state.type !== "handshake")
      return new Err(new InvalidStateError())
    if (state.step !== "client_finished")
      return new Err(new InvalidStateError())

    const change_cipher_spec = record.fragment.tryInto(ChangeCipherSpec).unwrap()

    console.debug(change_cipher_spec)

    this.#state = { ...state, step: "server_change_cipher_spec", server_encrypted: true, server_sequence: BigInt(0) }

    return Ok.void()
  }

  async #onApplicationData(record: PlaintextRecord<Opaque>, state: TlsClientDuplexState) {
    if (state.type !== "handshaked")
      return new Err(new InvalidStateError())

    this.#reader.enqueue(record.fragment)

    return Ok.void()
  }

  async #onHandshake(record: PlaintextRecord<Opaque>, state: TlsClientDuplexState) {
    if (state.type !== "handshake")
      return new Err(new InvalidStateError())

    const handshake = record.fragment.tryInto(Handshake).unwrap()

    if (handshake.subtype !== Handshake.types.hello_request)
      state.messages.push(new Uint8Array(record.fragment.bytes))

    if (handshake.subtype === ServerHello2.type)
      return this.#onServerHello(handshake, state)
    if (handshake.subtype === Certificate2.type)
      return this.#onCertificate(handshake, state)
    if (handshake.subtype === ServerHelloDone2.type)
      return this.#onServerHelloDone(handshake, state)
    if (handshake.subtype === Handshake.types.server_key_exchange)
      return this.#onServerKeyExchange(handshake, state)
    if (handshake.subtype === CertificateRequest2.type)
      return this.#onCertificateRequest(handshake, state)
    if (handshake.subtype === Finished2.type)
      return this.#onFinished(handshake, state)

    console.warn(handshake)
    return Ok.void()
  }

  async #onServerHello(handshake: Handshake<Opaque>, state: HandshakeState) {
    if (state.step !== "client_hello")
      return new Err(new InvalidStateError())

    const server_hello = handshake.fragment.tryInto(ServerHello2).unwrap()

    console.debug(server_hello)

    const version = server_hello.server_version

    if (version !== 0x0303)
      return new Err(new UnsupportedVersionError(version))

    const cipher = this.params.ciphers.find(it => it.id === server_hello.cipher_suite)

    if (cipher === undefined)
      return new Err(new UnsupportedCipherError(server_hello.cipher_suite))

    const server_random = Writable.tryWriteToBytes(server_hello.random).unwrap()
    const server_extensions = Extensions.getServerExtensions(server_hello, state.client_extensions)

    console.debug(server_extensions)

    this.#state = { ...state, step: "server_hello", version, cipher, server_random, server_extensions }

    return Ok.void()
  }

  async #onCertificate(handshake: Handshake<Opaque>, state: HandshakeState) {
    if (state.step !== "server_hello")
      return new Err(new InvalidStateError())

    const certificate = handshake.fragment.tryInto(Certificate2).unwrap()

    console.debug(certificate)

    // const server_certificates = certificate.certificate_list.value.array
    // .map(it => X509.Certificate.fromBytes(it.value.bytes))


    // console.debug(server_certificates)
    // console.debug(server_certificates.map(it => it.tbsCertificate.issuer.toX501()))
    // console.debug(server_certificates.map(it => it.tbsCertificate.subject.toX501()))

    this.#state = { ...state, action: "server_certificate", server_certificates: [] }
  }

  async #onServerKeyExchange(handshake: Handshake<Opaque>, state: HandshakeState) {
    if (state.step !== "server_hello")
      return new Err(new InvalidStateError())

    const clazz = ReadableServerKeyExchange2.tryGet(state.cipher).unwrap()

    const server_key_exchange = handshake.fragment.tryInto(clazz).unwrap()

    if (server_key_exchange instanceof ServerKeyExchange2DHSigned) {
      console.debug(server_key_exchange)

      const server_dh_params = server_key_exchange.params

      this.#state = { ...state, action: "server_key_exchange", server_dh_params }

      return
    }

    if (server_key_exchange instanceof ServerKeyExchange2ECDHSigned) {
      console.debug(server_key_exchange)

      const server_ecdh_params = server_key_exchange.params

      this.#state = { ...state, action: "server_key_exchange", server_ecdh_params }

      return
    }

    console.warn(server_key_exchange)
  }

  async #onCertificateRequest(handshake: Handshake<Opaque>, state: HandshakeState) {
    if (state.step !== "server_hello")
      return new Err(new InvalidStateError())

    const certificate_request = handshake.fragment.tryInto(CertificateRequest2).unwrap()

    console.debug(certificate_request)

    this.#state = { ...state, action: "server_certificate_request", certificate_request }
  }

  async #computeDiffieHellman(state: ServerKeyExchangeState & { server_dh_params: ServerDHParams }) {
    const { dh_g, dh_p, dh_Ys } = state.server_dh_params

    const g = Bytes.toBigInt(dh_g.value.bytes)
    const p = Bytes.toBigInt(dh_p.value.bytes)
    const Ys = Bytes.toBigInt(dh_Ys.value.bytes)

    const dh_yc = Bytes.random(dh_p.value.bytes.length)

    const yc = Bytes.toBigInt(dh_yc)

    const Yc = BigMath.umodpow(g, yc, p)
    const Z = BigMath.umodpow(Ys, yc, p)

    const dh_Yc = Bytes.fromBigInt(Yc)
    const dh_Z = Bytes.fromBigInt(Z)

    return { dh_Yc, dh_Z }
  }

  async #computeEllipticCurveDiffieHellman(state: ServerKeyExchangeState & { server_ecdh_params: ServerECDHParams }) {
    if (state.server_ecdh_params.curve_params.named_curve.value === NamedCurve.types.secp256r1)
      return new Secp256r1().diffie_hellman(state.server_ecdh_params)

    throw new Panic(`Invalid curve type`)
  }

  async #computeSecrets(state: ServerKeyExchangeState, premaster_secret: Uint8Array) {
    const { cipher, client_random, server_random } = state
    const { prf_md } = state.cipher.hash

    // console.debug("premaster_secret", premaster_secret.length, Bytes.toHex(premaster_secret))

    const master_secret_seed = Bytes.concat([client_random, server_random])
    const master_secret = await PRF(prf_md, premaster_secret, "master secret", master_secret_seed, 48)

    // console.debug("master_secret", master_secret.length, Bytes.toHex(master_secret))

    const key_block_length = 0
      + (2 * cipher.hash.mac_key_length)
      + (2 * cipher.encryption.enc_key_length)
      + (2 * cipher.encryption.fixed_iv_length)

    const key_block_seed = Bytes.concat([server_random, client_random])
    const key_block = await PRF(prf_md, master_secret, "key expansion", key_block_seed, key_block_length)

    // console.debug("key_block", key_block.length, Bytes.toHex(key_block))

    const key_block_cursor = new Cursor(key_block)

    const mac_key_length = state.cipher.encryption.cipher_type === "block"
      ? cipher.hash.mac.mac_key_length
      : 0

    const client_write_MAC_key = key_block_cursor.tryRead(mac_key_length).unwrap()
    const server_write_MAC_key = key_block_cursor.tryRead(mac_key_length).unwrap()

    // console.debug("client_write_MAC_key", client_write_MAC_key.length, Bytes.toHex(client_write_MAC_key))
    // console.debug("server_write_MAC_key", server_write_MAC_key.length, Bytes.toHex(server_write_MAC_key))

    const client_write_key = key_block_cursor.tryRead(cipher.encryption.enc_key_length).unwrap()
    const server_write_key = key_block_cursor.tryRead(cipher.encryption.enc_key_length).unwrap()

    // console.debug("client_write_key", client_write_key.length, Bytes.toHex(client_write_key))
    // console.debug("server_write_key", server_write_key.length, Bytes.toHex(server_write_key))

    const client_write_IV = key_block_cursor.tryRead(cipher.encryption.fixed_iv_length).unwrap()
    const server_write_IV = key_block_cursor.tryRead(cipher.encryption.fixed_iv_length).unwrap()

    // console.debug("client_write_IV", client_write_IV.length, Bytes.toHex(client_write_IV))
    // console.debug("server_write_IV", server_write_IV.length, Bytes.toHex(server_write_IV))

    return {
      master_secret,
      client_write_MAC_key,
      server_write_MAC_key,
      client_write_key,
      server_write_key,
      client_write_IV,
      server_write_IV
    } satisfies Secrets
  }

  async #onServerHelloDone(handshake: Handshake<Opaque>, state: HandshakeState) {
    if (state.step !== "server_hello")
      return new Err(new InvalidStateError())

    const server_hello_done = handshake.fragment.tryInto(ServerHelloDone2).unwrap()

    console.debug(server_hello_done)

    if ("certificate_request" in state) {
      const certificate_list = Vector(Number24).from(List.from<Vector<Number24, Opaque>>([]))

      const certificate = new Certificate2(certificate_list)
      const handshake_certificate = Handshake.from(certificate)
      const record_certificate = PlaintextRecord.from(handshake_certificate, state.version)

      state.messages.push(Writable.tryWriteToBytes(handshake_certificate).unwrap())
      this.#writer.enqueue(record_certificate)
    }

    let secrets: Secrets

    if ("server_dh_params" in state) {
      const { dh_Yc, dh_Z } = await this.#computeDiffieHellman(state)

      const handshake_client_key_exchange = Handshake.from(ClientKeyExchange2DH.from(dh_Yc))
      const record_client_key_exchange = PlaintextRecord.from(handshake_client_key_exchange, state.version)

      state.messages.push(Writable.tryWriteToBytes(handshake_client_key_exchange).unwrap())
      this.#writer.enqueue(record_client_key_exchange)

      secrets = await this.#computeSecrets(state, dh_Z)
    }

    else if ("server_ecdh_params" in state) {
      const { ecdh_Yc, ecdh_Z } = await this.#computeEllipticCurveDiffieHellman(state)

      const handshake_client_key_exchange = Handshake.from(ClientKeyExchange2ECDH.from(ecdh_Yc))
      const record_client_key_exchange = PlaintextRecord.from(handshake_client_key_exchange, state.version)

      state.messages.push(Writable.tryWriteToBytes(handshake_client_key_exchange).unwrap())
      this.#writer.enqueue(record_client_key_exchange)

      secrets = await this.#computeSecrets(state, ecdh_Z)
    }

    else return new Err(new InvalidStateError())

    const encrypter = await state.cipher.init(secrets)

    const change_cipher_spec = new ChangeCipherSpec()
    const record_change_cipher_spec = PlaintextRecord.from(change_cipher_spec, state.version)

    const state2: ClientChangeCipherSpecState = { ...state, step: "client_change_cipher_spec", encrypter, client_encrypted: true, client_sequence: BigInt(0) }

    this.#state = state2

    this.#writer.enqueue(record_change_cipher_spec)

    const { handshake_md, prf_md } = state2.cipher.hash

    const handshake_messages = Bytes.concat(state2.messages)
    const handshake_messages_hash = new Uint8Array(await crypto.subtle.digest(handshake_md, handshake_messages))

    const verify_data = await PRF(prf_md, secrets.master_secret, "client finished", handshake_messages_hash, 12)
    const finished = PlaintextRecord.from(Handshake.from(new Finished2(verify_data)), state.version)
    const cfinished = await finished.tryEncrypt(state2.encrypter, state2.client_sequence++)

    this.#writer.enqueue(cfinished.unwrap())

    this.#state = { ...state2, step: "client_finished" }
  }

  async #onFinished(handshake: Handshake<Opaque>, state: HandshakeState) {
    if (state.step !== "server_change_cipher_spec")
      return new Err(new InvalidStateError())

    const finished = handshake.fragment.tryInto(Finished2).unwrap()

    console.debug(finished)

    this.#state = { ...state, type: "handshaked" }

    await this.read.emit("handshaked", undefined)
  }
}