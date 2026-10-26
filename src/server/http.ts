import { z, ZodError } from "zod";
import { logger } from "@/lib/logger";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = "error",
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Browsers always send Origin on cross-site POSTs; a mismatch means CSRF. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser client (tests, curl)
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let ok = false;
  try {
    ok = new URL(origin).host === host;
  } catch {
    ok = false;
  }
  if (!ok) throw new HttpError(403, "Cross-origin request blocked", "bad_origin");
}

/** Validates the [id] path segment so bad input is a 400, never a Postgres error. */
export async function idParam(ctx: { params: Promise<{ id: string }> }) {
  return z.string().uuid().parse((await ctx.params).id);
}

const PG_ERRORS: Record<string, [number, string, string]> = {
  "42501": [403, "forbidden", "Not allowed"],
  "57014": [503, "busy", "Server busy, please retry"],
  "40P01": [503, "busy", "Conflict, please retry"],
  "40001": [503, "busy", "Conflict, please retry"],
};

/** Wraps a handler so every failure becomes a safe, uniform JSON error. */
/** Wraps a handler so every response has a request ID and safe JSON errors. */
export function route<C = unknown>(
  handler: (req: Request, ctx: C) => Promise<Response>,
) {
  return async (req: Request, ctx: C): Promise<Response> => {
    const requestId = crypto.randomUUID();

    try {
      const response = await handler(req, ctx);
      response.headers.set("x-request-id", requestId);
      return response;
    } catch (err) {
      let response: Response;

      if (err instanceof HttpError) {
        response = Response.json(
          {
            error: {
              code: err.code,
              message: err.message,
              requestId,
              ...(err.details ? { details: err.details } : {}),
            },
          },
          { status: err.status },
        );
      } else if (err instanceof ZodError) {
        response = Response.json(
          {
            error: {
              code: "invalid_input",
              message: "Invalid input",
              requestId,
            },
          },
          { status: 400 },
        );
      } else {
        const pgCode = (err as { code?: string }).code;
        const mapped = pgCode ? PG_ERRORS[pgCode] : undefined;

        if (mapped) {
          const [status, code, message] = mapped;

          logger.warn(
            { pgCode, requestId, path: new URL(req.url).pathname },
            "database error mapped",
          );

          response = Response.json(
            { error: { code, message, requestId } },
            { status },
          );
        } else {
          logger.error(
            { err, requestId, path: new URL(req.url).pathname },
            "unhandled error",
          );

          response = Response.json(
            {
              error: {
                code: "internal",
                message: "Internal error",
                requestId,
              },
            },
            { status: 500 },
          );
        }
      }

      response.headers.set("x-request-id", requestId);
      return response;
    }
  };
}