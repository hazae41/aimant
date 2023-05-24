import { BinaryReadError, BinaryWriteError } from "@hazae41/binary";
import { Cursor } from "@hazae41/cursor";
import { Result } from "@hazae41/result";
import { ReadableList } from "mods/binary/lists/readable.js";
import { List } from "mods/binary/lists/writable.js";
import { Number16 } from "mods/binary/numbers/number16.js";
import { Extension } from "mods/binary/records/handshakes/extensions/extension.js";
import { SignatureAndHashAlgorithm } from "mods/binary/signatures/signature_and_hash_algorithm.js";
import { ReadableVector } from "mods/binary/vectors/readable.js";
import { Vector } from "mods/binary/vectors/writable.js";

export class SignatureAlgorithms {
  readonly #class = SignatureAlgorithms

  static readonly type = Extension.types.signature_algorithms

  constructor(
    readonly supported_signature_algorithms: Vector<Number16, List<SignatureAndHashAlgorithm>>
  ) { }

  static new(supported_signature_algorithms: Vector<Number16, List<SignatureAndHashAlgorithm>>) {
    return new SignatureAlgorithms(supported_signature_algorithms)
  }

  static default() {
    const { rsaWithSha256 } = SignatureAndHashAlgorithm.instances

    const supported_signature_algorithms = Vector(Number16).from(List.from([rsaWithSha256]))

    return new this(supported_signature_algorithms)
  }

  get type() {
    return this.#class.type
  }

  trySize(): Result<number, never> {
    return this.supported_signature_algorithms.trySize()
  }

  tryWrite(cursor: Cursor): Result<void, BinaryWriteError> {
    return this.supported_signature_algorithms.tryWrite(cursor)
  }

  static tryRead(cursor: Cursor): Result<SignatureAlgorithms, BinaryReadError> {
    return ReadableVector(Number16, ReadableList(SignatureAndHashAlgorithm)).tryRead(cursor).mapSync(SignatureAlgorithms.new)
  }

}