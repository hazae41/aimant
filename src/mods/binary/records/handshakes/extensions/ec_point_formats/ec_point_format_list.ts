import { Binary } from "@hazae41/binary";
import { Array } from "mods/binary/arrays/array.js";
import { UnlengthedArray } from "mods/binary/arrays/unlengthed.js";
import { WritableArray } from "mods/binary/arrays/writable.js";
import { Number8 } from "mods/binary/numbers/number8.js";
import { ECPointFormat } from "mods/binary/records/handshakes/extensions/ec_point_formats/ec_point_format.js";
import { LengthedVector } from "mods/binary/vectors/lengthed.js";
import { Vector } from "mods/binary/vectors/vector.js";
import { WritableVector } from "mods/binary/vectors/writable.js";

export class ECPointFormatList {
  readonly #class = ECPointFormatList

  constructor(
    readonly ec_point_format_list: Vector<Number8, Array<ECPointFormat>>
  ) { }

  static default() {
    const { uncompressed } = ECPointFormat.instances

    return this.from([uncompressed])
  }

  static from(ec_point_formats: ECPointFormat[]) {
    const ec_point_format_list = WritableVector(Number8).from(WritableArray.from(ec_point_formats))

    return new this(ec_point_format_list)
  }

  get class() {
    return this.#class
  }

  size() {
    return this.ec_point_format_list.size()
  }

  write(binary: Binary) {
    this.ec_point_format_list.write(binary)
  }

  export() {
    const binary = Binary.allocUnsafe(this.size())
    this.write(binary)
    return binary.bytes
  }

  static read(binary: Binary) {
    const ec_point_format_list = LengthedVector(Number8, UnlengthedArray(ECPointFormat)).read(binary)

    return new this(ec_point_format_list)
  }
}