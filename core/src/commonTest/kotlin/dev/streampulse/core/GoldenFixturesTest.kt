package dev.streampulse.core

import dev.streampulse.core.schema.StreamPulseBatch
import dev.streampulse.core.session.MetricFold
import dev.streampulse.core.session.QoeWeights
import kotlinx.serialization.json.*
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class GoldenFixturesTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun testAllGoldenFixturesMatchOracle() {
        // Find spec/fixtures relative to repo
        val candidates = listOf(
            File("../spec/fixtures"),
            File("spec/fixtures"),
            File("../../spec/fixtures")
        )
        val fixturesDir = candidates.firstOrNull { it.exists() && it.isDirectory }
        assertNotNull(fixturesDir, "Could not locate spec/fixtures directory")

        val files = fixturesDir.listFiles { _, name -> name.startsWith("golden-") && name.endsWith(".json") }
        assertNotNull(files, "No golden fixture files found")
        assertTrue(files.isNotEmpty(), "Fixtures directory must contain golden fixture files")

        for (file in files.sortedBy { it.name }) {
            val content = file.readText()
            val root = json.parseToJsonElement(content).jsonObject

            val batchElement = root["batch"] ?: error("Missing batch in ${file.name}")
            val expected = root["expected"]?.jsonObject ?: error("Missing expected in ${file.name}")

            val batch = json.decodeFromJsonElement<StreamPulseBatch>(batchElement)
            val rollup = MetricFold.compute(batch.events, QoeWeights())

            // Assert exact metric parity
            expected["startup_ms"]?.let {
                if (it is JsonNull) {
                    assertEquals(null, rollup.startupMs, "${file.name} startup_ms should be null")
                } else {
                    assertEquals(it.jsonPrimitive.long, rollup.startupMs, "${file.name} startup_ms mismatch")
                }
            }

            assertEquals(expected["vsf"]?.jsonPrimitive?.boolean, rollup.vsf, "${file.name} vsf mismatch")
            assertEquals(expected["ebvs"]?.jsonPrimitive?.boolean, rollup.ebvs, "${file.name} ebvs mismatch")
            assertEquals(expected["rebuffer_ms"]?.jsonPrimitive?.long, rollup.rebufferMs, "${file.name} rebuffer_ms mismatch")
            assertEquals(expected["rebuffer_count"]?.jsonPrimitive?.int, rollup.rebufferCount, "${file.name} rebuffer_count mismatch")
            assertEquals(expected["play_time_ms"]?.jsonPrimitive?.long, rollup.playTimeMs, "${file.name} play_time_ms mismatch")

            expected["rebuffer_ratio"]?.let {
                val exp = if (it is JsonNull) null else it.jsonPrimitive.content
                assertEquals(exp, rollup.rebufferRatio, "${file.name} rebuffer_ratio mismatch")
            }

            expected["qoe"]?.let {
                val exp = if (it is JsonNull) null else it.jsonPrimitive.content
                assertEquals(exp, rollup.qoe, "${file.name} qoe mismatch")
            }

            expected["crash_or_anr"]?.let {
                assertEquals(it.jsonPrimitive.boolean, rollup.crashOrAnr, "${file.name} crash_or_anr mismatch")
            }

            println("Verified fixture: ${file.name} [PASSED]")
        }
    }
}
