import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StreamPulseBatch } from "./models.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMA_PATH = path.resolve(__dirname, "../../spec/event-schema.v1.json");
const rawSchema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf-8"));

const AjvClass = (Ajv2020 as unknown as { default?: typeof Ajv2020 }).default ?? Ajv2020;
// Initialize Ajv with 2020-12 draft support
interface AjvInstance {
  compile: (schema: unknown) => ((data: unknown) => boolean) & { errors?: Array<{ instancePath?: string; message?: string }> };
}

const ajv = new (AjvClass as unknown as new (opts: unknown) => AjvInstance)({
  allErrors: true,
  strict: false,
});
// @ts-expect-error ajv-formats typing
addFormats(ajv);

const validateBatchSchema = ajv.compile(rawSchema);

export const KNOWN_EVENT_TYPES = new Set([
  "session_start",
  "play_requested",
  "first_frame",
  "buffering_start",
  "buffering_end",
  "seek_start",
  "seek_end",
  "quality_change",
  "dropped_frames",
  "playback_error",
  "heartbeat",
  "playback_end",
  "app_health",
]);

export interface ValidationOutcome {
  valid: boolean;
  errors?: string[];
  cleanedBatch?: StreamPulseBatch;
  unknownEventsCount: number;
}

export function validateAndCleanBatch(input: unknown): ValidationOutcome {
  if (!input || typeof input !== "object") {
    return {
      valid: false,
      errors: ["Batch payload must be a non-null object"],
      unknownEventsCount: 0,
    };
  }

  const rawBatch = input as Record<string, unknown>;
  const events = rawBatch.events;

  let unknownEventsCount = 0;
  let cleanedEvents = events;

  if (Array.isArray(events)) {
    const known = [];
    for (const ev of events) {
      if (ev && typeof ev === "object" && "type" in ev && typeof ev.type === "string") {
        if (KNOWN_EVENT_TYPES.has(ev.type)) {
          known.push(ev);
        } else {
          unknownEventsCount++;
        }
      } else {
        known.push(ev);
      }
    }
    cleanedEvents = known;
  }

  const candidateBatch = {
    ...rawBatch,
    events: cleanedEvents,
  };

  const valid = validateBatchSchema(candidateBatch);
  if (!valid) {
    const errors = validateBatchSchema.errors?.map(
      (e: { instancePath?: string; message?: string }) => `${e.instancePath || "/"} ${e.message}`
    ) ?? ["Unknown validation error"];
    return {
      valid: false,
      errors,
      unknownEventsCount,
    };
  }

  return {
    valid: true,
    cleanedBatch: candidateBatch as unknown as StreamPulseBatch,
    unknownEventsCount,
  };
}
