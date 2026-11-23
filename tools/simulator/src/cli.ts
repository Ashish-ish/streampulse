import { SeededRNG } from "./prng.js";
import { generateSessionBatch, type ProfileName, type BatchPayload } from "./generator.js";

interface CliOptions {
  sessions: number;
  profile: ProfileName;
  endpoint: string;
  seed: number;
  concurrency: number;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    sessions: 500,
    profile: "mixed",
    endpoint: "http://localhost:3000",
    seed: 42,
    concurrency: 10,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--sessions" && args[i + 1]) {
      options.sessions = parseInt(args[++i], 10);
    } else if (arg === "--profile" && args[i + 1]) {
      options.profile = args[++i] as ProfileName;
    } else if (arg === "--endpoint" && args[i + 1]) {
      options.endpoint = args[++i];
    } else if (arg === "--seed" && args[i + 1]) {
      options.seed = parseInt(args[++i], 10);
    } else if (arg === "--concurrency" && args[i + 1]) {
      options.concurrency = parseInt(args[++i], 10);
    }
  }

  return options;
}

async function runSimulator(): Promise<void> {
  const options = parseArgs();
  console.log("=".repeat(60));
  console.log("StreamPulse Synthetic Telemetry Simulator");
  console.log("=".repeat(60));
  console.log(`Target Endpoint : ${options.endpoint}`);
  console.log(`Total Sessions  : ${options.sessions}`);
  console.log(`Network Profile : ${options.profile}`);
  console.log(`Seeded RNG Seed : ${options.seed}`);
  console.log(`Concurrency     : ${options.concurrency}\n`);

  const rng = new SeededRNG(options.seed);
  const startTime = Date.now();
  let succeeded = 0;
  let failed = 0;
  let totalEvents = 0;

  // Distribute sessions over the past 24 hours
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  const batches: BatchPayload[] = [];
  for (let i = 0; i < options.sessions; i++) {
    const timeOffset = rng.range(0, TWENTY_FOUR_HOURS_MS);
    const batch = generateSessionBatch(rng, options.profile, timeOffset);
    totalEvents += batch.events.length;
    batches.push(batch);
  }

  console.log(`Generated ${batches.length} synthetic session batches (${totalEvents} events total).`);
  console.log("Dispatching to server...\n");

  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < batches.length) {
      const idx = currentIndex++;
      const batch = batches[idx];

      try {
        const res = await fetch(`${options.endpoint}/v1/batches`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(batch),
        });

        if (res.status === 202) {
          succeeded++;
        } else {
          failed++;
          console.error(`Batch ${batch.batch_id} failed with HTTP ${res.status}`);
        }
      } catch (err) {
        failed++;
        console.error(`Network error posting batch: ${(err as Error).message}`);
      }

      if ((succeeded + failed) % 100 === 0 || succeeded + failed === options.sessions) {
        const pct = (((succeeded + failed) / options.sessions) * 100).toFixed(1);
        process.stdout.write(`\rProgress: [${succeeded + failed}/${options.sessions}] (${pct}%)`);
      }
    }
  }

  const workers = Array.from({ length: options.concurrency }, () => worker());
  await Promise.all(workers);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log("\n\n" + "=".repeat(60));
  console.log("Simulation Complete");
  console.log("=".repeat(60));
  console.log(`Successful Batches : ${succeeded}`);
  console.log(`Failed Batches     : ${failed}`);
  console.log(`Total Events Sent  : ${totalEvents}`);
  console.log(`Elapsed Time       : ${durationSec}s`);
  console.log(`Throughput         : ${((succeeded + failed) / parseFloat(durationSec)).toFixed(1)} batches/sec`);
  console.log("=".repeat(60));
}

runSimulator().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
