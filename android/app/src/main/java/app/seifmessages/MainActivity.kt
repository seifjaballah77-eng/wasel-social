package app.seifmessages

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : ComponentActivity() {
    private lateinit var status: TextView
    private lateinit var bluetoothButton: Button
    private lateinit var nearby: OfflineNearbyManager
    private var nearbyRunning = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        status = TextView(this).apply {
            text = "اختر طريقة الاتصال. يمكنك استخدام Bluetooth حتى مع وجود الإنترنت."
            textSize = 16f
            setPadding(8, 20, 8, 20)
        }

        nearby = OfflineNearbyManager(this) { message ->
            runOnUiThread { status.text = message }
        }

        val title = TextView(this).apply {
            text = "Seif Messages"
            textSize = 26f
            setPadding(8, 28, 8, 12)
        }

        val onlineButton = Button(this).apply {
            text = "الاتصال عبر الإنترنت"
            setOnClickListener {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://seifjaballah77-eng.github.io/wasel-social/"))
                startActivity(intent)
            }
        }

        bluetoothButton = Button(this).apply {
            text = "Bluetooth — اتصال قريب"
            contentDescription = "ابدأ البحث عن جهاز قريب عبر Bluetooth حتى عند توفر الإنترنت"
            setOnClickListener {
                if (nearbyRunning) {
                    nearby.stop()
                    nearbyRunning = false
                    text = "Bluetooth — اتصال قريب"
                } else if (hasNearbyPermissions()) {
                    startNearby()
                } else {
                    requestNearbyPermissions()
                }
            }
        }

        val hint = TextView(this).apply {
            text = "زر Bluetooth مستقل دائمًا. اختره يدويًا للبحث عن جهاز قريب دون الحاجة إلى الإنترنت. قد يستخدم Android وسيلة اتصال محلية أخرى إذا كانت أنسب."
            textSize = 13f
            setPadding(8, 16, 8, 16)
        }

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
            addView(title)
            addView(onlineButton)
            addView(bluetoothButton)
            addView(hint)
            addView(status)
        }
        setContentView(layout)
    }

    private fun startNearby() {
        nearbyRunning = true
        bluetoothButton.text = "إيقاف Bluetooth"
        nearby.start()
    }

    private fun requiredPermissions(): Array<String> {
        val permissions = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= 31) {
            permissions += Manifest.permission.BLUETOOTH_SCAN
            permissions += Manifest.permission.BLUETOOTH_CONNECT
            permissions += Manifest.permission.BLUETOOTH_ADVERTISE
        } else {
            permissions += Manifest.permission.ACCESS_FINE_LOCATION
        }
        if (Build.VERSION.SDK_INT >= 33) permissions += Manifest.permission.NEARBY_WIFI_DEVICES
        return permissions.toTypedArray()
    }

    private fun hasNearbyPermissions() = requiredPermissions().all {
        ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestNearbyPermissions() {
        ActivityCompat.requestPermissions(this, requiredPermissions(), 410)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, results)
        if (requestCode == 410 && hasNearbyPermissions()) {
            startNearby()
        } else if (requestCode == 410) {
            status.text = "يلزم السماح بصلاحيات الأجهزة القريبة وBluetooth لاستخدام الاتصال المحلي."
        }
    }

    override fun onDestroy() {
        nearby.stop()
        super.onDestroy()
    }
}
