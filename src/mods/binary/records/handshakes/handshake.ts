import { BinaryReadError, BinaryWriteError, Opaque, Readable, UnsafeOpaque, Writable } from "@hazae41/binary"
import { Cursor } from "@hazae41/cursor"
import { Ok, Result } from "@hazae41/result"
import { Record } from "mods/binary/records/record.js"

export interface Handshakeable<T extends Writable> extends Writable.Infer<T> {
  readonly handshake_type: number
}

export class Handshake<T extends Writable.Infer<T>> {
  readonly #class = Handshake

  static readonly record_type = Record.types.handshake

  static readonly types = {
    hello_request: 0,
    client_hello: 1,
    server_hello: 2,
    certificate: 11,
    server_key_exchange: 12,
    certificate_request: 13,
    server_hello_done: 14,
    certificate_verify: 15,
    client_key_exchange: 16,
    finished: 20,
  } as const

  constructor(
    readonly type: number,
    readonly fragment: T
  ) { }

  static from<T extends Handshakeable<T>>(handshake: T) {
    return new Handshake(handshake.handshake_type, handshake)
  }

  get record_type() {
    return this.#class.record_type
  }

  trySize(): Result<number, Writable.SizeError<T>> {
    return this.fragment.trySize().mapSync(x => 1 + 3 + x)
  }

  tryWrite(cursor: Cursor): Result<void, Writable.SizeError<T> | Writable.WriteError<T> | BinaryWriteError> {
    return Result.unthrowSync(t => {
      cursor.tryWriteUint8(this.type).throw(t)

      const size = this.fragment.trySize().throw(t)
      cursor.tryWriteUint24(size).throw(t)

      this.fragment.tryWrite(cursor).throw(t)

      return Ok.void()
    })
  }

  static tryRead(cursor: Cursor): Result<Handshake<Opaque>, BinaryReadError> {
    return Result.unthrowSync(t => {
      const type = cursor.tryReadUint8().throw(t)
      const size = cursor.tryReadUint24().throw(t)
      const bytes = cursor.tryRead(size).throw(t)
      const fragment = Readable.tryReadFromBytes(UnsafeOpaque, bytes).throw(t)

      return new Ok(new Handshake<Opaque>(type, fragment))
    })
  }

}