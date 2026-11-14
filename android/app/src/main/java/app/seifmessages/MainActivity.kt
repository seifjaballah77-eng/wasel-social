package app.seifmessages

import android.Manifest
import android.content.Intent
import android.bluetooth.BluetoothAdapter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : ComponentActivity() {
    private lateinit var status: TextView
    private lateinit var callStatus: TextView
    private lateinit var bluetoothButton: Button
    private lateinit var callButton: Button
    private lateinit var acceptButton: Button
    private lateinit var declineButton: Button
    private lateinit var hangupButton: Button
    private lateinit var nearby: OfflineNearbyManager
    private var nearbyRunning = false
    private val enableBluetoothLauncher = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == RESULT_OK && hasNearbyPermissions()) startNearby()
        else status.text = "يجب تشغيل Bluetooth للسماح بالبحث عن الأجهزة القريبة."
    }
    private val permissionsLauncher = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestMultiplePermissions()) { results ->
        if (results.values.all { it } && hasNearbyPermissions()) startNearby()
        else status.text = "اسمح بصلاحيات الأجهزة القريبة والميكروفون للمكالمات."
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        status = TextView(this).apply { text = "شغّل الاتصال القريب على الهاتفين."; textSize = 15f; setPadding(8, 16, 8, 16) }
        callStatus = TextView(this).apply { text = "حالة المكالمة: لا توجد مكالمة"; textSize = 14f; setPadding(8, 12, 8, 12) }
        nearby = OfflineNearbyManager(this,
            { message -> runOnUiThread { status.text = message } },
            { message -> runOnUiThread {
                status.text = message
                acceptButton.visibility = View.VISIBLE
                declineButton.visibility = View.VISIBLE
            } },
            { message -> runOnUiThread { callStatus.text = "حالة المكالمة: " + message; callButton.isEnabled = message.contains("جاهز") || message.contains("نشطة"); if (message.contains("نشطة")) hangupButton.isEnabled = true; if (message.contains("انتهت") || message.contains("رفض") || message.contains("لا يوجد")) hangupButton.isEnabled = false } }
        )
        val title = TextView(this).apply { text = "Seif Messages"; textSize = 26f; setPadding(8, 28, 8, 12) }
        val onlineButton = Button(this).apply {
            text = "المراسلة والمكالمات عبر الإنترنت"
            setOnClickListener { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://seifjaballah77-eng.github.io/wasel-social/"))) }
        }
        bluetoothButton = Button(this).apply {
            text = "تشغيل الاتصال القريب"
            setOnClickListener {
                if (nearbyRunning) {
                    nearby.stop()
                    nearbyRunning = false
                    text = "تشغيل الاتصال القريب"
                    callButton.isEnabled = false
                    acceptButton.visibility = View.GONE
                    declineButton.visibility = View.GONE
                    hangupButton.isEnabled = false
                } else if (hasNearbyPermissions()) startNearby() else requestNearbyPermissions()
            }
        }
        callButton = Button(this).apply {
            text = "اتصال صوتي بالجهاز القريب"
            isEnabled = false
            setOnClickListener { nearby.startAudioCall(); hangupButton.isEnabled = true }
        }
        acceptButton = Button(this).apply {
            text = "قبول المكالمة"
            visibility = View.GONE
            setOnClickListener {
                nearby.acceptIncomingCall()
                visibility = View.GONE
                declineButton.visibility = View.GONE
                hangupButton.isEnabled = true
            }
        }
        declineButton = Button(this).apply {
            text = "رفض"
            visibility = View.GONE
            setOnClickListener {
                nearby.declineIncomingCall()
                visibility = View.GONE
                acceptButton.visibility = View.GONE
            }
        }
        hangupButton = Button(this).apply {
            text = "إنهاء المكالمة"
            isEnabled = false
            setOnClickListener { nearby.endAudioCall(); isEnabled = false }
        }
        val hint = TextView(this).apply {
            text = "الاستخدام: شغّل الاتصال القريب على الهاتفين، انتظر نجاح الربط، ثم ابدأ المكالمة. على الهاتف الآخر اضغط قبول. لا يلزم الإنترنت. Nearby يختار Bluetooth أو Wi‑Fi محليًا حسب الهاتف؛ جودة Bluetooth تختلف بين الأجهزة."
            textSize = 13f
            setPadding(8, 16, 8, 16)
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
            addView(title); addView(onlineButton); addView(bluetoothButton)
            addView(callButton); addView(acceptButton); addView(declineButton); addView(hangupButton)
            addView(hint); addView(callStatus); addView(status)
        })
    }

    private fun startNearby() {
        val adapter = BluetoothAdapter.getDefaultAdapter()
        if (adapter != null && !adapter.isEnabled) {
            status.text = "يرجى تشغيل Bluetooth. سيطلب Android الإذن الآن."
            try {
                enableBluetoothLauncher.launch(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE))
            } catch (e: Exception) {
                status.text = "افتح إعدادات Bluetooth وشغّله ثم أعد المحاولة."
            }
            return
        }
        nearbyRunning = true
        bluetoothButton.text = "إيقاف الاتصال القريب"
        callButton.isEnabled = false
        nearby.start()
    }

    private fun requiredPermissions(): Array<String> {
        val list = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= 31) {
            list += Manifest.permission.BLUETOOTH_SCAN
            list += Manifest.permission.BLUETOOTH_CONNECT
            list += Manifest.permission.BLUETOOTH_ADVERTISE
        } else list += Manifest.permission.ACCESS_FINE_LOCATION
        if (Build.VERSION.SDK_INT >= 33) list += Manifest.permission.NEARBY_WIFI_DEVICES
        list += Manifest.permission.RECORD_AUDIO
        return list.toTypedArray()
    }
    private fun hasNearbyPermissions() = requiredPermissions().all {
        ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
    }
    private fun requestNearbyPermissions() = permissionsLauncher.launch(requiredPermissions())
    override fun onDestroy() { nearby.stop(); super.onDestroy() }
}
