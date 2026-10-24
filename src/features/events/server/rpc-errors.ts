import "server-only";
import { ApiError, type ErrorCode } from "./stubs";

// Exceptions raised by the 0600 functions, mapped to the shared envelope's error codes.
const RPC_ERRORS: ReadonlyArray<[string, ErrorCode, string]> = [
  ["UNAUTHENTICATED", "UNAUTHENTICATED", "Sign in to continue"],
  ["NOT_FOUND", "NOT_FOUND", "Event or RSVP not found"],
  ["EVENT_NOT_OPEN", "CONFLICT", "This event is not taking RSVPs"],
  ["EVENT_STARTED", "CONFLICT", "This event has already started"],
  ["CAPACITY_FULL", "CAPACITY_FULL", "This event is full"],
  ["ALREADY_RSVPED", "CONFLICT", "You already RSVP'd to this event"],
  ["EVENT_NOT_COMPLETED", "CONFLICT", "You can reconnect once the event is completed"],
  ["NOT_ATTENDEES", "FORBIDDEN", "You can only reconnect with people who attended with you"],
  ["VALIDATION", "VALIDATION", "Invalid request"],
];

/** Converts a Postgres/PostgREST error from one of our functions into an ApiError. */
export function fromRpcError(error: { message: string }): ApiError {
  const match = RPC_ERRORS.find(([token]) => error.message.includes(token));
  return match ? new ApiError(match[1], match[2]) : new ApiError("INTERNAL", "Something went wrong");
}
