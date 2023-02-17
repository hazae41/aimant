import { Cursor } from "@hazae41/binary";

export class NamedCurve {

  static readonly types = {
    secp256r1: 23,
    secp384r1: 24,
    secp521r1: 25,
    x25519: 29,
    x448: 30,
  } as const

  static readonly instances = {
    secp256r1: new this(this.types.secp256r1),
    secp384r1: new this(this.types.secp384r1),
    secp521r1: new this(this.types.secp521r1),
    x25519: new this(this.types.x25519),
    x448: new this(this.types.x448),
  }

  constructor(
    readonly subtype: number
  ) { }

  size() {
    return 2
  }

  write(cursor: Cursor) {
    cursor.writeUint16(this.subtype)
  }

  static read(cursor: Cursor,) {
    const subtype = cursor.readUint16()

    return new this(subtype)
  }
}
