import SwiftUI

struct EditorView: View {
    let draft: Draft

    var body: some View {
        VStack(spacing: 0) {
            topBar

            Spacer(minLength: JournalSpacing.xl)

            CanvasPlaceholder(draft: draft)
                .padding(.horizontal, JournalSpacing.xl)

            Spacer(minLength: JournalSpacing.xl)

            EditorToolbar()
                .padding(.horizontal, JournalSpacing.md)
                .padding(.bottom, JournalSpacing.md)
        }
        .background(JournalColors.page.ignoresSafeArea())
        .navigationBarBackButtonHidden()
    }

    private var topBar: some View {
        HStack(spacing: JournalSpacing.sm) {
            JournalIconButton(systemName: "chevron.left") {
            }

            Text(draft.ratio.rawValue)
                .font(JournalTypography.bodyStrong)
                .foregroundStyle(JournalColors.ink)
                .padding(.horizontal, JournalSpacing.md)
                .frame(height: 36)
                .background(JournalColors.weak)
                .clipShape(Capsule())

            Spacer()

            JournalIconButton(systemName: "arrow.uturn.backward") {
            }
            JournalIconButton(systemName: "arrow.uturn.forward") {
            }

            Button("导出") {
            }
            .font(JournalTypography.bodyStrong)
            .foregroundStyle(Color.white)
            .frame(width: 64, height: 36)
            .background(JournalColors.ink)
            .clipShape(Capsule())
        }
        .padding(.horizontal, JournalSpacing.md)
        .padding(.top, JournalSpacing.sm)
    }
}

private struct CanvasPlaceholder: View {
    let draft: Draft

    var body: some View {
        GeometryReader { proxy in
            let width = min(proxy.size.width, proxy.size.height * draft.width / draft.height)
            let height = width * draft.height / draft.width

            RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                .fill(JournalColors.paper)
                .frame(width: width, height: height)
                .overlay(
                    RoundedRectangle(cornerRadius: JournalRadius.medium, style: .continuous)
                        .stroke(JournalColors.border)
                )
                .shadow(color: .black.opacity(0.08), radius: 18, x: 0, y: 8)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(maxHeight: 520)
    }
}

private struct EditorToolbar: View {
    private let tools: [(String, String)] = [
        ("photo", "图片"),
        ("square.grid.2x2", "素材"),
        ("rectangle.fill.on.rectangle.fill", "背景"),
        ("textformat", "文字"),
        ("scissors", "剪刀"),
        ("seal", "压花")
    ]

    var body: some View {
        HStack {
            ForEach(tools, id: \.1) { tool in
                VStack(spacing: JournalSpacing.xs) {
                    Image(systemName: tool.0)
                        .font(.system(size: 18, weight: .medium))
                    Text(tool.1)
                        .font(JournalTypography.tiny)
                }
                .foregroundStyle(JournalColors.ink)
                .frame(maxWidth: .infinity)
            }
        }
        .frame(height: 72)
        .background(JournalColors.panel)
        .clipShape(RoundedRectangle(cornerRadius: JournalRadius.panel, style: .continuous))
        .shadow(color: .black.opacity(0.10), radius: 24, x: 0, y: 8)
    }
}

#Preview {
    EditorView(draft: Draft())
}
