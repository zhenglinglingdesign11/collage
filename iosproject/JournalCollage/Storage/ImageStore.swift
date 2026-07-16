import Foundation
import UIKit

struct StoredImage: Equatable, Sendable {
    var source: String
    var size: CanvasSize
}

final class ImageStore {
    private let fileManager: FileManager
    private let rootURL: URL
    private let masksURL: URL

    init(
        rootURL: URL? = nil,
        fileManager: FileManager = .default
    ) throws {
        self.fileManager = fileManager
        if let rootURL {
            self.rootURL = rootURL
        } else {
            let appSupport = try fileManager.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            )
            self.rootURL = appSupport.appendingPathComponent("JournalCollage/Images", isDirectory: true)
        }
        self.masksURL = self.rootURL.appendingPathComponent("Masks", isDirectory: true)
        try fileManager.createDirectory(at: self.rootURL, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: self.masksURL, withIntermediateDirectories: true)
    }

    func saveImageData(_ data: Data) throws -> StoredImage {
        guard let image = UIImage(data: data) else {
            throw ImageStoreError.invalidImageData
        }
        let id = UUID().uuidString
        let fileName = "\(id).jpg"
        let url = rootURL.appendingPathComponent(fileName)
        let outputData = image.jpegData(compressionQuality: 0.88) ?? data
        try outputData.write(to: url, options: [.atomic])
        return StoredImage(
            source: "images/\(fileName)",
            size: CanvasSize(width: Double(image.size.width), height: Double(image.size.height))
        )
    }

    func savePNGImageData(_ data: Data) throws -> StoredImage {
        guard let image = UIImage(data: data) else {
            throw ImageStoreError.invalidImageData
        }
        let id = UUID().uuidString
        let fileName = "\(id).png"
        let url = rootURL.appendingPathComponent(fileName)
        let outputData = image.pngData() ?? data
        try outputData.write(to: url, options: [.atomic])
        return StoredImage(
            source: "images/\(fileName)",
            size: CanvasSize(width: Double(image.size.width), height: Double(image.size.height))
        )
    }

    func url(for source: String) -> URL? {
        let url: URL
        if source.hasPrefix("images/") {
            let fileName = String(source.dropFirst("images/".count))
            url = rootURL.appendingPathComponent(fileName)
        } else if source.hasPrefix("masks/") {
            let fileName = String(source.dropFirst("masks/".count))
            url = masksURL.appendingPathComponent(fileName)
        } else {
            return nil
        }
        return fileManager.fileExists(atPath: url.path) ? url : nil
    }

    func saveMaskImage(_ image: UIImage) throws -> String {
        guard let data = image.pngData() else {
            throw ImageStoreError.invalidImageData
        }
        let fileName = "\(UUID().uuidString).png"
        let url = masksURL.appendingPathComponent(fileName)
        try data.write(to: url, options: [.atomic])
        return "masks/\(fileName)"
    }
}

enum ImageStoreError: Error {
    case invalidImageData
}
