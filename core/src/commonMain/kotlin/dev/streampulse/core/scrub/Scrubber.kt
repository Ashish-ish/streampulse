package dev.streampulse.core.scrub

object Scrubber {
    private val URL_REGEX = Regex("(?i)\\b(?:https?://|www\\.)\\S+")
    private val QUERY_REGEX = Regex("\\?[^\\s]*")
    private val SPACE_REGEX = Regex("\\s+")

    fun scrubMessage(message: String, limit: Int = 200): String {
        require(limit >= 0) { "limit must be >= 0" }
        var cleaned = URL_REGEX.replace(message, "[url]")
        cleaned = QUERY_REGEX.replace(cleaned, "")
        cleaned = SPACE_REGEX.replace(cleaned, " ").trim()
        return if (cleaned.length > limit) cleaned.substring(0, limit) else cleaned
    }
}
