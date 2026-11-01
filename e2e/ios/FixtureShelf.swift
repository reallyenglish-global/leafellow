// SPDX-License-Identifier: Apache-2.0
// Simulator acceptance fixture provider only. Never bundled with Leafellow.
import SwiftUI

@main
struct FixtureShelf: App {
    var body: some Scene {
        WindowGroup {
            VStack(spacing: 16) {
                Text("FixtureShelf").font(.title)
                Text("Synthetic Leafellow acceptance fixtures only.")
                Text("Open Files → On My iPhone → FixtureShelf.")
            }.padding()
        }
    }
}
