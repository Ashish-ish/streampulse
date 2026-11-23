import { buildServer } from "../server/dist/server.js";
import { generateSessionBatch } from "../tools/simulator/dist/generator.js";
import { SeededRNG } from "../tools/simulator/dist/prng.js";

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

async function runBenchmark() {
  console.log("============================================================");
  console.log("StreamPulse Ingestion & Rollup Benchmark");
  console.log("============================================================");

  const app = buildServer({ inMemoryDb: true, logger: false });
  await app.ready();

  const TOTAL_BATCHES = 1000;
  const CONCURRENCY = 10;
  const latencies = [];

  console.log(`Generating and ingesting ${TOTAL_BATCHES} realistic session batches...`);
  console.log(`Concurrency: ${CONCURRENCY} concurrent workers`);

  // Pre-generate batches with deterministic seed
  const rng = new SeededRNG(1337);
  const batches = [];
  let totalEvents = 0;
  for (let i = 0; i < TOTAL_BATCHES; i++) {
    const batch = generateSessionBatch(rng, "mixed", i * 60000);
    totalEvents += batch.events.length;
    batches.push(JSON.stringify(batch));
  }

  console.log(`Prepared ${batches.length} batches containing ${totalEvents} total events.`);
  console.log("Executing ingest benchmark...");

  let completed = 0;
  let errorCount = 0;
  const startTime = performance.now();

  async function worker(workerId) {
    for (let i = workerId - 1; i < batches.length; i += CONCURRENCY) {
      const payload = batches[i];
      const reqStart = performance.now();

      const response = await app.inject({
        method: "POST",
        url: "/v1/batches",
        headers: { "content-type": "application/json" },
        payload,
      });

      const reqEnd = performance.now();
      latencies.push(reqEnd - reqStart);

      if (response.statusCode !== 202) {
        errorCount++;
        if (errorCount === 1) {
          console.error(`Batch ${i} failed with status: ${response.statusCode}, body: ${response.body}`);
        }
      }

      completed++;
    }
  }

  const workers = [];
  for (let w = 1; w <= CONCURRENCY; w++) {
    workers.push(worker(w));
  }
  await Promise.all(workers);

  const totalTimeMs = performance.now() - startTime;
  const totalSeconds = totalTimeMs / 1000;
  latencies.sort((a, b) => a - b);

  const batchesPerSec = TOTAL_BATCHES / totalSeconds;
  const eventsPerSec = totalEvents / totalSeconds;

  console.log("\n--- BENCHMARK RESULTS ---");
  console.log(`Total Batches Ingested:   ${TOTAL_BATCHES}`);
  console.log(`Total Events Ingested:    ${totalEvents}`);
  console.log(`Total Ingestion Time:     ${totalSeconds.toFixed(3)} s`);
  console.log(`Batch Throughput:         ${batchesPerSec.toFixed(1)} batches/sec`);
  console.log(`Event Throughput:         ${eventsPerSec.toFixed(1)} events/sec`);
  console.log(`Latency min:              ${latencies[0].toFixed(2)} ms`);
  console.log(`Latency p50:              ${percentile(latencies, 50).toFixed(2)} ms`);
  console.log(`Latency p90:              ${percentile(latencies, 90).toFixed(2)} ms`);
  console.log(`Latency p95:              ${percentile(latencies, 95).toFixed(2)} ms`);
  console.log(`Latency p99:              ${percentile(latencies, 99).toFixed(2)} ms`);
  console.log(`Latency max:              ${latencies[latencies.length - 1].toFixed(2)} ms`);
  console.log(`Failed Batches:           ${errorCount}`);

  // Query API verification
  const summaryRes = await app.inject({
    method: "GET",
    url: "/v1/metrics/summary",
  });
  const summary = summaryRes.json();
  console.log("\n--- QUERY API INTEGRITY VERIFICATION ---");
  console.log(`Total Ingested Sessions:  ${summary.total_sessions}`);
  console.log(`Average QoE Score:        ${summary.avg_qoe}`);
  console.log(`Startup Time p50:         ${summary.startup_p50_ms} ms`);
  console.log(`Startup Time p95:         ${summary.startup_p95_ms} ms`);
  console.log(`Rebuffer Ratio:           ${summary.rebuffer_ratio}`);
  console.log(`Crash-Free Session Rate:  ${summary.crash_free_sessions_rate}%`);
  console.log(`VSF Rate:                 ${summary.vsf_rate}%`);
  console.log(`EBVS Rate:                ${summary.ebvs_rate}%`);

  await app.close();
  console.log("============================================================\n");
}

runBenchmark().catch(console.error);
