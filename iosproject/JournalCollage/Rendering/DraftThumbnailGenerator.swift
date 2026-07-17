import UIKit

@MainActor
enum DraftThumbnailGenerator {
    static func draftWithUpdatedThumbnail(_ draft: Draft, imageStore: ImageStore?) -> Draft {
        guard let imageStore else { return draft }

        do {
            let size = thumbnailSize(for: draft)
            let exported = try ExportRenderer.render(draft: draft, imageStore: imageStore, pixelSize: size)
            let path = try imageStore.saveThumbnail(exported.image, draftId: draft.id)
            var next = draft
            next.thumbnailPath = path
            return next
        } catch {
            return draft
        }
    }

    private static func thumbnailSize(for draft: Draft) -> CGSize {
        switch draft.ratio {
        case .portrait:
            return CGSize(width: 240, height: 320)
        case .square:
            return CGSize(width: 280, height: 280)
        case .story:
            return CGSize(width: 216, height: 384)
        }
    }
}
