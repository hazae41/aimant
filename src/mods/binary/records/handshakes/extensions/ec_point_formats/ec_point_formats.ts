import { Binary } from "@hazae41/binary";
import { ECPointFormatList } from "mods/binary/records/handshakes/extensions/ec_point_formats/ec_point_format_list.js";
import { Extension } from "mods/binary/records/handshakes/extensions/extension.js";

export class ECPointFormats {
  readonly #class = ECPointFormats

  static readonly type = Extension.types.ec_point_formats

  constructor(
    readonly ec_point_format_list: ECPointFormatList
  ) { }

  static default() {
    return new this(ECPointFormatList.default())
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

  extension() {
    return Extension.from(this.#class.type, this)
  }

  static read(binary: Binary) {
    const ec_point_format_list = ECPointFormatList.read(binary)

    return new this(ec_point_format_list)
  }
}