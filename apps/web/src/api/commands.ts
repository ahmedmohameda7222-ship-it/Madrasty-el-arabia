"use client";

import { useRef } from "react";
import type { ZodType } from "zod";
import { ApiResponseError, requestApi } from "./client";
import { webHeaders } from "@/features/identity/SessionControls";

export function useAdminCommand() {
  const attempted = useRef(new Map<string, { body: string; key: string }>());
  return async <T>(path: `/${string}`, method: "POST" | "PATCH" | "PUT", input: unknown, output: ZodType<T>) => {
    const body = JSON.stringify(input);
    const operation = `${method}:${path}`;
    const previous = attempted.current.get(operation);
    const key = previous?.body === body ? previous.key : crypto.randomUUID();
    attempted.current.set(operation, { body, key });
    try {
      const { data } = await requestApi(path, output, {
        method, body, headers: { ...webHeaders("admin"), "Idempotency-Key": key },
      });
      attempted.current.delete(operation);
      return data;
    } catch (error) {
      if (error instanceof ApiResponseError && error.status < 500) attempted.current.delete(operation);
      throw error;
    }
  };
}
