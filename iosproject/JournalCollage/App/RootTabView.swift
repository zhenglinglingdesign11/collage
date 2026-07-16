import SwiftUI

struct RootTabView: View {
    var body: some View {
        TabView {
            CreateHomeView()
                .tabItem {
                    Label("创作", systemImage: "plus.square.on.square")
                }

            AssetsView()
                .tabItem {
                    Label("素材", systemImage: "square.grid.2x2")
                }

            InspirationView()
                .tabItem {
                    Label("灵感", systemImage: "sparkles")
                }

            MineView()
                .tabItem {
                    Label("我的", systemImage: "person.crop.circle")
                }
        }
        .tint(JournalColors.ink)
    }
}

#Preview {
    RootTabView()
}
