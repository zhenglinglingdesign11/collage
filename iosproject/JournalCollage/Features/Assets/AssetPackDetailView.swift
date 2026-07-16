import SwiftUI

struct AssetPackDetailView: View {
    let pack: AssetPack

    var body: some View {
        ScrollView {
            ZStack {
                RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                    .fill(JournalColors.paper)
                    .shadow(color: .black.opacity(0.08), radius: 18, x: 0, y: 8)

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: JournalSpacing.md)], spacing: JournalSpacing.lg) {
                    ForEach(pack.items) { item in
                        RoundedRectangle(cornerRadius: JournalRadius.small, style: .continuous)
                            .fill(JournalColors.weak)
                            .aspectRatio(Double(item.width) / Double(item.height), contentMode: .fit)
                            .overlay(
                                Text(item.name)
                                    .font(JournalTypography.tiny)
                                    .foregroundStyle(JournalColors.textSecondary)
                                    .multilineTextAlignment(.center)
                                    .padding(JournalSpacing.xs)
                            )
                    }
                }
                .padding(JournalSpacing.lg)
            }
            .padding(JournalSpacing.lg)
        }
        .background(JournalColors.page.ignoresSafeArea())
        .navigationTitle(pack.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    AssetPackDetailView(
        pack: AssetPack(
            id: "papers",
            name: "复古纸张",
            category: "纸张",
            tone: "#f3f1ec",
            cover: "packs/papers/pack-sheet.jpg",
            version: 1,
            items: []
        )
    )
}
