import fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import zlib from "node:zlib";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./db.js";
import { ingestBatch, getUnknownEventsCounter } from "./ingest.js";
import {
  getMetricsSummary,
  getCorrelationMetrics,
  getTimeseriesMetrics,
  listSessions,
  getSessionDetail,
  type FilterParams,
} from "./query.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerOptions {
  dbFilePath?: string;
  inMemoryDb?: boolean;
  dashboardDistPath?: string;
  logger?: boolean;
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = fastify({
    logger: options.logger ?? false,
    bodyLimit: 10 * 1024 * 1024, // 10MB
  });

  const db = createDatabase({
    filePath: options.dbFilePath,
    inMemory: options.inMemoryDb,
  });

  app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
  });

  // Support GZIP request bodies
  app.addContentTypeParser(
    ["application/json", "application/octet-stream"],
    { parseAs: "buffer" },
    (req, body, done) => {
      try {
        let payloadBuffer = body as Buffer;
        const encoding = req.headers["content-encoding"];
        if (encoding === "gzip") {
          payloadBuffer = zlib.gunzipSync(payloadBuffer);
        }
        if (payloadBuffer.length === 0) {
          done(null, {});
          return;
        }
        const json = JSON.parse(payloadBuffer.toString("utf-8"));
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  // Health check
  app.get("/v1/health", async () => {
    return {
      status: "ok",
      uptime_seconds: Math.round(process.uptime()),
      unknown_events_dropped: getUnknownEventsCounter(),
    };
  });

  // Batch Ingestion
  app.post("/v1/batches", async (req, reply) => {
    try {
      const result = ingestBatch(db, req.body);
      const serverDate = new Date().toUTCString();
      reply.header("Date", serverDate);
      return reply.code(202).send(result);
    } catch (err) {
      const message = (err as Error).message;
      return reply.code(400).send({
        error: "Bad Request",
        message,
      });
    }
  });

  // Analytics Endpoints
  app.get("/v1/metrics/summary", async (req) => {
    return getMetricsSummary(db, req.query as FilterParams);
  });

  app.get("/v1/metrics/correlation", async (req) => {
    const query = req.query as { dimension?: "rebuffer" | "dropped_frame" } & FilterParams;
    const dimension = query.dimension === "dropped_frame" ? "dropped_frame" : "rebuffer";
    return getCorrelationMetrics(db, dimension, query);
  });

  app.get("/v1/metrics/timeseries", async (req) => {
    const query = req.query as {
      metric?: string;
      breakdown?: string;
      interval?: "minute" | "hour" | "day";
    } & FilterParams;
    const metric = query.metric ?? "qoe";
    const breakdown = query.breakdown ?? "none";
    const interval = query.interval ?? "hour";
    return getTimeseriesMetrics(db, metric, breakdown, interval, query);
  });

  app.get("/v1/sessions", async (req) => {
    const query = req.query as {
      limit?: string;
      offset?: string;
      sort?: "worst_qoe" | "worst_rebuffer" | "recent";
    } & FilterParams;

    return listSessions(db, {
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
      sort: query.sort,
      filters: query,
    });
  });

  app.get("/v1/sessions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const detail = getSessionDetail(db, id);
    if (!detail) {
      return reply.code(404).send({ error: "Session not found" });
    }
    return detail;
  });

  app.get("/v1/sessions/:id/events", async (req, reply) => {
    const { id } = req.params as { id: string };
    const detail = getSessionDetail(db, id);
    if (!detail) {
      return reply.code(404).send({ error: "Session not found" });
    }
    return detail.waterfall;
  });

  // Dashboard static file serving
  const dashboardDist =
    options.dashboardDistPath ??
    path.resolve(__dirname, "../../dashboard/dist");

  if (fs.existsSync(dashboardDist)) {
    app.register(fastifyStatic, {
      root: dashboardDist,
      prefix: "/dashboard/",
      decorateReply: false,
    });

    app.get("/", async (_, reply) => {
      return reply.redirect("/dashboard/");
    });
  }

  return app;
}

// Start server if invoked directly
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const PORT = parseInt(process.env.PORT || "3000", 10);
  const HOST = process.env.HOST || "0.0.0.0";
  const dbPath = process.env.DB_PATH || path.resolve(__dirname, "../data/streampulse.db");

  const server = buildServer({
    dbFilePath: dbPath,
    logger: true,
  });

  server.listen({ port: PORT, host: HOST }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`StreamPulse Server listening on ${address}`);
    console.log(`Dashboard available at ${address}/dashboard/`);
  });
}
