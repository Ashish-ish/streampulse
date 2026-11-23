import Foundation

public final class Transport: @unchecked Sendable {
    private let endpoint: URL
    private let session: URLSession
    private let lock = NSLock()
    private var clockSkewMs: Int64 = 0

    public init(endpoint: URL, session: URLSession = .shared) {
        self.endpoint = endpoint
        self.session = session
    }

    public var serverClockSkewMs: Int64 {
        lock.lock()
        defer { lock.unlock() }
        return clockSkewMs
    }

    public func sendBatch(_ batch: StreamPulseBatch, completion: @escaping (Result<Void, Error>) -> Void) {
        guard let url = URL(string: "/v1/batches", relativeTo: endpoint) else {
            completion(.failure(URLError(.badURL)))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        do {
            let data = try JSONEncoder().encode(batch)
            request.httpBody = data
        } catch {
            completion(.failure(error))
            return
        }

        let task = session.dataTask(with: request) { [weak self] _, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }

            if let http = response as? HTTPURLResponse {
                // Update server clock skew if Date header is present
                if let dateStr = http.value(forHTTPHeaderField: "Date") {
                    let rfc1123 = DateFormatter()
                    rfc1123.locale = Locale(identifier: "en_US_POSIX")
                    rfc1123.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
                    if let serverDate = rfc1123.date(from: dateStr) {
                        let skew = Int64(serverDate.timeIntervalSince1970 * 1000) - Int64(Date().timeIntervalSince1970 * 1000)
                        self?.lock.lock()
                        self?.clockSkewMs = skew
                        self?.lock.unlock()
                    }
                }

                if (200...299).contains(http.statusCode) {
                    completion(.success(()))
                } else {
                    completion(.failure(URLError(.badServerResponse)))
                }
            } else {
                completion(.failure(URLError(.cannotParseResponse)))
            }
        }
        task.resume()
    }
}
