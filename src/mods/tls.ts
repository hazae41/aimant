import { Binary } from "@hazae41/binary"
import { Certificate, X509 } from "@hazae41/x509"
import { BigMath } from "libs/bigmath/index.js"
import { Bytes } from "libs/bytes/bytes.js"
import { PRF } from "mods/algorithms/prf/prf.js"
import { Alert } from "mods/binary/alerts/alert.js"
import { Certificate2 } from "mods/binary/handshakes/certificate/certificate2.js"
import { CertificateRequest2 } from "mods/binary/handshakes/certificate_request/certificate_request2.js"
import { ClientHello2 } from "mods/binary/handshakes/client_hello/client_hello2.js"
import { ClientDiffieHellmanPublicExplicit } from "mods/binary/handshakes/client_key_exchange/client_diffie_hellman_public.js"
import { ClientKeyExchange2DH } from "mods/binary/handshakes/client_key_exchange/client_key_exchange2_dh.js"
import { Finished2 } from "mods/binary/handshakes/finished/finished2.js"
import { Handshake, HandshakeHeader } from "mods/binary/handshakes/handshake.js"
import { ServerHello2 } from "mods/binary/handshakes/server_hello/server_hello2.js"
import { ServerHelloDone2 } from "mods/binary/handshakes/server_hello_done/server_hello_done2.js"
import { ServerDHParams } from "mods/binary/handshakes/server_key_exchange/server_dh_params.js"
import { getServerKeyExchange2, ServerKeyExchange2None } from "mods/binary/handshakes/server_key_exchange/server_key_exchange2.js"
import { ServerKeyExchange2Ephemeral } from "mods/binary/handshakes/server_key_exchange/server_key_exchange2_ephemeral.js"
import { Number16 } from "mods/binary/number.js"
import { Opaque } from "mods/binary/opaque.js"
import { ChangeCipherSpec } from "mods/binary/record/change_cipher_spec/change_cipher_spec.js"
import { CiphertextGenericBlockCipher, PlaintextGenericBlockCipher, PlaintextRecord, RecordHeader } from "mods/binary/record/record.js"
import { BytesVector } from "mods/binary/vector.js"
import { CipherSuite } from "mods/ciphers/cipher.js"
import { Secrets } from "mods/ciphers/secrets.js"

export type State =
  | NoneState
  | ClientHelloHandshakeState
  | ServerHelloHandshakeState
  | ServerCertificateHandshakeState
  | ServerKeyExchangeHandshakeState
  | ClientCertificateHandshakeState
  | ClientFinishedHandshakeState
  | ServerChangeCipherSpecHandshakeState

export interface NoneState {
  type: "none"
}

export interface HandshakeState {
  type: "handshake"
  messages: Uint8Array[]
}

export interface ClientHandshakeState extends HandshakeState {
  turn: "client"
}

export interface ServerHandshakeState extends HandshakeState {
  turn: "server"
}

export interface ClientHelloHandshakeState extends ClientHandshakeState {
  action: "client_hello"
  client_random: Uint8Array
}

export interface ServerHelloHandshakeState extends ServerHandshakeState {
  action: "server_hello"
  version: number
  cipher: CipherSuite
  client_random: Uint8Array
  server_random: Uint8Array
}

export interface ServerCertificateHandshakeState extends ServerHandshakeState {
  action: "certificate"
  version: number
  cipher: CipherSuite
  client_random: Uint8Array
  server_random: Uint8Array
  server_certificates: Certificate[]
}

export interface ServerKeyExchangeHandshakeState extends ServerHandshakeState {
  action: "server_key_exchange"
  version: number
  cipher: CipherSuite
  client_random: Uint8Array
  server_random: Uint8Array
  server_certificates: Certificate[]
  server_dh_params: ServerDHParams
}

export interface ClientCertificateHandshakeState extends ClientHandshakeState {
  action: "client_certificate"
  version: number
  cipher: CipherSuite
  client_random: Uint8Array
  server_random: Uint8Array
  server_certificates: Certificate[]
  server_dh_params: ServerDHParams
}

export interface ClientFinishedHandshakeState extends ClientHandshakeState {
  action: "finished"
  version: number
  cipher: CipherSuite
  client_random: Uint8Array
  server_random: Uint8Array
  server_certificates: Certificate[]
  server_dh_params: ServerDHParams
  secrets: Secrets
}

export interface ServerChangeCipherSpecHandshakeState extends ServerHandshakeState {
  action: "change_cipher_spec"
  version: number
  cipher: CipherSuite
  client_random: Uint8Array
  server_random: Uint8Array
  server_certificates: Certificate[]
  server_dh_params: ServerDHParams
  secrets: Secrets
}

export interface TlsParams {
  ciphers: CipherSuite[]
  signal?: AbortSignal
}

export class Tls {
  private input?: TransformStreamDefaultController<Uint8Array>
  private output?: TransformStreamDefaultController<Uint8Array>

  readonly readable: ReadableStream<Uint8Array>
  readonly writable: WritableStream<Uint8Array>

  private state: State = { type: "none" }

  private buffer = Bytes.allocUnsafe(4 * 4096)
  private wbinary = new Binary(this.buffer)
  private rbinary = new Binary(this.buffer)

  constructor(
    readonly stream: ReadableWritablePair<Uint8Array>,
    readonly params: TlsParams
  ) {
    const { signal } = params

    const read = new TransformStream<Uint8Array>({
      start: this.onReadStart.bind(this),
      transform: this.onRead.bind(this),
    })

    const write = new TransformStream<Uint8Array>({
      start: this.onWriteStart.bind(this),
      transform: this.onWrite.bind(this),
    })

    const [readable, trashable] = read.readable.tee()

    this.readable = readable
    this.writable = write.writable

    stream.readable
      .pipeTo(read.writable, { signal })
      .catch(() => { })

    write.readable
      .pipeTo(stream.writable, { signal })
      .catch(() => { })

    const trash = new WritableStream()

    /**
     * Force call to read.readable.transform()
     */
    trashable
      .pipeTo(trash, { signal })
      .catch(() => { })
  }

  async handshake() {
    const hello = ClientHello2.default(this.params.ciphers)

    const handshake = hello.handshake()
    const record = handshake.record(0x0301)
    this.output!.enqueue(record.export())

    const client_random = hello.random.export()

    this.state = { ...this.state, type: "handshake", messages: [handshake.export()], turn: "client", action: "client_hello", client_random }
  }

  private async onReadStart(controller: TransformStreamDefaultController<Uint8Array>) {
    this.input = controller
  }

  private async onRead(chunk: Uint8Array) {
    this.wbinary.write(chunk)
    this.rbinary.view = this.buffer.subarray(0, this.wbinary.offset)

    while (this.rbinary.remaining) {
      try {
        const header = RecordHeader.tryRead(this.rbinary)

        if (!header) break

        await this.onRecord(header, this.rbinary)
      } catch (e: unknown) {
        console.error(e)
      }
    }

    if (!this.rbinary.offset)
      return

    if (this.rbinary.offset === this.wbinary.offset) {
      this.rbinary.offset = 0
      this.wbinary.offset = 0
      return
    }

    if (this.rbinary.remaining && this.wbinary.remaining < 4096) {
      console.debug(`Reallocating buffer`)

      const remaining = this.buffer.subarray(this.rbinary.offset, this.wbinary.offset)

      this.rbinary.offset = 0
      this.wbinary.offset = 0

      this.buffer = Bytes.allocUnsafe(4 * 4096)
      this.rbinary.view = this.buffer
      this.wbinary.view = this.buffer

      this.wbinary.write(remaining)
      return
    }
  }

  private async onWriteStart(controller: TransformStreamDefaultController<Uint8Array>) {
    this.output = controller
  }

  private async onWrite(chunk: Uint8Array) {
    // TODO
  }

  private async onRecord(header: RecordHeader, binary: Binary) {
    if (this.state.type !== "handshake") {
      const fragment = Opaque.read(binary, header.length)
      const record = PlaintextRecord.from(header, fragment)

      return await this.onPlaintextRecord(record)
    }

    if (this.state.action !== "change_cipher_spec") {
      const fragment = Opaque.read(binary, header.length)
      const record = PlaintextRecord.from(header, fragment)

      return await this.onPlaintextRecord(record)
    }

    return await this.onCiphertextRecord(header, binary)
  }

  private async onCiphertextRecord(header: RecordHeader, binary: Binary) {
    if (this.state.type !== "handshake")
      throw new Error(`Invalid state`)
    if (this.state.action !== "change_cipher_spec")
      throw new Error(`Invalid state`)

    const gcipher = CiphertextGenericBlockCipher.read(binary, header.length)
    const gplain = await gcipher.decrypt(this.state.cipher, this.state.secrets)

    const fragment = Opaque.read(new Binary(gplain.content), gplain.content.length)
    const record = PlaintextRecord.from(header, fragment)

    return await this.onPlaintextRecord(record)
  }

  private async onPlaintextRecord(record: PlaintextRecord<Opaque>) {
    if (record.subtype === Alert.type)
      return await this.onAlert(record)
    if (record.subtype === Handshake.type)
      return await this.onHandshake(record)
    if (record.subtype === ChangeCipherSpec.type)
      return await this.onChangeCipherSpec(record)

    console.warn(record)
  }

  private async onAlert(record: PlaintextRecord<Opaque>) {
    const fragment = record.fragment.into<Alert>(Alert)

    console.log(fragment)
  }

  private async onChangeCipherSpec(record: PlaintextRecord<Opaque>) {
    if (this.state.type !== "handshake")
      throw new Error(`Invalid state`)
    if (this.state.action !== "finished")
      throw new Error(`Invalid state`)

    const fragment = record.fragment.into<ChangeCipherSpec>(ChangeCipherSpec)

    this.state = { ...this.state, turn: "server", action: "change_cipher_spec" }

    console.log(fragment)
  }

  private async onHandshake(record: PlaintextRecord<Opaque>) {
    if (this.state.type !== "handshake")
      throw new Error(`Invalid state`)

    const binary = new Binary(record.fragment.bytes)
    const header = HandshakeHeader.read(binary, binary.view.length)
    const fragment = Opaque.read(binary, header.length)
    const handshake = Handshake.from(header, fragment)

    if (handshake.subtype !== Handshake.types.hello_request)
      this.state.messages.push(record.fragment.bytes)

    if (handshake.subtype === ServerHello2.type)
      return this.onServerHello(handshake)
    if (handshake.subtype === Certificate2.type)
      return this.onCertificate(handshake)
    if (handshake.subtype === ServerHelloDone2.type)
      return this.onServerHelloDone(handshake)
    if (handshake.subtype === ServerKeyExchange2None.type)
      return this.onServerKeyExchange(handshake)
    if (handshake.subtype === CertificateRequest2.type)
      return this.onCertificateRequest(handshake)
    if (handshake.subtype === Finished2.type)
      return this.onFinished(handshake)

    console.warn(handshake)
  }

  private async onServerHello(handshake: Handshake<Opaque>) {
    if (this.state.type !== "handshake")
      throw new Error(`Invalid state`)
    if (this.state.turn !== "client")
      throw new Error(`Invalid state`)
    if (this.state.action !== "client_hello")
      throw new Error(`Invalid state`)

    const server_hello = handshake.fragment.into<ServerHello2>(ServerHello2)

    const version = server_hello.server_version

    if (version !== 0x0303)
      throw new Error(`Unsupported ${version} version`)

    const cipher = this.params.ciphers.find(it => it.id === server_hello.cipher_suite)

    if (cipher === undefined)
      throw new Error(`Unsupported ${server_hello.cipher_suite} cipher suite`)

    const server_random = server_hello.random.export()

    this.state = { ...this.state, type: "handshake", turn: "server", action: "server_hello", version, cipher, server_random }

    console.log(server_hello)
  }

  private async onCertificate(handshake: Handshake<Opaque>) {
    if (this.state.type !== "handshake")
      throw new Error(`Invalid state`)
    if (this.state.turn !== "server")
      throw new Error(`Invalid state`)
    if (this.state.action !== "server_hello")
      throw new Error(`Invalid state`)

    const certificate = handshake.fragment.into<Certificate2>(Certificate2)

    const server_certificates = certificate.certificate_list.array
      .map(it => X509.Certificate.fromBytes(it.bytes))

    this.state = { ...this.state, type: "handshake", turn: "server", action: "certificate", server_certificates }

    // console.log(server_certificates)
    // console.log(server_certificates.map(it => it.tbsCertificate.issuer.toX501()))
    // console.log(server_certificates.map(it => it.tbsCertificate.subject.toX501()))

    console.log(certificate)
  }

  private async onServerKeyExchange(handshake: Handshake<Opaque>) {
    if (this.state.type !== "handshake")
      throw new Error(`Invalid state`)
    if (this.state.turn !== "server")
      throw new Error(`Invalid state`)
    if (this.state.action !== "certificate")
      throw new Error(`Invalid state`)

    const clazz = getServerKeyExchange2(this.state.cipher)

    const server_key_exchange = handshake.fragment.into<InstanceType<typeof clazz>>(clazz)

    if (server_key_exchange instanceof ServerKeyExchange2Ephemeral) {
      const server_dh_params = server_key_exchange.params

      this.state = { ...this.state, action: "server_key_exchange", server_dh_params }
    }

    console.log(server_key_exchange)
  }

  private async onCertificateRequest(handshake: Handshake<Opaque>) {
    const certificate_request = handshake.fragment.into<CertificateRequest2>(CertificateRequest2)

    console.log(certificate_request)
  }

  private async computeDiffieHellman(state: ServerKeyExchangeHandshakeState) {
    const { dh_g, dh_p, dh_Ys } = state.server_dh_params

    const g = BigInt(`0x${Bytes.toHex(dh_g.bytes)}`)
    const p = BigInt(`0x${Bytes.toHex(dh_p.bytes)}`)
    const Ys = BigInt(`0x${Bytes.toHex(dh_Ys.bytes)}`)

    const dh_yc = Bytes.allocUnsafe(dh_p.bytes.length)

    crypto.getRandomValues(dh_yc)

    const yc = BigInt(`0x${Bytes.toHex(dh_yc)}`)

    const Yc = BigMath.umodpow(g, yc, p)
    const Z = BigMath.umodpow(Ys, yc, p)

    const dh_Yc = Bytes.fromHex(Yc.toString(16))
    const dh_Z = Bytes.fromHex(Z.toString(16))

    return { dh_Yc, dh_Z }
  }

  private async computeSecrets(state: ServerKeyExchangeHandshakeState, premaster_secret: Uint8Array) {
    const { cipher, client_random, server_random } = state

    const master_secret_seed = Bytes.concat([client_random, server_random])
    const master_secret = await PRF("SHA-256", premaster_secret, "master secret", master_secret_seed, 48)

    const key_block_length = 0
      + (2 * cipher.hash.mac_key_length)
      + (2 * cipher.encryption.enc_key_length)
      + (2 * cipher.encryption.fixed_iv_length)

    const key_block_seed = Bytes.concat([server_random, client_random])
    const key_block = await PRF("SHA-256", master_secret, "key expansion", key_block_seed, key_block_length)

    const key_block_binary = new Binary(key_block)

    const client_write_MAC_key = key_block_binary.read(cipher.hash.mac_key_length)
    const server_write_MAC_key = key_block_binary.read(cipher.hash.mac_key_length)

    const client_write_key = key_block_binary.read(cipher.encryption.enc_key_length)
    const server_write_key = key_block_binary.read(cipher.encryption.enc_key_length)

    const client_write_IV = key_block_binary.read(cipher.encryption.fixed_iv_length)
    const server_write_IV = key_block_binary.read(cipher.encryption.fixed_iv_length)

    return {
      master_secret,
      client_write_MAC_key,
      server_write_MAC_key,
      client_write_key,
      server_write_key,
      client_write_IV,
      server_write_IV
    } as Secrets
  }

  private async onServerHelloDone(handshake: Handshake<Opaque>) {
    if (this.state.type !== "handshake")
      throw new Error(`Invalid state`)
    if (this.state.turn !== "server")
      throw new Error(`Invalid state`)
    if (this.state.action !== "server_key_exchange")
      throw new Error(`Invalid state`)

    const server_hello_done = handshake.fragment.into<ServerHelloDone2>(ServerHelloDone2)

    console.log(server_hello_done)

    const { dh_Yc, dh_Z } = await this.computeDiffieHellman(this.state)

    const vkey = new (BytesVector<Number16>(Number16))(dh_Yc)
    const cdhpe = new ClientDiffieHellmanPublicExplicit(vkey)
    const ckedh = new ClientKeyExchange2DH(cdhpe)

    const premaster_secret = dh_Z

    const secrets = await this.computeSecrets(this.state, premaster_secret)

    const bhckedh = ckedh.handshake().export()
    this.state.messages.push(bhckedh)

    const handshake_messages = Bytes.concat(this.state.messages)
    const handshake_messages_hash = new Uint8Array(await crypto.subtle.digest("SHA-256", handshake_messages))

    const verify_data = await PRF("SHA-256", secrets.master_secret, "client finished", handshake_messages_hash, 12)
    const finished = new Finished2(verify_data)

    const brckedh = ckedh.handshake().record(this.state.version).export()
    const brccs = new ChangeCipherSpec().record(this.state.version).export()

    const prfinished = finished.handshake().record(this.state.version)
    const drfinished = await PlaintextGenericBlockCipher.from(prfinished, secrets, BigInt(0))
    const erfinished = await drfinished.encrypt(this.state.cipher, secrets)
    const crfinished = prfinished.ciphertext(erfinished).export()

    this.state = { ...this.state, turn: "client", action: "finished", secrets }

    this.output!.enqueue(Bytes.concat([brckedh, brccs, crfinished]))
  }

  private async onFinished(handshake: Handshake<Opaque>) {
    console.log("Finished", handshake)
  }
}