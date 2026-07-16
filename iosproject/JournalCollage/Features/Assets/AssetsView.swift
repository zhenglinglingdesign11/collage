import SwiftUI

struct AssetsView: View {
    @State private var catalog = AssetPackCatalog(schemaVersion: 1, generatedFrom: "", packs: [])
    @State private var selectedCategory = "推荐"

    private var categories: [String] {
        ["推荐"] + Array(Set(catalog.packs.map(\.category))).sorted()
    }

    private var visiblePacks: [AssetPack] {
        selectedCategory == "推荐"
            ? catalog.packs
            : catalog.packs.filter { $0.category == selectedCategory }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: JournalSpacing.lg) {
                    Text("素材包")
                        .font(JournalTypography.pageTitle)
                        .foregroundStyle(JournalColors.ink)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: JournalSpacing.xs) {
                            ForEach(categories, id: \.self) { category in
                                Button(category) {
                                    selectedCategory = category
                                }
                                .font(JournalTypography.caption)
                                .foregroundStyle(selectedCategory == category ? Color.white : JournalColors.ink)
                                .padding(.horizontal, JournalSpacing.md)
                                .frame(height: 34)
                                .background(selectedCategory == category ? JournalColors.ink : JournalColors.weak)
                                .clipShape(Capsule())
                            }
                        }
                    }

                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: JournalSpacing.md) {
                        ForEach(visiblePacks) { pack in
                            NavigationLink {
                                AssetPackDetailView(pack: pack)
                            } label: {
                                AssetPackCard(pack: pack)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(JournalSpacing.lg)
            }
            .background(JournalColors.page.ignoresSafeArea())
            .task {
                catalog = (try? AssetPackRepository.loadBundledCatalog())
                    ?? AssetPackCatalog(schemaVersion: 1, generatedFrom: "load-failed", packs: [])
            }
        }
    }
}

private struct AssetPackCard: View {
    let pack: AssetPack

    var body: some View {
        VStack(alignment: .leading, spacing: JournalSpacing.sm) {
            RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                .fill(Color(hexString: pack.tone) ?? JournalColors.weak)
                .aspectRatio(1, contentMode: .fit)
                .overlay(
                    Text(String(pack.name.prefix(2)))
                        .font(.system(size: 32, weight: .semibold))
                        .foregroundStyle(JournalColors.ink.opacity(0.35))
                )

            Text(pack.name)
                .font(JournalTypography.caption)
                .foregroundStyle(JournalColors.textSecondary)
                .lineLimit(1)
        }
    }
}

extension Color {
    init?(hexString: String) {
        var value = hexString.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("#") {
            value.removeFirst()
        }
        guard let number = UInt(value, radix: 16) else { return nil }
        self.init(hex: number)
    }
}

#Preview {
    AssetsView()
}
