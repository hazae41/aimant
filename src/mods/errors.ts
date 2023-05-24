import { Alert } from "./binary/records/alerts/alert.js"

export class InvalidStateError extends Error {
  readonly #class = InvalidStateError
  readonly name = this.#class.name

  constructor() {
    super(`Invalid state`)
  }

}

export class UnsupportedVersionError extends Error {
  readonly #class = UnsupportedVersionError
  readonly name = this.#class.name

  constructor(
    readonly version: number
  ) {
    super(`Unsupported version ${version}`)
  }

}

export class UnsupportedCipherError extends Error {
  readonly #class = UnsupportedCipherError
  readonly name = this.#class.name

  constructor(
    readonly cipher: number
  ) {
    super(`Unsupported cipher ${cipher}`)
  }

}

export class FatalAlertError extends Error {
  readonly #class = FatalAlertError
  readonly name = this.#class.name

  constructor(
    readonly alert: Alert
  ) {
    super(`Fatal alert ${alert.description}`)
  }

}

export class WarningAlertError extends Error {
  readonly #class = WarningAlertError
  readonly name = this.#class.name

  constructor(
    readonly alert: Alert
  ) {
    super(`Warning alert ${alert.description}`)
  }

}