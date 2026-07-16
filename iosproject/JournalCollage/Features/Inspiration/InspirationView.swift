import SwiftUI

struct InspirationView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: JournalSpacing.sm) {
                    ForEach(sampleInspirations) { item in
                        RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                            .fill(JournalColors.weak)
                            .aspectRatio(1 / item.ratio, contentMode: .fit)
                            .overlay(
                                Image(systemName: "photo")
                                    .foregroundStyle(JournalColors.textTertiary)
                            )
                    }
                }
                .padding(JournalSpacing.lg)
            }
            .background(JournalColors.page.ignoresSafeArea())
            .navigationTitle("灵感")
        }
    }

    private var sampleInspirations: [Inspiration] {
        [
            Inspiration(id: "paper-1", imageUrl: "packs/papers/items/8.png", ratio: 0.98, tags: [], recommendedAssets: [], locale: "zh-Hans"),
            Inspiration(id: "tape-1", imageUrl: "packs/jiaodai/items/profile-2.png", ratio: 1, tags: [], recommendedAssets: [], locale: "zh-Hans"),
            Inspiration(id: "frame-1", imageUrl: "packs/xiangkuang/items/8.png", ratio: 1.25, tags: [], recommendedAssets: [], locale: "zh-Hans")
        ]
    }
}

#Preview {
    InspirationView()
}
