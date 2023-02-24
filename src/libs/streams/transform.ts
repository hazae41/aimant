export class SuperTransformStream<I, O>  {

  readonly transformer: SuperTransformer<I, O>

  constructor(
    readonly subtransformer: Transformer<I, O>,
    readonly writableStrategy?: QueuingStrategy<I>,
    readonly readableStrategy?: QueuingStrategy<O>
  ) {
    this.transformer = new SuperTransformer(subtransformer)
  }

  create() {
    const { transformer, writableStrategy, readableStrategy } = this
    return new TransformStream(transformer, writableStrategy, readableStrategy)
  }

  enqueue(chunk?: O) {
    return this.transformer.controller.enqueue(chunk)
  }

  error(reason?: any) {
    return this.transformer.controller.error(reason)
  }

  terminate() {
    return this.transformer.controller.terminate()
  }

}

export class SuperTransformer<I, O> implements Transformer<I, O> {

  constructor(
    readonly subtransformer: Transformer<I, O>
  ) { }

  #controller?: TransformStreamDefaultController<O>

  get controller() {
    return this.#controller!
  }

  get readableType() {
    return this.subtransformer.readableType
  }

  get writableType() {
    return this.subtransformer.writableType
  }

  start(controller: TransformStreamDefaultController<O>) {
    this.#controller = controller

    return this.subtransformer.start?.(controller)
  }

  transform(chunk: I, controller: TransformStreamDefaultController<O>) {
    return this.subtransformer.transform?.(chunk, controller)
  }

  flush(controller: TransformStreamDefaultController<O>) {
    return this.subtransformer.flush?.(controller)
  }

}