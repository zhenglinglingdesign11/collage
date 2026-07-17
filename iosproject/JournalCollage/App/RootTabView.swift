import SwiftUI

struct RootTabView: View {
    var body: some View {
        TabView {
            CreateHomeView()
                .tabItem {
                    Label(L10n.t("tab.create"), systemImage: "plus.square.on.square")
                }

            AssetsView()
                .tabItem {
                    Label(L10n.t("tab.assets"), systemImage: "square.grid.2x2")
                }

            InspirationView()
                .tabItem {
                    Label(L10n.t("tab.inspiration"), systemImage: "sparkles")
                }

            MineView()
                .tabItem {
                    Label(L10n.t("tab.mine"), systemImage: "person.crop.circle")
                }
        }
        .tint(JournalColors.ink)
    }
}

#Preview {
    RootTabView()
}
