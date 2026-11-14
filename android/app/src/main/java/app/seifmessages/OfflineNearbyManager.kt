package app.seifmessages

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothServerSocket
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.media.*
import android.os.Build
import androidx.core.content.ContextCompat
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.IOException
import java.util.UUID
import java.util.concurrent.LinkedBlockingQueue
import kotlin.concurrent.thread
import kotlin.math.max

/** Direct Bluetooth Classic RFCOMM chat and bidirectional voice transport. */
class OfflineNearbyManager(
    private val context: Context,
    private val report: (String) -> Unit,
    private val incomingCall: (String) -> Unit,
    private val callState: (String) -> Unit,
    private val incomingMessage: (String) -> Unit,
    private val connectionChanged: (Boolean, String) -> Unit
) {
    companion object {
        private val SERVICE_UUID: UUID = UUID.fromString("8f6d2a10-7b31-4c9a-9d21-5e1f0a6b7c80")
        private const val SERVICE_NAME = "SeifMessages"
        private const val TEXT = 1
        private const val AUDIO = 2
    }

    private val adapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
    @Volatile private var running = false
    @Volatile private var socket: BluetoothSocket? = null
    @Volatile private var output: DataOutputStream? = null
    @Volatile private var audioRunning = false
    private val writeLock = Any()
    private val audioQueue = LinkedBlockingQueue<ByteArray>()
    private var server: BluetoothServerSocket? = null
    private var recorder: AudioRecord? = null
    private var track: AudioTrack? = null
    private var captureThread: Thread? = null
    private var playbackThread: Thread? = null
    private var audioManager: AudioManager? = null

    fun pairedDevices(): List<Pair<String, String>> {
        if (!hasConnectPermission()) {
            report("امنح إذن Bluetooth للأجهزة القريبة أولًا.")
            return emptyList()
        }
        return try {
            adapter?.bondedDevices?.map { (it.name ?: "جهاز Bluetooth") to it.address }?.sortedBy { it.first } ?: emptyList()
        } catch (e: Exception) {
            report("تعذر قراءة الأجهزة المقترنة: ${e.localizedMessage ?: "خطأ"}")
            emptyList()
        }
    }

    fun start() {
        if (running) return
        if (adapter == null) { report("هذا الهاتف لا يدعم Bluetooth."); return }
        if (!hasConnectPermission()) { report("إذن Bluetooth غير متاح."); return }
        if (!adapter.isEnabled) { report("شغّل Bluetooth ثم أعد المحاولة."); return }
        running = true
        thread(name = "SeifBluetoothServer", isDaemon = true) {
            try {
                server = adapter.listenUsingRfcommWithServiceRecord(SERVICE_NAME, SERVICE_UUID)
                report("جاهز لاستقبال اتصال Bluetooth. اقترن بالهاتف الآخر أولًا.")
                while (running) {
                    val accepted = server?.accept() ?: break
                    if (!running) { accepted.close(); break }
                    attach(accepted)
                }
            } catch (e: SecurityException) {
                report("إذن Bluetooth مفقود: ${e.localizedMessage ?: ""}")
            } catch (e: IOException) {
                if (running) report("تعذر استقبال اتصال Bluetooth: ${e.localizedMessage ?: ""}")
            } finally {
                try { server?.close() } catch (_: Exception) {}
                server = null
            }
        }
    }

    fun connect(address: String) {
        if (!running) start()
        val bt = adapter ?: return
        if (!hasConnectPermission()) { report("امنح إذن Bluetooth للاتصال."); return }
        thread(name = "SeifBluetoothConnect", isDaemon = true) {
            try {
                try { bt.cancelDiscovery() } catch (_: Exception) {}
                val device = bt.getRemoteDevice(address)
                report("جارٍ الاتصال بـ ${device.name ?: address} عبر Bluetooth…")
                val candidate = device.createRfcommSocketToServiceRecord(SERVICE_UUID)
                candidate.connect()
                attach(candidate)
            } catch (e: Exception) {
                report("فشل اتصال Bluetooth: ${e.localizedMessage ?: "تأكد من اقتران الهاتفين وفتح التطبيق فيهما."}")
                connectionChanged(false, "")
            }
        }
    }

    @Synchronized private fun attach(newSocket: BluetoothSocket) {
        try {
            socket?.close()
            socket = newSocket
            output = DataOutputStream(newSocket.outputStream)
            connectionChanged(true, newSocket.remoteDevice.name ?: newSocket.remoteDevice.address)
            report("تم الاتصال مباشرة عبر Bluetooth مع ${newSocket.remoteDevice.name ?: "الجهاز الآخر"}.")
            thread(name = "SeifBluetoothReader", isDaemon = true) { readLoop(newSocket) }
        } catch (e: Exception) {
            report("تعذر تهيئة قناة Bluetooth: ${e.localizedMessage ?: ""}")
            try { newSocket.close() } catch (_: Exception) {}
        }
    }

    private fun readLoop(current: BluetoothSocket) {
        try {
            val input = DataInputStream(current.inputStream)
            while (running && current.isConnected) {
                val type = input.readUnsignedByte()
                val size = input.readInt()
                if (size < 0 || size > 1_048_576) throw IOException("حجم بيانات غير صالح")
                val data = ByteArray(size)
                input.readFully(data)
                when (type) {
                    TEXT -> {
                        val value = data.toString(Charsets.UTF_8)
                        if (value.startsWith("!SEIF:")) handleControl(value.removePrefix("!SEIF:"))
                        else incomingMessage(value)
                    }
                    AUDIO -> if (audioRunning) audioQueue.offer(data)
                    else -> report("وصل نوع بيانات غير معروف.")
                }
            }
        } catch (e: Exception) {
            if (running) report("انقطع اتصال Bluetooth: ${e.localizedMessage ?: ""}")
        } finally {
            if (socket === current) {
                stopAudio()
                try { current.close() } catch (_: Exception) {}
                socket = null
                output = null
                connectionChanged(false, "")
                callState("لا يوجد اتصال Bluetooth")
            }
        }
    }

    private fun handleControl(value: String) {
        when (value) {
            "CALL_REQUEST" -> incomingCall("مكالمة صوتية واردة عبر Bluetooth")
            "CALL_ACCEPT" -> startAudio()
            "CALL_REJECT" -> callState("رفض الطرف الآخر المكالمة")
            "CALL_END" -> { stopAudio(); callState("أنهى الطرف الآخر المكالمة") }
        }
    }

    fun sendMessage(message: String): Boolean {
        if (message.isBlank()) return false
        return sendFrame(TEXT, message.toByteArray(Charsets.UTF_8))
    }

    private fun sendControl(value: String) { sendFrame(TEXT, "!SEIF:$value".toByteArray(Charsets.UTF_8)) }

    private fun sendFrame(type: Int, bytes: ByteArray): Boolean {
        return try {
            synchronized(writeLock) {
                val out = output ?: return false
                out.writeByte(type); out.writeInt(bytes.size); out.write(bytes); out.flush()
            }
            true
        } catch (e: Exception) {
            report("فشل الإرسال عبر Bluetooth: ${e.localizedMessage ?: ""}")
            false
        }
    }

    fun startAudioCall() {
        if (socket?.isConnected != true) { callState("اتصل بجهاز Bluetooth أولًا"); return }
        sendControl("CALL_REQUEST")
        callState("يرن لدى الجهاز الآخر عبر Bluetooth…")
    }

    fun acceptIncomingCall() {
        sendControl("CALL_ACCEPT")
        startAudio()
    }

    fun declineIncomingCall() { sendControl("CALL_REJECT"); callState("تم رفض المكالمة") }

    fun endAudioCall() {
        sendControl("CALL_END")
        stopAudio()
        callState("انتهت المكالمة")
    }

    @Synchronized private fun startAudio() {
        if (audioRunning || socket?.isConnected != true) return
        try {
            val rate = 16000
            val minIn = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            val minOut = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
            if (minIn <= 0 || minOut <= 0) throw IllegalStateException("الصوت غير مدعوم على هذا الجهاز")
            val bufferSize = max(4096, minIn * 2)
            val input = AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION, rate,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferSize)
            val outputTrack = AudioTrack.Builder()
                .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setAudioFormat(AudioFormat.Builder().setSampleRate(rate).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setBufferSizeInBytes(max(4096, minOut * 2)).setTransferMode(AudioTrack.MODE_STREAM).build()
            audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            audioManager?.mode = AudioManager.MODE_IN_COMMUNICATION
            @Suppress("DEPRECATION")
            audioManager?.isSpeakerphoneOn = true
            recorder = input
            track = outputTrack
            audioRunning = true
            audioQueue.clear()
            input.startRecording()
            outputTrack.play()
            captureThread = thread(name = "SeifBtCapture", isDaemon = true) {
                val buffer = ByteArray(640)
                while (audioRunning) {
                    val count = try { input.read(buffer, 0, buffer.size) } catch (_: Exception) { -1 }
                    if (count > 0) sendFrame(AUDIO, buffer.copyOf(count)) else if (count < 0) break
                }
            }
            playbackThread = thread(name = "SeifBtPlayback", isDaemon = true) {
                while (audioRunning) {
                    val chunk = try { audioQueue.take() } catch (_: InterruptedException) { break }
                    try { outputTrack.write(chunk, 0, chunk.size) } catch (_: Exception) { break }
                }
            }
            callState("المكالمة الصوتية عبر Bluetooth نشطة")
            report("بدأ الصوت ثنائي الاتجاه عبر Bluetooth.")
        } catch (e: Exception) {
            stopAudio()
            report("تعذر تشغيل المكالمة: ${e.localizedMessage ?: ""}")
            callState("تعذر بدء المكالمة")
        }
    }

    @Synchronized private fun stopAudio() {
        audioRunning = false
        try { recorder?.stop() } catch (_: Exception) {}
        try { recorder?.release() } catch (_: Exception) {}
        recorder = null
        try { track?.pause() } catch (_: Exception) {}
        try { track?.flush() } catch (_: Exception) {}
        try { track?.stop() } catch (_: Exception) {}
        try { track?.release() } catch (_: Exception) {}
        track = null
        captureThread?.interrupt(); captureThread = null
        playbackThread?.interrupt(); playbackThread = null
        audioQueue.clear()
        audioManager?.mode = AudioManager.MODE_NORMAL
        @Suppress("DEPRECATION")
        run { audioManager?.isSpeakerphoneOn = false }
    }

    private fun hasConnectPermission(): Boolean = Build.VERSION.SDK_INT < 31 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED

    fun stop() {
        running = false
        stopAudio()
        try { server?.close() } catch (_: Exception) {}
        try { socket?.close() } catch (_: Exception) {}
        socket = null
        output = null
        connectionChanged(false, "")
    }
}
