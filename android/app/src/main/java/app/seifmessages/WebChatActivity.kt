package app.seifmessages

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.*
import android.widget.Button
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

class WebChatActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private lateinit var audioManager: AudioManager
    private lateinit var routeButton: Button
    private var pendingWebPermission: PermissionRequest? = null
    private var bluetoothRouteActive = false

    private val mediaPermissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        val request = pendingWebPermission
        pendingWebPermission = null
        if (request != null && result.values.all { it }) request.grant(request.resources) else request?.deny()
    }
    private val bluetoothPermissionLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) toggleAudioRoute() else Toast.makeText(this, "يلزم إذن Bluetooth لاستخدام سماعة Bluetooth.", Toast.LENGTH_LONG).show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        webView = WebView(this)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadsImagesAutomatically = true
            javaScriptCanOpenWindowsAutomatically = true
            allowContentAccess = true
            allowFileAccess = false
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val scheme = request?.url?.scheme ?: return false
                return scheme != "https" && scheme != "http"
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val needed = mutableListOf<String>()
                    if (request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) &&
                        ContextCompat.checkSelfPermission(this@WebChatActivity, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                        needed += Manifest.permission.RECORD_AUDIO
                    }
                    if (request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE) &&
                        ContextCompat.checkSelfPermission(this@WebChatActivity, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                        needed += Manifest.permission.CAMERA
                    }
                    if (needed.isEmpty()) request.grant(request.resources)
                    else { pendingWebPermission = request; mediaPermissionLauncher.launch(needed.toTypedArray()) }
                }
            }
        }

        val root = FrameLayout(this)
        root.addView(webView, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ))
        routeButton = Button(this).apply {
            text = "استخدام Bluetooth"
            textSize = 12f
            isAllCaps = false
            setOnClickListener { requestBluetoothRoute() }
        }
        val buttonParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.TOP or Gravity.END
        ).apply {
            val margin = (10 * resources.displayMetrics.density).toInt()
            setMargins(margin, margin + (24 * resources.displayMetrics.density).toInt(), margin, 0)
        }
        root.addView(routeButton, buttonParams)
        setContentView(root)
        webView.loadUrl("https://seifjaballah77-eng.github.io/wasel-social/")
    }

    private fun requestBluetoothRoute() {
        if (Build.VERSION.SDK_INT >= 31 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            bluetoothPermissionLauncher.launch(Manifest.permission.BLUETOOTH_CONNECT)
            return
        }
        toggleAudioRoute()
    }

    private fun toggleAudioRoute() {
        try {
            if (!bluetoothRouteActive) {
                if (Build.VERSION.SDK_INT >= 31) {
                    val bluetoothDevice = audioManager.availableCommunicationDevices.firstOrNull {
                        it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                            (Build.VERSION.SDK_INT >= 31 && it.type == AudioDeviceInfo.TYPE_BLE_HEADSET)
                    }
                    if (bluetoothDevice == null) {
                        Toast.makeText(this, "لم يتم العثور على سماعة Bluetooth متصلة. صِل السماعة أولًا.", Toast.LENGTH_LONG).show()
                        return
                    }
                    if (!audioManager.setCommunicationDevice(bluetoothDevice)) {
                        Toast.makeText(this, "تعذر تحويل صوت المكالمة إلى Bluetooth.", Toast.LENGTH_LONG).show()
                        return
                    }
                } else {
                    @Suppress("DEPRECATION")
                    run {
                        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
                        audioManager.startBluetoothSco()
                        audioManager.isBluetoothScoOn = true
                    }
                }
                bluetoothRouteActive = true
                routeButton.text = "العودة إلى صوت الهاتف"
                Toast.makeText(this, "تم اختيار صوت Bluetooth للمكالمة.", Toast.LENGTH_SHORT).show()
            } else {
                if (Build.VERSION.SDK_INT >= 31) {
                    val speaker = audioManager.availableCommunicationDevices.firstOrNull {
                        it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                    }
                    if (speaker != null) audioManager.setCommunicationDevice(speaker)
                    else audioManager.clearCommunicationDevice()
                } else {
                    @Suppress("DEPRECATION")
                    run {
                        audioManager.isBluetoothScoOn = false
                        audioManager.stopBluetoothSco()
                        audioManager.isSpeakerphoneOn = true
                    }
                }
                bluetoothRouteActive = false
                routeButton.text = "استخدام Bluetooth"
                Toast.makeText(this, "عاد صوت المكالمة إلى الهاتف.", Toast.LENGTH_SHORT).show()
            }
        } catch (e: SecurityException) {
            Toast.makeText(this, "لا توجد صلاحية Bluetooth. اسمح بها من إعدادات التطبيق.", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            Toast.makeText(this, "تعذر تغيير مخرج الصوت: ${e.localizedMessage ?: "خطأ"}", Toast.LENGTH_LONG).show()
        }
    }

    private fun resetAudioRoute() {
        try {
            if (Build.VERSION.SDK_INT >= 31) audioManager.clearCommunicationDevice()
            else {
                @Suppress("DEPRECATION")
                run {
                    audioManager.isBluetoothScoOn = false
                    audioManager.stopBluetoothSco()
                    audioManager.isSpeakerphoneOn = false
                }
            }
            audioManager.mode = AudioManager.MODE_NORMAL
        } catch (_: Exception) {}
        bluetoothRouteActive = false
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        resetAudioRoute()
        if (::webView.isInitialized) {
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }
}
