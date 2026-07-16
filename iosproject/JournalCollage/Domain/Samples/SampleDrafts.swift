import Foundation

enum SampleDrafts {
    static var starter: Draft {
        var draft = Draft(ratio: .portrait)
        draft.id = "sample-starter"
        draft.background = "#fdfdfb"
        draft.backgroundPattern = "line"
        draft.layers = [
            Layer(
                id: "sample-paper",
                type: .paper,
                x: 150,
                y: 180,
                width: 560,
                height: 620,
                rotation: 2,
                zIndex: 1,
                shadow: true,
                style: [
                    "color": .string("#efe7d8")
                ]
            ),
            Layer(
                id: "sample-photo",
                type: .image,
                x: 235,
                y: 260,
                width: 430,
                height: 560,
                rotation: -4,
                zIndex: 2,
                source: "sample/photo",
                shadow: true
            ),
            Layer(
                id: "sample-tape",
                type: .tape,
                x: 315,
                y: 220,
                width: 300,
                height: 72,
                rotation: -8,
                opacity: 0.92,
                zIndex: 3,
                style: [
                    "color": .string("#e9d28a")
                ]
            ),
            Layer(
                id: "sample-text",
                type: .text,
                x: 450,
                y: 835,
                width: 300,
                height: 100,
                rotation: -3,
                zIndex: 4,
                text: "weekend",
                style: [
                    "fontId": .string("system"),
                    "fontLabel": .string("系统"),
                    "fontSize": .number(54),
                    "color": .string("#111111")
                ]
            )
        ]
        return draft
    }
}
