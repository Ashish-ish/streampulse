#!/usr/bin/env python3
"""Validation suite for StreamPulse specification, event schema, and golden fixtures."""

from decimal import Decimal
import json
from pathlib import Path
import sys

SPEC_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SPEC_DIR))

from jsonschema import Draft202012Validator
from lib.compute import session_metrics, load_weights
from lib.sampling import session_included, sample_threshold
from lib.scrub import scrub_message
from lib.intervals import clip, subtract_all, measure

def run_checks() -> bool:
    all_ok = True
    print("=" * 60)
    print("StreamPulse Spec & Golden Fixture Validation")
    print("=" * 60)

    # 1. Load and validate schema
    schema_path = SPEC_DIR / "event-schema.v1.json"
    print(f"\n[1] Validating Schema: {schema_path.name}")
    with open(schema_path) as f:
        schema = json.load(f)
    try:
        Draft202012Validator.check_schema(schema)
        validator = Draft202012Validator(schema)
        print("    -> Schema is valid JSON Schema Draft 2020-12.")
    except Exception as e:
        print(f"    [FAIL] Schema invalid: {e}")
        return False

    # 2. Load weights
    weights_path = SPEC_DIR / "qoe-weights.v1.json"
    print(f"\n[2] Loading QoE Weights: {weights_path.name}")
    with open(weights_path) as f:
        raw_weights = json.load(f)
    weights = load_weights(raw_weights)
    print("    -> QoE weights loaded and verified (sum to 1.0).")

    # 3. Check fixtures
    fixtures_dir = SPEC_DIR / "fixtures"
    fixture_files = sorted(fixtures_dir.glob("golden-*.json"))
    print(f"\n[3] Validating {len(fixture_files)} Golden Fixtures:")

    for fixture_file in fixture_files:
        with open(fixture_file) as f:
            fixture = json.load(f)
        
        # Schema validation of the batch
        batch = fixture["batch"]
        errors = list(validator.iter_errors(batch))
        if errors:
            print(f"    [FAIL] {fixture_file.name}: Batch failed schema validation ({len(errors)} errors)")
            for err in errors[:3]:
                print(f"           - {err.message} at {list(err.path)}")
            all_ok = False
            continue
        
        # Oracle rollup calculation
        events = batch["events"]
        computed = session_metrics(events, weights)
        expected = fixture["expected"]

        diffs = []
        for k, v in expected.items():
            comp_v = computed.get(k)
            if comp_v != v:
                diffs.append(f"{k}: expected {v!r}, got {comp_v!r}")
        
        for k, comp_v in computed.items():
            if k not in expected:
                diffs.append(f"extra key in computed: {k}={comp_v!r}")

        if diffs:
            print(f"    [FAIL] {fixture_file.name}: Metric mismatch with oracle:")
            for d in diffs:
                print(f"           - {d}")
            all_ok = False
        else:
            print(f"    [PASS] {fixture_file.name} (schema valid & metrics match)")

    # 4. Unit checks for spec libraries
    print("\n[4] Running Unit Checks on Spec Libs:")
    
    # Intervals
    i1 = clip([(10, 20), (30, 40)], 15, 35)
    assert i1 == [(15, 20), (30, 35)], f"Clip failed: {i1}"
    sub = subtract_all((10, 30), [(15, 20), (25, 35)])
    assert sub == [(10, 15), (20, 25)], f"Subtract failed: {sub}"
    assert measure(sub) == 10, "Measure failed"
    print("    [PASS] intervals.py tests passed.")

    # Sampling
    assert not session_included("test", Decimal("0.0")), "Sampling 0% failed"
    assert session_included("test", Decimal("1.0")), "Sampling 100% failed"
    # Deterministic test
    res1 = session_included("session-fixed-1234", Decimal("0.5"))
    res2 = session_included("session-fixed-1234", Decimal("0.5"))
    assert res1 == res2, "Sampling determinism failed"
    print("    [PASS] sampling.py tests passed.")

    # Scrubbing
    scrubbed = scrub_message("Error at https://example.com/api?token=secret in module", limit=200)
    assert "[url]" in scrubbed and "token=secret" not in scrubbed, f"Scrub URL failed: {scrubbed}"
    long_msg = "A" * 300
    assert len(scrub_message(long_msg, limit=200)) == 200, "Scrub length limit failed"
    print("    [PASS] scrub.py tests passed.")

    print("\n" + "=" * 60)
    if all_ok:
        print("ALL SPEC CHECKS PASSED.")
    else:
        print("SOME CHECKS FAILED.")
    print("=" * 60)
    return all_ok

if __name__ == "__main__":
    success = run_checks()
    sys.exit(0 if success else 1)
