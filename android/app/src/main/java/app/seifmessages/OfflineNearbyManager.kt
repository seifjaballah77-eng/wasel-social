package app.seifmessages

import android.content.Context
import android.media.*
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.*
import java.io.*
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.max

/** Nearby connection and experimental full-duplex voice transport. */
class OfflineNearbyManager(
    context: Context,
    private val report: (String) -> Unit,
    private val incomingCall: (String) -> Unit,
    private val callState: (String) -> Unit
) {
    private val client = Nearby.getConnectionsClient(context.applicationContext)
    private val serviceId = "app.seifmessages.offline"
    private val strategy = Strategy.P2P_POINT_TO_POINT
    private val localName = "Seif-" + UUID.randomUUID().toString().take(8)
    private val endpoints = ConcurrentHashMap.newKeySet<String>()
    private val pending = ConcurrentHashMap.newKeySet<String>()
    @Volatile private var running = false
    @Volatile private var activeEndpoint: String? = null
    @Volatile private var audioRunning = false
    private var recorder: AudioRecord? = null
    private var pipeIn: PipedInputStream? = null
    private var pipeOut: PipedOutputStream? = null
    private var captureThread: Thread? = null
    private var playbackThread: Thread? = null

    private val lifecycle = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(id: String, info: ConnectionInfo) {
            report("الجهاز " + info.endpointName + " يطلب الاتصال. جارٍ تأكيده…")
            client.acceptConnection(id, payloadCallback).addOnFailureListener {
                pending.remove(id)
                report("تعذر قبول الاتصال: " + (it.localizedMessage ?: "خطأ غير معروف"))
            }
        }
        override fun onConnectionResult(id: String, result: ConnectionResolution) {
            pending.remove(id)
            if (result.status.isSuccess) {
                endpoints.add(id)
                if (activeEndpoint == null) activeEndpoint = id
                report("نجح الاتصال بالجهاز القريب. لا يلزم الإنترنت.")
                callState("اتصال قريب جاهز للمكالمة")
                sendText(id, "SEIF_HELLO")
            } else {
                report("فشل الاتصال القريب. رمز الخطأ: " + result.status.statusCode)
            }
        }
        override fun onDisconnected(id: String) {
            endpoints.remove(id)
            pending.remove(id)
            if (activeEndpoint == id) {
                stopAudio()
                activeEndpoint = endpoints.firstOrNull()
            }
            report("انقطع اتصال الجهاز القريب.")
            callState(if (activeEndpoint == null) "لا يوجد جهاز متصل" else "اتصال قريب جاهز")
        }
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(id: String, payload: Payload) {
            when (payload.type) {
                Payload.Type.BYTES -> {
                    when (payload.asBytes()?.toString(StandardCharsets.UTF_8).orEmpty()) {
                        "SEIF_CALL_REQUEST" -> {
                            activeEndpoint = id
                            incomingCall("مكالمة صوتية واردة من جهاز قريب")
                            callState("مكالمة قريبة واردة")
                        }
                        "SEIF_CALL_ACCEPT" -> {
                            activeEndpoint = id
                            startAudio(id)
                        }
                        "SEIF_CALL_REJECT" -> callState("رفض الجهاز الآخر المكالمة")
                        "SEIF_CALL_END" -> {
                            stopAudio()
                            callState("انتهت المكالمة")
                        }
                        "SEIF_HELLO" -> report("تم تبادل إشارة التحقق بين الجهازين.")
                    }
                }
                Payload.Type.STREAM -> {
                    val stream = payload.asStream()?.asInputStream()
                    if (stream != null) startPlayback(stream)
                }
                else -> Unit
            }
        }
        override fun onPayloadTransferUpdate(id: String, update: PayloadTransferUpdate) {
            if (update.status == PayloadTransferUpdate.Status.FAILURE) report("فشل نقل صوت المكالمة.")
        }
    }

    private val discovery = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(id: String, info: DiscoveredEndpointInfo) {
            if (endpoints.contains(id) || !pending.add(id)) return
            report("تم العثور على " + info.endpointName + "…")
            // Only one side initiates, avoiding simultaneous request collisions.
            if (localName < info.endpointName) {
                client.requestConnection(localName, id, lifecycle).addOnFailureListener {
                    pending.remove(id)
                    report("فشل طلب الاتصال: " + (it.localizedMessage ?: ""))
                }
            } else pending.remove(id)
        }
        override fun onEndpointLost(id: String) {
            if (!endpoints.contains(id)) report("اختفى جهاز من نطاق البحث.")
        }
    }

    fun start() {
        if (running) return
        running = true
        report("جارٍ تشغيل البحث والإعلان للأجهزة القريبة…")
        client.startAdvertising(localName, serviceId, lifecycle,
            AdvertisingOptions.Builder().setStrategy(strategy).build())
            .addOnSuccessListener { report("هذا الهاتف ظاهر للأجهزة القريبة.") }
            .addOnFailureListener { running = false; report("فشل تشغيل استقبال الاتصالات: " + (it.localizedMessage ?: "")) }
        client.startDiscovery(serviceId, discovery,
            DiscoveryOptions.Builder().setStrategy(strategy).build())
            .addOnSuccessListener { report("البحث عن الأجهزة القريبة يعمل.") }
            .addOnFailureListener { running = false; report("فشل البحث عن الأجهزة: " + (it.localizedMessage ?: "")) }
    }

    fun startAudioCall() {
        val id = activeEndpoint ?: endpoints.firstOrNull()
        if (id == null) {
            report("لا يوجد جهاز متصل بعد. شغّل البحث على الهاتفين وانتظر نجاح الاتصال.")
            return
        }
        activeEndpoint = id
        sendText(id, "SEIF_CALL_REQUEST")
        callState("يرن لدى الجهاز القريب…")
    }

    fun acceptIncomingCall() {
        val id = activeEndpoint ?: return
        sendText(id, "SEIF_CALL_ACCEPT")
        startAudio(id)
    }

    fun declineIncomingCall() {
        activeEndpoint?.let { sendText(it, "SEIF_CALL_REJECT") }
        callState("تم رفض المكالمة")
    }

    fun endAudioCall() {
        activeEndpoint?.let { sendText(it, "SEIF_CALL_END") }
        stopAudio()
        callState("انتهت المكالمة")
    }

    private fun startAudio(id: String) {
        if (audioRunning) return
        try {
            val rate = 16000
            val min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            if (min <= 0) throw IllegalStateException("الميكروفون غير مدعوم")
            val bufferSize = max(4096, min * 2)
            val input = AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION, rate,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferSize)
            val source = PipedInputStream(65536)
            val sink = PipedOutputStream(source)
            recorder = input
            pipeIn = source
            pipeOut = sink
            audioRunning = true
            input.startRecording()
            client.sendPayload(id, Payload.fromStream(source)).addOnFailureListener {
                report("فشل إرسال الصوت: " + (it.localizedMessage ?: ""))
                stopAudio()
            }
            captureThread = Thread({
                val bytes = ByteArray(640)
                try {
                    while (audioRunning) {
                        val count = input.read(bytes, 0, bytes.size)
                        if (count > 0) sink.write(bytes, 0, count)
                    }
                } catch (_: Exception) { }
            }, "SeifAudioCapture").apply { isDaemon = true; start() }
            callState("المكالمة الصوتية المحلية نشطة")
            report("بدأ إرسال صوت الميكروفون عبر الاتصال القريب.")
        } catch (e: Exception) {
            stopAudio()
            report("تعذر تشغيل الميكروفون: " + (e.localizedMessage ?: ""))
            callState("تعذر بدء المكالمة")
        }
    }

    private fun startPlayback(input: InputStream) {
        if (playbackThread?.isAlive == true) return
        playbackThread = Thread({
            var track: AudioTrack? = null
            try {
                val rate = 16000
                val min = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
                if (min <= 0) throw IllegalStateException("مخرج الصوت غير مدعوم")
                track = AudioTrack.Builder()
                    .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                    .setAudioFormat(AudioFormat.Builder().setSampleRate(rate).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                    .setBufferSizeInBytes(max(4096, min * 2)).setTransferMode(AudioTrack.MODE_STREAM).build()
                track.play()
                val bytes = ByteArray(640)
                while (audioRunning) {
                    val count = input.read(bytes)
                    if (count < 0) break
                    if (count > 0) track.write(bytes, 0, count)
                }
            } catch (e: Exception) {
                if (audioRunning) report("توقف استقبال الصوت: " + (e.localizedMessage ?: ""))
            } finally {
                try { input.close() } catch (_: Exception) {}
                try { track?.stop() } catch (_: Exception) {}
                track?.release()
            }
        }, "SeifAudioPlayback").apply { isDaemon = true; start() }
    }

    @Synchronized private fun stopAudio() {
        audioRunning = false
        try { recorder?.stop() } catch (_: Exception) {}
        try { recorder?.release() } catch (_: Exception) {}
        recorder = null
        try { pipeOut?.close() } catch (_: Exception) {}
        try { pipeIn?.close() } catch (_: Exception) {}
        pipeOut = null
        pipeIn = null
        captureThread?.interrupt()
        captureThread = null
        playbackThread?.interrupt()
        playbackThread = null
    }

    private fun sendText(id: String, value: String) {
        client.sendPayload(id, Payload.fromBytes(value.toByteArray(StandardCharsets.UTF_8)))
            .addOnFailureListener { report("تعذر إرسال إشارة: " + (it.localizedMessage ?: "")) }
    }

    fun stop() {
        if (!running && endpoints.isEmpty()) return
        running = false
        endAudioCall()
        client.stopAdvertising()
        client.stopDiscovery()
        client.stopAllEndpoints()
        endpoints.clear()
        pending.clear()
        activeEndpoint = null
        report("تم إيقاف الاتصال القريب.")
    }
}
