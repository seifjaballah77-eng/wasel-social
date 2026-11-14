# Seif Messages — Android offline foundation

This folder contains the native Android companion app. Its home screen always shows two independent choices:
- **Internet:** opens the hosted Seif Messages web app. This works for contacts in other countries when both sides have internet access.
- **Bluetooth / nearby:** starts nearby-device discovery when the user chooses it, whether internet is available or not.

The nearby connection is implemented with Google Nearby Connections using a point-to-point strategy. The library may select an available local transport (Bluetooth/BLE or local Wi-Fi) and does not require an internet router for nearby peers.

## Build

Open the `android` folder in Android Studio (JDK 17; Android SDK 35), allow Gradle sync, then build a debug APK from **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

## Current implementation status

- Native Android project scaffold: added.
- Always-visible Internet and Bluetooth/nearby choices: added.
- Runtime permissions for nearby devices: added.
- Nearby advertising/discovery and connection handshake: added.
- Small test payload after connection: added.
- Real-time voice/video over the offline link: **not implemented yet**.

The browser/PWA cannot transparently use Android Nearby Connections APIs. Offline calling must be implemented in this native app, including audio/video capture, encoding, transport, and playback. Bluetooth-only bandwidth is not a dependable video transport; Nearby Connections can select a local Wi-Fi transport when available. When only Bluetooth is available, audio should be prioritized and video should only be enabled when the negotiated transport can sustain it.

No APK is attached or claimed to be built by this repository change.
