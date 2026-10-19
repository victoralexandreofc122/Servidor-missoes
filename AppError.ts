/** Erro que pode ir para o jogador: status HTTP, código estável e mensagem em português. */
export interface PublicError {
  status: number;
  code: string;
  message: string;
}

export class AppError extends Error implements PublicError {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(error: PublicError, options: { details?: unknown; cause?: unknown } = {}) {
    super(error.message, { cause: options.cause });
    this.name = 'AppError';
    this.status = error.status;
    this.code = error.code;
    this.details = options.details;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}
