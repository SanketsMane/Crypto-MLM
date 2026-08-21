export class AppError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
    public code = 'BAD_REQUEST',
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (m: string, d?: unknown) => new AppError(m, 400, 'BAD_REQUEST', d);
export const unauthorized = (m = 'Not authenticated') => new AppError(m, 401, 'UNAUTHORIZED');
export const forbidden = (m = 'Not allowed') => new AppError(m, 403, 'FORBIDDEN');
export const notFound = (m = 'Not found') => new AppError(m, 404, 'NOT_FOUND');
export const conflict = (m: string) => new AppError(m, 409, 'CONFLICT');
export const insufficientFunds = (m = 'Insufficient balance') =>
  new AppError(m, 422, 'INSUFFICIENT_FUNDS');
