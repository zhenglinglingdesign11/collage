import Foundation
import Photos
import PhotosUI
import UniformTypeIdentifiers

struct ImportedLivePhoto: Equatable, Sendable {
    var stillSource: String
    var videoSource: String?
    var size: CanvasSize
    var assetIdentifier: String?
    var warnings: [String]
}

enum LivePhotoImportError: LocalizedError {
    case notLivePhoto
    case missingStillImage

    var errorDescription: String? {
        switch self {
        case .notLivePhoto:
            return L10n.t("live_photo.error.not_live")
        case .missingStillImage:
            return L10n.t("live_photo.error.missing_still")
        }
    }
}

enum LivePhotoImporter {
    static func isLivePhoto(_ item: PhotosPickerItem) -> Bool {
        item.supportedContentTypes.contains { type in
            type == .livePhoto || type.conforms(to: .livePhoto)
        }
    }

    @MainActor
    static func importLivePhoto(
        from item: PhotosPickerItem,
        imageStore: ImageStore
    ) async throws -> ImportedLivePhoto {
        guard isLivePhoto(item) else {
            throw LivePhotoImportError.notLivePhoto
        }

        var warnings: [String] = []
        let assetIdentifier = item.itemIdentifier
        let asset = assetIdentifier.flatMap(fetchAsset(with:))

        let stillData = try await stillImageData(from: item, asset: asset)
        let storedStill = try imageStore.saveImageData(stillData)

        var videoSource: String?
        if let asset,
           let videoData = try? await pairedVideoData(from: asset) {
            videoSource = try? imageStore.saveLiveVideoData(videoData, fileExtension: "mov")
            if videoSource == nil {
                warnings.append("live_video_save_failed")
            }
        } else {
            warnings.append("live_video_unavailable")
        }

        return ImportedLivePhoto(
            stillSource: storedStill.source,
            videoSource: videoSource,
            size: storedStill.size,
            assetIdentifier: assetIdentifier,
            warnings: warnings
        )
    }

    private static func stillImageData(
        from item: PhotosPickerItem,
        asset: PHAsset?
    ) async throws -> Data {
        if let data = try? await item.loadTransferable(type: Data.self) {
            return data
        }
        if let asset,
           let data = try? await resourceData(from: asset, type: .photo) {
            return data
        }
        throw LivePhotoImportError.missingStillImage
    }

    private static func pairedVideoData(from asset: PHAsset) async throws -> Data {
        try await resourceData(from: asset, type: .pairedVideo)
    }

    private static func fetchAsset(with localIdentifier: String) -> PHAsset? {
        PHAsset.fetchAssets(withLocalIdentifiers: [localIdentifier], options: nil).firstObject
    }

    private static func resourceData(from asset: PHAsset, type: PHAssetResourceType) async throws -> Data {
        guard let resource = PHAssetResource.assetResources(for: asset).first(where: { $0.type == type }) else {
            throw LivePhotoImportError.notLivePhoto
        }

        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("JournalCollage-\(UUID().uuidString)-\(resource.originalFilename)")
        defer {
            try? FileManager.default.removeItem(at: tempURL)
        }

        try await withCheckedThrowingContinuation { continuation in
            PHAssetResourceManager.default().writeData(for: resource, toFile: tempURL, options: nil) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
        return try Data(contentsOf: tempURL)
    }
}
