import Foundation

enum SampleDrafts {
    static var starter: Draft {
        let paperStyle: [String: JSONValue] = [
            "color": .string("#efe7d8")
        ]
        let tapeStyle: [String: JSONValue] = [
            "color": .string("#e9d28a")
        ]
        let textStyle: [String: JSONValue] = [
            "fontId": .string("system"),
            "fontLabel": .string("System"),
            "fontSize": .number(54),
            "color": .string("#111111")
        ]

        var draft = Draft(ratio: .portrait)
        draft.id = "sample-starter"
        draft.background = "#fdfdfb"
        draft.backgroundPattern = "line"
        draft.layers = [
            Layer(
                id: "sample-paper",
                type: LayerType.paper,
                x: 150,
                y: 180,
                width: 560,
                height: 620,
                rotation: 2,
                zIndex: 1,
                shadow: true,
                style: paperStyle
            ),
            Layer(
                id: "sample-photo",
                type: LayerType.image,
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
                type: LayerType.tape,
                x: 315,
                y: 220,
                width: 300,
                height: 72,
                rotation: -8,
                opacity: 0.92,
                zIndex: 3,
                style: tapeStyle
            ),
            Layer(
                id: "sample-text",
                type: LayerType.text,
                x: 450,
                y: 835,
                width: 300,
                height: 100,
                rotation: -3,
                zIndex: 4,
                text: "weekend",
                style: textStyle
            )
        ]
        return draft
    }
}
