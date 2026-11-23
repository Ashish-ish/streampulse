import Foundation

public enum Scrubber {
    private static let urlPattern = try! NSRegularExpression(
        pattern: #"\b(?:https?://|www\.)\S+"#,
        options: [.caseInsensitive]
    )
    private static let queryPattern = try! NSRegularExpression(
        pattern: #"\?[^\s]*"#,
        options: []
    )
    private static let spacePattern = try! NSRegularExpression(
        pattern: #"\s+"#,
        options: []
    )

    public static func scrub(message: String, limit: Int = 200) -> String {
        precondition(limit >= 0, "limit must be >= 0")
        var s = message
        let urlRange = NSRange(location: 0, length: s.utf16.count)
        s = urlPattern.stringByReplacingMatches(in: s, options: [], range: urlRange, withTemplate: "[url]")

        let qRange = NSRange(location: 0, length: s.utf16.count)
        s = queryPattern.stringByReplacingMatches(in: s, options: [], range: qRange, withTemplate: "")

        let spRange = NSRange(location: 0, length: s.utf16.count)
        s = spacePattern.stringByReplacingMatches(in: s, options: [], range: spRange, withTemplate: " ")

        s = s.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.count > limit {
            return String(s.prefix(limit))
        }
        return s
    }
}
