export class AppError extends Error {
  constructor(
    public readonly code: "SESSION_NOT_FOUND" | "DATA_STORE_CORRUPTED" | "INVALID_OPERATION",
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}
