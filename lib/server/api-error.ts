export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly expose: boolean;

  constructor(status: number, code: string, message: string, expose = true) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.expose = expose;
  }
}

export function badRequest(message: string, code = "invalid_request"): never {
  throw new ApiError(400, code, message);
}

export function notFound(resource = "Resource"): never {
  throw new ApiError(404, "not_found", `${resource} was not found`);
}

export function conflict(message: string, code = "conflict"): never {
  throw new ApiError(409, code, message);
}
