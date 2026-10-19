import { os } from "@orpc/server";
import { z } from "zod";
import type {
  RequestHeadersPluginContext,
  ResponseHeadersPluginContext,
} from "@orpc/server/plugins";

interface ORPCContext
  extends RequestHeadersPluginContext,
    ResponseHeadersPluginContext {
  requestUrl?: string;
}

export const baseOs = os.$context<ORPCContext>().errors({
  INPUT_VALIDATION_FAILED: {
    status: 422,
    data: z.object({
      formErrors: z.array(z.string()),
      fieldErrors: z.record(z.string(), z.array(z.string()).optional()),
    }),
  },
});
