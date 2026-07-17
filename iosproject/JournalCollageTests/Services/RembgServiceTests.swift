import XCTest
@testable import JournalCollage

final class RembgServiceTests: XCTestCase {
    func testMissingEndpointFailsBeforeUpload() async {
        let service = RembgService(
            configuration: RembgConfiguration(
                endpoint: "",
                fileFieldName: "file",
                formData: [:],
                headers: [:]
            )
        )

        do {
            _ = try await service.removeImageBackground(fileURL: URL(fileURLWithPath: "/missing.png"))
            XCTFail("Expected missing endpoint error")
        } catch let error as RembgServiceError {
            XCTAssertEqual(error, .missingEndpoint)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testBundledConfigurationDefaultsToMiniProgramContract() {
        let configuration = RembgConfiguration(
            endpoint: "",
            fileFieldName: "file",
            formData: [:],
            headers: [:]
        )

        XCTAssertEqual(configuration.fileFieldName, "file")
        XCTAssertTrue(configuration.formData.isEmpty)
        XCTAssertTrue(configuration.headers.isEmpty)
    }
}
