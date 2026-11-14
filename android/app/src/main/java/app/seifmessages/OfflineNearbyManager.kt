package app.seifmessages

import android.content.Context
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.*
import com.google.android.gms.tasks.Task
import java.nio.charset.StandardCharsets

/**
 * Offline peer discovery foundation.
 * Nearby Connections chooses an available local transport (Bluetooth/BLE/Wi-Fi)
 * and does not require an internet connection for nearby peers.
 *
 * This currently implements discovery + connection + small data payloads,
 * not real-time audio/video media transport.
 */
class OfflineNearbyManager(context: Context, private val report: (String) -> Unit) {
    private val client = Nearby.getConnectionsClient(context)
    private val serviceId = "app.seifmessages.offline"
    private val strategy = Strategy.P2P_POINT_TO_POINT
    private val endpoints = linkedSetOf<String>()
    private var running = false

    private val connectionLifecycle = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
            report("تم العثور على ${info.endpointName}. جارٍ تأكيد الاتصال…")
            client.acceptConnection(endpointId, payloadCallback)
        }
        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            if (result.status.isSuccess) {
                endpoints += endpointId
                report("اتصال محلي جاهز مع جهاز قريب دون إنترنت.")
                sendText(endpointId, "SEIF_MESSAGES_READY")
            } else report("تعذر إتمام الاتصال بالجهاز القريب.")
        }
        override fun onDisconnected(endpointId: String) {
            endpoints -= endpointId
            report("انقطع الاتصال بالجهاز القريب.")
        }
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            if (payload.type == Payload.Type.BYTES) {
                val message = payload.asBytes()?.toString(StandardCharsets.UTF_8).orEmpty()
                report("وصلت بيانات محلية من الجهاز الآخر: $message")
            }
        }
        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) = Unit
    }

    private val discoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            report("تم العثور على جهاز Seif Messages قريب: ${info.endpointName}. جارٍ الاتصال…")
            client.requestConnection("Seif Messages", endpointId, connectionLifecycle)
                .addOnFailureListener { report("فشل طلب الاتصال بالجهاز القريب.") }
        }
        override fun onEndpointLost(endpointId: String) = Unit
    }

    fun start() {
        if (running) return
        running = true
        report("جارٍ تشغيل البحث المحلي عبر Bluetooth/الاتصال القريب…")
        client.startAdvertising("Seif Messages", serviceId, connectionLifecycle,
            AdvertisingOptions.Builder().setStrategy(strategy).build())
            .addOnFailureListener { report("تعذر تشغيل استقبال الاتصالات القريبة. تحقق من Bluetooth والصلاحيات.") }
        client.startDiscovery(serviceId, discoveryCallback,
            DiscoveryOptions.Builder().setStrategy(strategy).build())
            .addOnFailureListener { report("تعذر البحث عن الأجهزة القريبة. تحقق من تشغيل Bluetooth.") }
    }

    private fun sendText(endpointId: String, text: String) {
        client.sendPayload(endpointId, Payload.fromBytes(text.toByteArray(StandardCharsets.UTF_8)))
    }

    fun stop() {
        if (!running) return
        running = false
        client.stopAdvertising()
        client.stopDiscovery()
        client.stopAllEndpoints()
        endpoints.clear()
        report("تم إيقاف الاتصال المحلي.")
    }
}
