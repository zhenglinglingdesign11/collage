import SwiftUI
import UIKit

struct InspirationView: View {
    @State private var selectedInspiration: Inspiration?

    private let inspirations = InspirationRepository.loadBundledInspirations()
    private var columns: [[Inspiration]] {
        InspirationView.splitInspirationColumns(inspirations)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                HStack(alignment: .top, spacing: JournalSpacing.sm) {
                    ForEach(Array(columns.enumerated()), id: \.offset) { _, column in
                        LazyVStack(spacing: JournalSpacing.sm) {
                            ForEach(column) { item in
                                InspirationCard(item: item) {
                                    selectedInspiration = item
                                }
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                .padding(JournalSpacing.lg)
            }
            .background(JournalColors.page.ignoresSafeArea())
            .navigationTitle(L10n.t("inspiration.title"))
            .sheet(item: $selectedInspiration) { item in
                InspirationPreview(item: item)
            }
        }
    }

    static func splitInspirationColumns(_ items: [Inspiration]) -> [[Inspiration]] {
        var columns: [[Inspiration]] = [[], []]
        var heights: [Double] = [0, 0]

        for item in items {
            let targetColumn = heights[0] <= heights[1] ? 0 : 1
            columns[targetColumn].append(item)
            heights[targetColumn] += item.ratio
        }

        return columns
    }
}

private struct InspirationCard: View {
    let item: Inspiration
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                    .fill(JournalColors.weak)

                InspirationImage(item: item, contentMode: .fill)
                    .clipShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))
            }
            .aspectRatio(1 / max(0.1, item.ratio), contentMode: .fit)
            .overlay(
                RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                    .stroke(JournalColors.border)
            )
            .contentShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.alt)
    }
}

private struct InspirationImage: View {
    let item: Inspiration
    let contentMode: ContentMode

    var body: some View {
        Group {
            if let url = ImageSourceResolver.url(for: item.imageSource),
               let image = UIImage(contentsOfFile: url.path) {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else {
                Image(systemName: "photo")
                    .font(.system(size: 24, weight: .regular))
                    .foregroundStyle(JournalColors.textTertiary)
            }
        }
    }
}

private struct InspirationPreview: View {
    @Environment(\.dismiss) private var dismiss
    let item: Inspiration

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()

            InspirationImage(item: item, contentMode: .fit)
                .padding(JournalSpacing.lg)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityLabel(item.alt)

            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Color.black.opacity(0.45))
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.t("inspiration.close"))
            .padding(JournalSpacing.lg)
        }
    }
}

#Preview {
    InspirationView()
}
