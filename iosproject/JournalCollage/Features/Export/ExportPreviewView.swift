import SwiftUI
import UIKit

struct ExportPreviewView: View {
    let draft: Draft
    var imageStore: ImageStore?

    @State private var exportedImage: ExportedImage?
    @State private var errorMessage: String?
    @State private var isRendering = true

    var body: some View {
        NavigationStack {
            VStack(spacing: JournalSpacing.lg) {
                previewArea

                VStack(alignment: .leading, spacing: JournalSpacing.sm) {
                    Text(L10n.t("export.preview.section"))
                        .font(JournalTypography.sectionTitle)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                        .foregroundStyle(JournalColors.ink)

                    Text(sizeText)
                        .font(JournalTypography.caption)
                        .foregroundStyle(JournalColors.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if let errorMessage {
                    Text(errorMessage)
                        .font(JournalTypography.caption)
                        .foregroundStyle(JournalColors.stampRed)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Spacer(minLength: 0)
            }
            .padding(JournalSpacing.lg)
            .background(JournalColors.page.ignoresSafeArea())
            .navigationTitle(L10n.t("export.preview.title"))
            .navigationBarTitleDisplayMode(.inline)
            .task {
                await renderPreview()
            }
        }
    }

    @ViewBuilder
    private var previewArea: some View {
        if isRendering {
            VStack(spacing: JournalSpacing.sm) {
                ProgressView()
                    .tint(JournalColors.ink)
                Text(L10n.t("export.preview.loading"))
                    .font(JournalTypography.caption)
                    .foregroundStyle(JournalColors.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 420)
            .background(JournalColors.panel)
            .clipShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                    .stroke(JournalColors.border)
            )
        } else if let image = exportedImage?.image {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(maxWidth: .infinity)
                .frame(maxHeight: 520)
                .padding(JournalSpacing.md)
                .background(JournalColors.panel)
                .clipShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                        .stroke(JournalColors.border)
                )
                .shadow(color: .black.opacity(0.08), radius: 18, x: 0, y: 8)
        } else {
            VStack(spacing: JournalSpacing.sm) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(JournalColors.stampRed)
                Text(L10n.t("export.preview.failed"))
                    .font(JournalTypography.bodyStrong)
                    .foregroundStyle(JournalColors.ink)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 420)
            .background(JournalColors.panel)
            .clipShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                    .stroke(JournalColors.border)
            )
        }
    }

    private var sizeText: String {
        let size = exportedImage?.pixelSize ?? ExportRenderer.recommendedPixelSize(for: draft)
        return "\(Int(size.width)) x \(Int(size.height)) px"
    }

    @MainActor
    private func renderPreview() async {
        isRendering = true
        errorMessage = nil
        do {
            exportedImage = try ExportRenderer.render(draft: draft, imageStore: imageStore)
        } catch {
            exportedImage = nil
            errorMessage = (error as? LocalizedError)?.errorDescription ?? L10n.t("export.error.render_failed")
        }
        isRendering = false
    }
}

#Preview {
    ExportPreviewView(draft: SampleDrafts.starter)
}
