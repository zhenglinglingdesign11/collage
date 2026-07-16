import SwiftUI
import UIKit

struct AssetsView: View {
    @State private var catalog = AssetPackCatalog(schemaVersion: 1, generatedFrom: "", packs: [])
    @State private var selectedCategory = "推荐"
    @State private var favoritePackIds: Set<String> = []

    private let favoriteStore = AssetFavoriteStore()

    private var categories: [String] {
        ["推荐", "收藏"] + Array(Set(catalog.packs.map(\.category))).sorted()
    }

    private var visiblePacks: [AssetPack] {
        if selectedCategory == "收藏" {
            return catalog.packs.filter { favoritePackIds.contains($0.id) }
        }
        if selectedCategory == "推荐" {
            return catalog.packs
        }
        return catalog.packs.filter { $0.category == selectedCategory }
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
                                AssetPackDetailView(pack: pack) {
                                    refreshFavorites()
                                }
                            } label: {
                                AssetPackCard(
                                    pack: pack,
                                    isFavorite: favoritePackIds.contains(pack.id)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    if visiblePacks.isEmpty {
                        Text("还没有收藏的素材包")
                            .font(JournalTypography.caption)
                            .foregroundStyle(JournalColors.textSecondary)
                            .frame(maxWidth: .infinity)
                            .padding(.top, JournalSpacing.xl)
                    }
                }
                .padding(JournalSpacing.lg)
            }
            .background(JournalColors.page.ignoresSafeArea())
            .onAppear {
                refreshFavorites()
            }
            .task {
                catalog = (try? AssetPackRepository.loadBundledCatalog())
                    ?? AssetPackCatalog(schemaVersion: 1, generatedFrom: "load-failed", packs: [])
            }
        }
    }

    private func refreshFavorites() {
        favoritePackIds = favoriteStore.favoritePackIds()
    }
}

private struct AssetPackCard: View {
    let pack: AssetPack
    let isFavorite: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: JournalSpacing.sm) {
            ZStack(alignment: .topTrailing) {
                RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                    .fill(Color(hexString: pack.tone) ?? JournalColors.weak)
                    .aspectRatio(0.93, contentMode: .fit)
                    .overlay(packCover)
                    .clipShape(RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous))
                    .shadow(color: .black.opacity(0.08), radius: 12, x: 0, y: 6)

                if isFavorite {
                    Image(systemName: "star.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(JournalColors.ink)
                        .padding(10)
                        .accessibilityLabel("已收藏")
                }
            }

            Text(pack.name)
                .font(JournalTypography.caption)
                .foregroundStyle(JournalColors.textSecondary)
                .lineLimit(1)
        }
    }

    @ViewBuilder
    private var packCover: some View {
        if let url = ImageSourceResolver.url(for: pack.cover),
           let image = UIImage(contentsOfFile: url.path) {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .padding(JournalSpacing.xs)
        } else {
            Text(String(pack.name.prefix(2)))
                .font(.system(size: 32, weight: .semibold))
                .foregroundStyle(JournalColors.ink.opacity(0.35))
        }
    }
}

#Preview {
    AssetsView()
}
