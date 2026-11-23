# StreamPulse Privacy Architecture & Data Protection

StreamPulse is architected under the principle of **Privacy by Design**. Telemetry is strictly limited to playback performance and device diagnostics necessary for QoE optimization.

---

## 1. Zero Personally Identifiable Information (PII)

StreamPulse does not collect, transmit, or store:
- User names, email addresses, IP addresses, or phone numbers.
- Device hardware identifiers (e.g., IMEI, MAC address, serial numbers).
- Advertising identifiers (e.g., Google Advertising ID / GAID, Apple IDFA).
- Geographic coordinates or fine-grained location data.

Client IP addresses are dropped immediately at the reverse proxy or Fastify request handler and are never written to disk or the database.

---

## 2. Pseudonymous Identifiers

### `install_id`
- Generated as a cryptographically secure random UUIDv4 upon initial SDK installation.
- Stored exclusively in sandboxed application private storage (`EncryptedSharedPreferences` / Keychain / `localStorage`).
- Deleted and regenerated upon application uninstall/reinstall.
- Cannot be linked across different applications or publishers.

### `session_id` & `play_id`
- Ephemeral UUIDv4 values generated per playback session.
- Discarded after session termination and not linked to persistent user profiles.

---

## 3. Content Identification & Hashing

- Applications may transmit `content_id` for video asset attribution.
- SDKs provide an automatic SHA-256 pseudonymization option (`content_id_hashed: true`), ensuring content identifiers are irreversible outside the customer's catalog registry.

---

## 4. Error Message Sanitization (Scrubbing)

Playback failure error messages may inadvertently contain sensitive URLs, session tokens, or internal infrastructure hostnames.

Prior to enqueueing any `playback_error` event, the SDK applies mandatory regex sanitization (`spec/lib/scrub.py`):
1. All HTTP/HTTPS URLs and `www.` addresses are replaced with `[url]`.
2. URL query parameters (which frequently contain auth tokens or signatures) are stripped completely.
3. Multiple consecutive whitespace characters are collapsed.
4. The sanitized string is hard-truncated to a maximum of 200 characters.

```python
cleaned = re.sub(r"(?i)\b(?:https?://|www\.)\S+", "[url]", message)
cleaned = re.sub(r"\?[^\s]*", "", cleaned)
return cleaned[:200]
```

---

## 5. User Opt-Out

StreamPulse exposes a direct opt-out API across all SDK platforms:
```typescript
StreamPulse.setEnabled(false);
```

When disabled:
- The persistent queue is immediately cleared.
- All event collectors and player listeners detach.
- No network requests are dispatched.
- The disabled preference is persisted to prevent activation across app cold restarts.
