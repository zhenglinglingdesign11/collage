import CoreGraphics
import Foundation
import UIKit

enum ImageEffectGeneratorError: LocalizedError {
    case missingImage
    case renderFailed

    var errorDescription: String? {
        switch self {
        case .missingImage:
            return L10n.t("editor.status.image_effect_select_image")
        case .renderFailed:
            return L10n.t("editor.status.image_effect_failed")
        }
    }
}

enum ImageEffectGenerator {
    static func render(layer: Layer, imageStore: ImageStore?) throws -> (image: UIImage, size: CanvasSize) {
        guard let source = layer.source,
              let url = ImageSourceResolver.url(for: source, imageStore: imageStore),
              let sourceImage = UIImage(contentsOfFile: url.path) else {
            throw ImageEffectGeneratorError.missingImage
        }

        let effect = layer.effect ?? LayerImageEffect(type: .crossStitch)
        switch effect.type {
        case .crossStitch:
            return try renderCrossStitch(sourceImage: sourceImage, layer: layer, effect: effect)
        case .matisse:
            return try renderMatisse(sourceImage: sourceImage, layer: layer, effect: effect)
        case .botanical:
            return try renderBotanical(sourceImage: sourceImage, layer: layer, effect: effect)
        }
    }

    private static func renderCrossStitch(
        sourceImage: UIImage,
        layer: Layer,
        effect: LayerImageEffect
    ) throws -> (UIImage, CanvasSize) {
        let crop = normalizedCrop(layer: layer, image: sourceImage)
        let aspect = Double(crop.width / max(1, crop.height))
        let longGrid = max(24, min(140, Int(optionNumber(effect, "grid", fallback: 72))))
        let cols = aspect >= 1 ? longGrid : max(1, Int(round(Double(longGrid) * aspect)))
        let rows = aspect >= 1 ? max(1, Int(round(Double(longGrid) / aspect))) : longGrid
        let sampled = try rasterize(sourceImage, crop: crop, size: CGSize(width: CGFloat(cols), height: CGFloat(rows)))
        let palette = createQuantizedPalette(sampled.pixels, maxColors: Int(optionNumber(effect, "colors", fallback: 8)))
        let mapped = sampled.pixels.map { nearestColor($0, palette: palette) }
        let cellSize = max(8, min(14, 1800 / max(cols, rows)))
        let outputSize = CGSize(width: CGFloat(cols * cellSize), height: CGFloat(rows * cellSize))
        let style = optionString(effect, "style", fallback: "stitch")

        let image = UIGraphicsImageRenderer(size: outputSize).image { context in
            let cg = context.cgContext
            UIColor(red: 248 / 255, green: 242 / 255, blue: 231 / 255, alpha: 1).setFill()
            cg.fill(CGRect(origin: .zero, size: outputSize))
            drawCrossStitchFabric(context: cg, size: outputSize, cellSize: CGFloat(cellSize))

            for row in 0..<rows {
                for col in 0..<cols {
                    let color = mapped[row * cols + col]
                    let rect = CGRect(
                        x: CGFloat(col * cellSize),
                        y: CGFloat(row * cellSize),
                        width: CGFloat(cellSize),
                        height: CGFloat(cellSize)
                    )
                    if style == "pixel" || style == "mixed" {
                        drawCrossStitchPixel(context: cg, rect: rect, color: color)
                    }
                    if style != "pixel" {
                        drawCrossStitchNeedle(context: cg, rect: rect, color: color)
                    }
                }
            }
            drawCrossStitchGrid(context: cg, size: outputSize, cellSize: CGFloat(cellSize))
        }

        return (image, CanvasSize(width: Double(outputSize.width), height: Double(outputSize.height)))
    }

    private static func renderMatisse(
        sourceImage: UIImage,
        layer: Layer,
        effect: LayerImageEffect
    ) throws -> (UIImage, CanvasSize) {
        let crop = normalizedCrop(layer: layer, image: sourceImage)
        let detail = optionNumber(effect, "detail", fallback: 0.64)
        let maxOutputSize: CGFloat = detail >= 86 ? 1500 : detail <= 44 ? 980 : 1240
        let scale = maxOutputSize / max(crop.width, crop.height)
        let outputSize = CGSize(width: max(1, round(crop.width * scale)), height: max(1, round(crop.height * scale)))
        let sampled = try rasterize(sourceImage, crop: crop, size: outputSize)
        let paletteName = optionString(effect, "palette", fallback: "vivid")
        let palette = matissePalette(paletteName)
        let background = matisseBackground(paletteName)
        var pixels: [RGBAColor] = []
        var indexes: [Int] = []
        pixels.reserveCapacity(sampled.pixels.count)
        indexes.reserveCapacity(sampled.pixels.count)

        for color in sampled.pixels {
            let composited = color.composited(over: background)
            let match = nearestPaletteEntry(composited, palette: palette)
            pixels.append(match.color)
            indexes.append(match.index)
        }

        soften(&pixels, width: sampled.width, height: sampled.height)
        drawMatisseEdges(pixels: &pixels, indexes: indexes, width: sampled.width, height: sampled.height, paletteName: paletteName)
        guard let baseImage = makeImage(pixels: pixels, width: sampled.width, height: sampled.height) else {
            throw ImageEffectGeneratorError.renderFailed
        }

        let image = UIGraphicsImageRenderer(size: outputSize).image { context in
            baseImage.draw(in: CGRect(origin: .zero, size: outputSize))
            drawCutoutPaperTexture(context: context.cgContext, width: outputSize.width, height: outputSize.height, alpha: 0.08)
        }
        return (image, CanvasSize(width: Double(outputSize.width), height: Double(outputSize.height)))
    }

    private static func renderBotanical(
        sourceImage: UIImage,
        layer: Layer,
        effect: LayerImageEffect
    ) throws -> (UIImage, CanvasSize) {
        let crop = normalizedCrop(layer: layer, image: sourceImage)
        let detail = optionString(effect, "detail", fallback: "medium")
        let maxOutputSize: CGFloat = detail == "etched" ? 1500 : detail == "soft" ? 1050 : 1240
        let scale = maxOutputSize / max(crop.width, crop.height)
        let outputSize = CGSize(width: max(1, round(crop.width * scale)), height: max(1, round(crop.height * scale)))
        let sampled = try rasterize(sourceImage, crop: crop, size: outputSize)
        let toneName = optionString(effect, "tone", fallback: "blueprint")
        let tone = botanicalTone(toneName)
        let threshold = detail == "etched" ? 14.0 : detail == "soft" ? 28.0 : 20.0
        let lineBoost = detail == "etched" ? 1.55 : detail == "soft" ? 1.05 : 1.3
        var pixels = sampled.pixels

        for y in 0..<sampled.height {
            for x in 0..<sampled.width {
                let index = y * sampled.width + x
                let gray = sourceGray(sampled.pixels, width: sampled.width, height: sampled.height, x: x, y: y)
                let rightGray = sourceGray(sampled.pixels, width: sampled.width, height: sampled.height, x: min(sampled.width - 1, x + 1), y: y)
                let bottomGray = sourceGray(sampled.pixels, width: sampled.width, height: sampled.height, x: x, y: min(sampled.height - 1, y + 1))
                let edge = abs(gray - rightGray) + abs(gray - bottomGray)
                let tonalInk = max(0, (178 - gray) / 255) * 0.16
                let edgeInk = edge > threshold ? min(1, (edge - threshold) / 68 * lineBoost) : 0
                let hatchInk = botanicalHatchInk(x: x, y: y, gray: gray, detail: detail)
                let ink = max(edgeInk, tonalInk, hatchInk)
                let grain = seededNoise(seed: Double(y * 4099 + x * 17), salt: 11) * 3.5
                let paper = RGBAColor(
                    r: clamp(tone.paper.r + grain),
                    g: clamp(tone.paper.g + grain),
                    b: clamp(tone.paper.b + grain),
                    a: 255
                )
                pixels[index] = paper.mixed(with: tone.ink, amount: ink)
            }
        }

        guard let baseImage = makeImage(pixels: pixels, width: sampled.width, height: sampled.height) else {
            throw ImageEffectGeneratorError.renderFailed
        }

        let image = UIGraphicsImageRenderer(size: outputSize).image { context in
            baseImage.draw(in: CGRect(origin: .zero, size: outputSize))
            drawBotanicalPlateOverlay(context: context.cgContext, width: outputSize.width, height: outputSize.height, tone: tone)
        }
        return (image, CanvasSize(width: Double(outputSize.width), height: Double(outputSize.height)))
    }

    private static func normalizedCrop(layer: Layer, image: UIImage) -> CGRect {
        let sourceWidth = CGFloat(layer.sourceWidth ?? Double(image.size.width))
        let sourceHeight = CGFloat(layer.sourceHeight ?? Double(image.size.height))
        guard let crop = layer.crop, crop.width > 0, crop.height > 0 else {
            return CGRect(x: 0, y: 0, width: sourceWidth, height: sourceHeight)
        }
        let cropX = CGFloat(crop.x)
        let cropY = CGFloat(crop.y)
        let cropWidth = CGFloat(crop.width)
        let cropHeight = CGFloat(crop.height)
        let x = max(0, min(sourceWidth - 1, cropX))
        let y = max(0, min(sourceHeight - 1, cropY))
        return CGRect(
            x: x,
            y: y,
            width: max(1, min(sourceWidth - x, cropWidth)),
            height: max(1, min(sourceHeight - y, cropHeight))
        )
    }

    private static func rasterize(_ image: UIImage, crop: CGRect, size: CGSize) throws -> PixelBuffer {
        let width = max(1, Int(size.width.rounded()))
        let height = max(1, Int(size.height.rounded()))
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        guard let context = CGContext(
            data: &bytes,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            throw ImageEffectGeneratorError.renderFailed
        }
        context.interpolationQuality = .high
        context.translateBy(x: 0, y: CGFloat(height))
        context.scaleBy(x: 1, y: -1)
        let scaleX = CGFloat(width) / crop.width
        let scaleY = CGFloat(height) / crop.height
        let drawRect = CGRect(
            x: -crop.minX * scaleX,
            y: -crop.minY * scaleY,
            width: image.size.width * scaleX,
            height: image.size.height * scaleY
        )
        UIGraphicsPushContext(context)
        image.draw(in: drawRect)
        UIGraphicsPopContext()

        let pixels = stride(from: 0, to: bytes.count, by: 4).map { offset in
            RGBAColor(
                r: Double(bytes[offset]),
                g: Double(bytes[offset + 1]),
                b: Double(bytes[offset + 2]),
                a: Double(bytes[offset + 3])
            )
        }
        return PixelBuffer(width: width, height: height, pixels: pixels)
    }

    private static func makeImage(pixels: [RGBAColor], width: Int, height: Int) -> UIImage? {
        var bytes = [UInt8]()
        bytes.reserveCapacity(width * height * 4)
        for pixel in pixels {
            bytes.append(UInt8(clamp(pixel.r)))
            bytes.append(UInt8(clamp(pixel.g)))
            bytes.append(UInt8(clamp(pixel.b)))
            bytes.append(UInt8(clamp(pixel.a)))
        }
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let provider = CGDataProvider(data: Data(bytes) as CFData),
              let image = CGImage(
                width: width,
                height: height,
                bitsPerComponent: 8,
                bitsPerPixel: 32,
                bytesPerRow: width * 4,
                space: colorSpace,
                bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                provider: provider,
                decode: nil,
                shouldInterpolate: true,
                intent: .defaultIntent
              ) else {
            return nil
        }
        return UIImage(cgImage: image, scale: 1, orientation: .up)
    }

    private static func createQuantizedPalette(_ pixels: [RGBAColor], maxColors: Int) -> [RGBAColor] {
        var buckets: [String: (count: Int, r: Double, g: Double, b: Double)] = [:]
        let background = RGBAColor(r: 250, g: 250, b: 250, a: 255)
        for pixel in pixels {
            let color = pixel.composited(over: background)
            let key = "\(Int(color.r) >> 4),\(Int(color.g) >> 4),\(Int(color.b) >> 4)"
            let bucket = buckets[key] ?? (0, 0, 0, 0)
            buckets[key] = (bucket.count + 1, bucket.r + color.r, bucket.g + color.g, bucket.b + color.b)
        }
        let palette = buckets.values
            .map { RGBAColor(r: round($0.r / Double($0.count)), g: round($0.g / Double($0.count)), b: round($0.b / Double($0.count)), a: 255, count: $0.count) }
            .sorted { $0.count > $1.count }
            .prefix(max(2, min(16, maxColors)))
        return palette.isEmpty ? [RGBAColor(r: 250, g: 248, b: 244, a: 255)] : Array(palette)
    }

    private static func nearestColor(_ color: RGBAColor, palette: [RGBAColor]) -> RGBAColor {
        nearestPaletteEntry(color, palette: palette).color
    }

    private static func nearestPaletteEntry(_ color: RGBAColor, palette: [RGBAColor]) -> (color: RGBAColor, index: Int) {
        var nearest = palette[0]
        var nearestIndex = 0
        var nearestDistance = Double.greatestFiniteMagnitude
        for (index, candidate) in palette.enumerated() {
            let dr = color.r - candidate.r
            let dg = color.g - candidate.g
            let db = color.b - candidate.b
            let distance = dr * dr + dg * dg + db * db
            if distance < nearestDistance {
                nearestDistance = distance
                nearest = candidate
                nearestIndex = index
            }
        }
        return (nearest, nearestIndex)
    }

    private static func drawCrossStitchFabric(context: CGContext, size: CGSize, cellSize: CGFloat) {
        context.saveGState()
        context.setAlpha(0.28)
        context.setStrokeColor(UIColor(red: 120 / 255, green: 102 / 255, blue: 82 / 255, alpha: 0.16).cgColor)
        context.setLineWidth(1)
        let gap = max(4, round(cellSize / 2))
        stride(from: CGFloat(0), through: size.width, by: gap).forEach { x in
            context.move(to: CGPoint(x: x + 0.5, y: 0))
            context.addLine(to: CGPoint(x: x + 0.5, y: size.height))
            context.strokePath()
        }
        stride(from: CGFloat(0), through: size.height, by: gap).forEach { y in
            context.move(to: CGPoint(x: 0, y: y + 0.5))
            context.addLine(to: CGPoint(x: size.width, y: y + 0.5))
            context.strokePath()
        }
        context.restoreGState()
    }

    private static func drawCrossStitchPixel(context: CGContext, rect: CGRect, color: RGBAColor) {
        context.saveGState()
        context.setFillColor(color.uiColor(alpha: 0.82).cgColor)
        context.fill(rect.insetBy(dx: 1, dy: 1))
        context.restoreGState()
    }

    private static func drawCrossStitchNeedle(context: CGContext, rect: CGRect, color: RGBAColor) {
        let inset = max(2, rect.width * 0.22)
        context.saveGState()
        context.setLineWidth(max(2, rect.width * 0.22))
        context.setLineCap(.round)
        context.setStrokeColor(color.uiColor(alpha: 0.94).cgColor)
        context.move(to: CGPoint(x: rect.minX + inset, y: rect.minY + inset))
        context.addLine(to: CGPoint(x: rect.maxX - inset, y: rect.maxY - inset))
        context.strokePath()
        context.setStrokeColor(color.uiColor(alpha: 0.76).cgColor)
        context.move(to: CGPoint(x: rect.maxX - inset, y: rect.minY + inset))
        context.addLine(to: CGPoint(x: rect.minX + inset, y: rect.maxY - inset))
        context.strokePath()
        context.restoreGState()
    }

    private static func drawCrossStitchGrid(context: CGContext, size: CGSize, cellSize: CGFloat) {
        context.saveGState()
        context.setStrokeColor(UIColor(red: 35 / 255, green: 31 / 255, blue: 28 / 255, alpha: 0.16).cgColor)
        context.setLineWidth(1)
        stride(from: CGFloat(0), through: size.width, by: cellSize).forEach { x in
            context.move(to: CGPoint(x: x + 0.5, y: 0))
            context.addLine(to: CGPoint(x: x + 0.5, y: size.height))
            context.strokePath()
        }
        stride(from: CGFloat(0), through: size.height, by: cellSize).forEach { y in
            context.move(to: CGPoint(x: 0, y: y + 0.5))
            context.addLine(to: CGPoint(x: size.width, y: y + 0.5))
            context.strokePath()
        }
        context.restoreGState()
    }

    private static func matissePalette(_ name: String) -> [RGBAColor] {
        switch name {
        case "earth":
            return [rgb(183, 96, 55), rgb(124, 81, 51), rgb(85, 116, 76), rgb(36, 60, 54), rgb(215, 167, 101), rgb(232, 214, 177), rgb(86, 45, 44), rgb(247, 241, 226)]
        case "soft":
            return [rgb(222, 153, 174), rgb(235, 185, 130), rgb(145, 174, 151), rgb(129, 164, 189), rgb(244, 221, 142), rgb(174, 139, 104), rgb(60, 72, 61), rgb(250, 244, 231)]
        default:
            return [rgb(245, 205, 24), rgb(235, 92, 94), rgb(31, 111, 154), rgb(32, 121, 78), rgb(244, 139, 77), rgb(246, 229, 168), rgb(38, 43, 36), rgb(245, 239, 224)]
        }
    }

    private static func matisseBackground(_ paletteName: String) -> RGBAColor {
        paletteName == "vivid" ? rgb(247, 214, 220) : rgb(247, 240, 223)
    }

    private static func soften(_ pixels: inout [RGBAColor], width: Int, height: Int) {
        let source = pixels
        guard width > 2, height > 2 else { return }
        for y in 1..<(height - 1) {
            for x in 1..<(width - 1) {
                let index = y * width + x
                let left = index - 1
                let right = index + 1
                let up = index - width
                let down = index + width
                pixels[index].r = source[index].r * 0.62 + source[left].r * 0.08 + source[right].r * 0.08 + source[up].r * 0.11 + source[down].r * 0.11
                pixels[index].g = source[index].g * 0.62 + source[left].g * 0.08 + source[right].g * 0.08 + source[up].g * 0.11 + source[down].g * 0.11
                pixels[index].b = source[index].b * 0.62 + source[left].b * 0.08 + source[right].b * 0.08 + source[up].b * 0.11 + source[down].b * 0.11
            }
        }
    }

    private static func drawMatisseEdges(pixels: inout [RGBAColor], indexes: [Int], width: Int, height: Int, paletteName: String) {
        let edge = paletteName == "vivid" ? rgb(33, 37, 31) : rgb(76, 58, 44)
        let strideValue = max(2, max(width, height) / 420)
        var y = 1
        while y < height - 1 {
            var x = 1
            while x < width - 1 {
                let index = indexes[y * width + x]
                let changed = indexes[y * width + x + 1] != index || indexes[(y + 1) * width + x] != index
                if changed && abs(seededNoise(seed: Double(y * 131 + x * 17), salt: 5)) >= 0.18 {
                    paintEdgeDot(pixels: &pixels, width: width, height: height, x: x, y: y, color: edge, radius: strideValue)
                }
                x += strideValue
            }
            y += strideValue
        }
    }

    private static func paintEdgeDot(pixels: inout [RGBAColor], width: Int, height: Int, x: Int, y: Int, color: RGBAColor, radius: Int) {
        let size = max(1, min(3, radius))
        for dy in -size...size {
            for dx in -size...size where dx * dx + dy * dy <= size * size {
                let px = x + dx
                let py = y + dy
                guard px >= 0, py >= 0, px < width, py < height else { continue }
                let index = py * width + px
                pixels[index] = pixels[index].mixed(with: color, amount: 0.58)
            }
        }
    }

    private static func drawCutoutPaperTexture(context: CGContext, width: CGFloat, height: CGFloat, alpha: CGFloat) {
        context.saveGState()
        context.setAlpha(alpha)
        context.setStrokeColor(UIColor(red: 60 / 255, green: 48 / 255, blue: 35 / 255, alpha: 0.18).cgColor)
        context.setLineWidth(1)
        var y: CGFloat = 6
        while y < height {
            context.move(to: CGPoint(x: 0, y: y + CGFloat(seededNoise(seed: Double(y), salt: 2) * 2)))
            var x: CGFloat = 0
            while x <= width {
                context.addLine(to: CGPoint(x: x, y: y + CGFloat(seededNoise(seed: Double(y), salt: Double(x + 3)) * 2)))
                x += 48
            }
            context.strokePath()
            y += 18
        }
        context.restoreGState()
    }

    private static func sourceGray(_ pixels: [RGBAColor], width: Int, height: Int, x: Int, y: Int) -> Double {
        let px = max(0, min(width - 1, x))
        let py = max(0, min(height - 1, y))
        let color = pixels[py * width + px]
        return color.r * 0.299 + color.g * 0.587 + color.b * 0.114
    }

    private static func botanicalHatchInk(x: Int, y: Int, gray: Double, detail: String) -> Double {
        guard gray <= 178 else { return 0 }
        let spacing = detail == "etched" ? 10 : detail == "soft" ? 20 : 15
        let diagonal = (x + y) % spacing
        let cross = detail == "etched" ? abs((x - y) % (spacing + 5)) : spacing
        let shade = max(0, (178 - gray) / 255)
        let primary = diagonal < 1 ? shade * 0.16 : 0
        let secondary = cross < 1 ? shade * 0.1 : 0
        return max(primary, secondary)
    }

    private static func botanicalTone(_ name: String) -> (paper: RGBAColor, ink: RGBAColor) {
        switch name {
        case "sage", "warm":
            return (rgb(249, 245, 231), rgb(55, 105, 82))
        case "sepia":
            return (rgb(247, 240, 222), rgb(75, 56, 40))
        default:
            return (rgb(248, 246, 235), rgb(21, 98, 168))
        }
    }

    private static func drawBotanicalPlateOverlay(context: CGContext, width: CGFloat, height: CGFloat, tone: (paper: RGBAColor, ink: RGBAColor)) {
        context.saveGState()
        context.setFillColor(tone.ink.uiColor(alpha: 0.012).cgColor)
        for index in 0..<80 {
            let x = CGFloat(seededNoise(seed: Double(index), salt: 1) * 0.5 + 0.5) * width
            let y = CGFloat(seededNoise(seed: Double(index), salt: 2) * 0.5 + 0.5) * height
            let size = CGFloat(0.6 + abs(seededNoise(seed: Double(index), salt: 3)) * 1.8)
            context.fillEllipse(in: CGRect(x: x, y: y, width: size, height: size))
        }
        let pad = max(22, round(min(width, height) * 0.045))
        context.setStrokeColor(tone.ink.uiColor(alpha: 0.34).cgColor)
        context.setLineWidth(max(1, round(min(width, height) * 0.002)))
        context.stroke(CGRect(x: pad, y: pad, width: width - pad * 2, height: height - pad * 2))
        context.setStrokeColor(tone.ink.uiColor(alpha: 0.22).cgColor)
        context.strokeEllipse(in: CGRect(x: width * 0.11, y: height * 0.07, width: width * 0.78, height: height * 0.86))
        drawBotanicalLabels(context: context, width: width, height: height, tone: tone)
        context.restoreGState()
    }

    private static func drawBotanicalLabels(context: CGContext, width: CGFloat, height: CGFloat, tone: (paper: RGBAColor, ink: RGBAColor)) {
        let ink = tone.ink.uiColor(alpha: 0.46)
        let titleSize = max(CGFloat(14), round(width * 0.026))
        let captionSize = max(CGFloat(12), round(width * 0.021))
        let titleAttributes: [NSAttributedString.Key: Any] = [
            .font: UIFont(name: "Times New Roman", size: titleSize) ?? UIFont.systemFont(ofSize: titleSize),
            .foregroundColor: ink
        ]
        let captionAttributes: [NSAttributedString.Key: Any] = [
            .font: UIFont(name: "Times New Roman", size: captionSize) ?? UIFont.systemFont(ofSize: captionSize),
            .foregroundColor: ink
        ]
        ("BOTANICAL STUDY" as NSString).draw(at: CGPoint(x: width * 0.08, y: height * 0.07), withAttributes: titleAttributes)
        ("plate no. 03 / local specimen" as NSString).draw(at: CGPoint(x: width * 0.08, y: height * 0.105), withAttributes: captionAttributes)
        ("archive notes" as NSString).draw(at: CGPoint(x: width * 0.72, y: height * 0.875), withAttributes: captionAttributes)
        ("tonal line illustration" as NSString).draw(at: CGPoint(x: width * 0.66, y: height * 0.905), withAttributes: captionAttributes)
    }

    private static func optionNumber(_ effect: LayerImageEffect, _ key: String, fallback: Double) -> Double {
        guard case .number(let value)? = effect.options[key] else { return fallback }
        return value
    }

    private static func optionString(_ effect: LayerImageEffect, _ key: String, fallback: String) -> String {
        guard case .string(let value)? = effect.options[key] else { return fallback }
        return value
    }

    private static func seededNoise(seed: Double, salt: Double) -> Double {
        let value = sin(seed * 12.9898 + salt * 78.233) * 43758.5453
        return (value - floor(value)) * 2 - 1
    }

    private static func rgb(_ r: Double, _ g: Double, _ b: Double) -> RGBAColor {
        RGBAColor(r: r, g: g, b: b, a: 255)
    }

    private static func clamp(_ value: Double) -> Double {
        max(0, min(255, round(value)))
    }
}

private struct PixelBuffer {
    var width: Int
    var height: Int
    var pixels: [RGBAColor]
}

private struct RGBAColor {
    var r: Double
    var g: Double
    var b: Double
    var a: Double
    var count: Int = 0

    func composited(over background: RGBAColor) -> RGBAColor {
        let alpha = a / 255
        return RGBAColor(
            r: round(r * alpha + background.r * (1 - alpha)),
            g: round(g * alpha + background.g * (1 - alpha)),
            b: round(b * alpha + background.b * (1 - alpha)),
            a: 255
        )
    }

    func mixed(with other: RGBAColor, amount: Double) -> RGBAColor {
        let clamped = max(0, min(1, amount))
        return RGBAColor(
            r: r * (1 - clamped) + other.r * clamped,
            g: g * (1 - clamped) + other.g * clamped,
            b: b * (1 - clamped) + other.b * clamped,
            a: 255
        )
    }

    func uiColor(alpha: CGFloat? = nil) -> UIColor {
        UIColor(
            red: CGFloat(max(0, min(1, r / 255))),
            green: CGFloat(max(0, min(1, g / 255))),
            blue: CGFloat(max(0, min(1, b / 255))),
            alpha: alpha ?? CGFloat(max(0, min(1, a / 255)))
        )
    }
}
