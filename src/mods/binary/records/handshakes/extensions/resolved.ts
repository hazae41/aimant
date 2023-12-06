import { Opaque, SafeOpaque } from "@hazae41/binary"
import { Cursor } from "@hazae41/cursor"
import { Vector } from "index.js"
import { Number16 } from "mods/binary/numbers/number16.js"
import { Extension } from "mods/binary/records/handshakes/extensions/extension.js"
import { ReadableVector } from "mods/binary/vectors/readable.js"
import { ECPointFormats } from "./ec_point_formats/ec_point_formats.js"
import { EllipticCurves } from "./elliptic_curves/elliptic_curves.js"
import { ServerNameList } from "./server_name/server_name_list.js"
import { SignatureAlgorithms } from "./signature_algorithms/signature_algorithms.js"

export type ResolvedExtension =
  | ServerNameList
  | SignatureAlgorithms
  | EllipticCurves
  | ECPointFormats
  | Opaque

export namespace ResolvedExtension {

  function resolveOrThrow(type: number, cursor: Cursor): Vector<Number16, ResolvedExtension> {
    // if (type === Extension.types.server_name)
    //   return ReadableVector(Number16, ServerNameList).readOrThrow(cursor)
    if (type === Extension.types.signature_algorithms)
      return ReadableVector(Number16, SignatureAlgorithms).readOrThrow(cursor)
    if (type === Extension.types.elliptic_curves)
      return ReadableVector(Number16, EllipticCurves).readOrThrow(cursor)
    if (type === Extension.types.ec_point_formats)
      return ReadableVector(Number16, ECPointFormats).readOrThrow(cursor)

    return ReadableVector(Number16, SafeOpaque).readOrThrow(cursor)
  }

  export function readOrThrow(cursor: Cursor): Extension<ResolvedExtension> {
    const type = cursor.readUint16OrThrow()
    const data = resolveOrThrow(type, cursor)

    return new Extension<ResolvedExtension>(type, data)
  }

}