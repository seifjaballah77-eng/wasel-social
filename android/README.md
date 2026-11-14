# Seif Messages — Android offline foundation

This folder starts the native Android companion app. It uses Google Nearby Connections with a point-to-point strategy. Nearby Connections can select local Bluetooth/BLE/Wi-Fi transports and discover another nearby Android device without requiring an internet router.

## Build

Open the `android` folder in Android Studio (JDK 17; Android SDK 35), allow Gradle sync, then build a debug APK from **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

## Current implementation status

- Native Android project scaffold: added.
- Runtime permissions for nearby devices: added.
- Nearby advertising/discovery and connection handshake: added.
- Small test payload after connection: added.
- Real-time voice/video over the offline link: **not implemented yet**.
- Online calls continue to use the existing Jitsi-based web implementation.

The browser/PWA cannot transparently use Android Nearby Connections APIs. Offline calling must be implemented in this native app, including audio/video capture, encoding, transport, and playback. Bluetooth-only bandwidth is not a dependable video transport; Nearby Connections can select a local Wi-Fi transport when available and Bluetooth as a fallback. When only Bluetooth is available, the first target should be audio; video should be enabled only when the negotiated transport and measured bandwidth can sustain it.

No APK is attached or claimed to be built by this repository change.
