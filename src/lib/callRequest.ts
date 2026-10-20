// The body of a "send a real call" request, validated on the server. Unit-tested.
import { z } from "zod";

export const CallRequestBody = z.object({
  senderName: z.string().trim().min(1).max(30).regex(/^[\p{L}\p{N} .'\-]+$/u, "Use letters, numbers and spaces only"),
  phone: z.string().min(7).max(25),
  characterId: z.string().max(40),
  scenarioId: z.string().max(60),
  callerNumber: z.string().optional(),
  /** The sender's promise that the friend agreed (Terms of Service). Required for every call. */
  senderAttests: z.literal(true, { errorMap: () => ({ message: "Confirm your friend agreed to get prank calls from you." }) }),
});
