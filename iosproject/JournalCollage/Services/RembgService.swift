import Foundation

struct RembgConfiguration: Equatable, Sendable {
    var endpoint: String
    var fileFieldName: String
    var formData: [String: String]
    var headers: [String: String]

    static var bundled: RembgConfiguration {
        let info = Bundle.main.infoDictionary ?? [:]
        return RembgConfiguration(
            endpoint: (info["REMBG_ENDPOINT"] as? String) ?? "",
            fileFieldName: (info["REMBG_FILE_FIELD_NAME"] as? String) ?? "file",
            formData: [:],
            headers: [:]
        )
    }
}

enum RembgServiceError: LocalizedError, Equatable {
    case missingEndpoint
    case missingImageFile
    case invalidEndpoint
    case httpError(Int)
    case unsupportedResponse
    case missingResult
    case downloadFailed

    var errorDescription: String? {
        switch self {
        case .missingEndpoint:
            return L10n.t("rembg.error.missing_endpoint")
        case .missingImageFile:
            return L10n.t("rembg.error.missing_image")
        case .invalidEndpoint:
            return L10n.t("rembg.error.invalid_endpoint")
        case .httpError:
            return L10n.t("rembg.error.http")
        case .unsupportedResponse:
            return L10n.t("rembg.error.unsupported")
        case .missingResult:
            return L10n.t("rembg.error.missing_result")
        case .downloadFailed:
            return L10n.t("rembg.error.download_failed")
        }
    }
}

struct RembgService {
    var configuration: RembgConfiguration
    var session: URLSession = .shared

    init(configuration: RembgConfiguration = .bundled) {
        self.configuration = configuration
    }

    func removeImageBackground(fileURL: URL) async throws -> Data {
        guard !configuration.endpoint.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw RembgServiceError.missingEndpoint
        }
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            throw RembgServiceError.missingImageFile
        }
        guard let endpointURL = URL(string: configuration.endpoint) else {
            throw RembgServiceError.invalidEndpoint
        }

        let imageData = try Data(contentsOf: fileURL)
        let boundary = "JournalCollageBoundary-\(UUID().uuidString)"
        var request = URLRequest(url: endpointURL)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        configuration.headers.forEach { key, value in
            request.setValue(value, forHTTPHeaderField: key)
        }

        let body = multipartBody(
            imageData: imageData,
            fileName: fileURL.lastPathComponent,
            boundary: boundary
        )
        let (data, response) = try await session.upload(for: request, from: body)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw RembgServiceError.unsupportedResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw RembgServiceError.httpError(httpResponse.statusCode)
        }
        return try await parseResponse(data)
    }

    private func multipartBody(imageData: Data, fileName: String, boundary: String) -> Data {
        var body = Data()
        for (key, value) in configuration.formData {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n")
            body.appendString("\(value)\r\n")
        }
        body.appendString("--\(boundary)\r\n")
        body.appendString("Content-Disposition: form-data; name=\"\(configuration.fileFieldName)\"; filename=\"\(fileName)\"\r\n")
        body.appendString("Content-Type: application/octet-stream\r\n\r\n")
        body.append(imageData)
        body.appendString("\r\n--\(boundary)--\r\n")
        return body
    }

    private func parseResponse(_ data: Data) async throws -> Data {
        if let raw = String(data: data, encoding: .utf8) {
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let payload = (json["data"] as? [String: Any]) ?? json
                if let imageURLString = firstString(in: payload, keys: ["url", "imageUrl", "outputUrl", "resultUrl", "downloadUrl"]) {
                    return try await downloadImage(imageURLString)
                }
                if let base64 = firstString(in: payload, keys: ["base64", "imageBase64", "resultBase64", "data"]) {
                    return try decodeBase64Image(base64)
                }
                throw RembgServiceError.missingResult
            }
            if looksLikeBase64Image(raw) {
                return try decodeBase64Image(raw)
            }
        }
        throw RembgServiceError.unsupportedResponse
    }

    private func firstString(in payload: [String: Any], keys: [String]) -> String? {
        for key in keys {
            if let value = payload[key] as? String,
               !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return value.trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
        return nil
    }

    private func looksLikeBase64Image(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.range(of: #"^data:image/\w+;base64,"#, options: .regularExpression) != nil {
            return true
        }
        return trimmed.count > 200
            && trimmed.range(of: #"^[A-Za-z0-9+/=\r\n]+$"#, options: .regularExpression) != nil
    }

    private func decodeBase64Image(_ value: String) throws -> Data {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let payload: String
        if let range = trimmed.range(of: #"^data:image/\w+;base64,"#, options: .regularExpression) {
            payload = String(trimmed[range.upperBound...])
        } else {
            payload = trimmed
        }
        guard let data = Data(base64Encoded: payload, options: [.ignoreUnknownCharacters]) else {
            throw RembgServiceError.unsupportedResponse
        }
        return data
    }

    private func downloadImage(_ urlString: String) async throws -> Data {
        guard let url = URL(string: urlString) else {
            throw RembgServiceError.missingResult
        }
        let (data, response) = try await session.data(from: url)
        guard let httpResponse = response as? HTTPURLResponse,
              (200..<300).contains(httpResponse.statusCode) else {
            throw RembgServiceError.downloadFailed
        }
        return data
    }
}

private extension Data {
    mutating func appendString(_ value: String) {
        append(Data(value.utf8))
    }
}
