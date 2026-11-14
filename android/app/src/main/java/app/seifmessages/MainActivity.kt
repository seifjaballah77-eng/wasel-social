package app.seifmessages

import android.Manifest
import android.content.pm.PackageManager
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
    private lateinit var nearby: OfflineNearbyManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        nearby = OfflineNearbyManager(this) { message -> runOnUiThread { status.text = message } }
        status = TextView(this).apply {
            text = "Seif Messages\nالاتصال القريب غير نشط"
            textSize = 18f
            setPadding(24, 36, 24, 24)
        }
        val start = Button(this).apply {
            text = "البحث عن جهاز قريب دون إنترنت"
            setOnClickListener {
                if (hasNearbyPermissions()) nearby.start() else requestNearbyPermissions()
            }
        }
        val stop = Button(this).apply {
            text = "إيقاف البحث"
            setOnClickListener { nearby.stop() }
        }
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
            addView(status); addView(start); addView(stop)
        }
        setContentView(layout)
    }

    private fun requiredPermissions(): Array<String> {
        val permissions = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= 31) {
            permissions += Manifest.permission.BLUETOOTH_SCAN
            permissions += Manifest.permission.BLUETOOTH_CONNECT
            permissions += Manifest.permission.BLUETOOTH_ADVERTISE
        } else permissions += Manifest.permission.ACCESS_FINE_LOCATION
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
        if (requestCode == 410 && hasNearbyPermissions()) nearby.start()
        else status.text = "يلزم السماح بصلاحيات الأجهزة القريبة وBluetooth للبحث دون إنترنت."
    }

    override fun onDestroy() {
        nearby.stop()
        super.onDestroy()
    }
}
