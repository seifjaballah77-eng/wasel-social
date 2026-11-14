package app.seifmessages

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

class MainActivity : ComponentActivity() {
    private lateinit var status: TextView
    private lateinit var callStatus: TextView
    private lateinit var connectionStatus: TextView
    private lateinit var bluetoothButton: Button
    private lateinit var callButton: Button
    private lateinit var acceptButton: Button
    private lateinit var declineButton: Button
    private lateinit var hangupButton: Button
    private lateinit var pairedList: LinearLayout
    private lateinit var messagesBox: LinearLayout
    private lateinit var messageInput: EditText
    private lateinit var sendButton: Button
    private lateinit var nearby: OfflineNearbyManager
    private var nearbyRunning = false
    private var connected = false

    private val enableBluetoothLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        if (it.resultCode == RESULT_OK && hasBluetoothPermissions()) startNearby()
        else status.text = "شغّل Bluetooth للسماح بالاتصال."
    }
    private val permissionsLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
        if (results.values.all { it } && hasBluetoothPermissions()) startNearby()
        else status.text = "يجب السماح بإذن Bluetooth والميكروفون."
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        nearby = OfflineNearbyManager(this,
            { message -> runOnUiThread { status.text = message } },
            { message -> runOnUiThread {
                status.text = message
                acceptButton.visibility = View.VISIBLE
                declineButton.visibility = View.VISIBLE
            } },
            { message -> runOnUiThread {
                callStatus.text = "حالة المكالمة: " + message
                if (message.contains("نشطة")) hangupButton.isEnabled = true
                if (message.contains("انتهت") || message.contains("رفض") || message.contains("لا يوجد") || message.contains("تعذر")) hangupButton.isEnabled = false
            } },
            { message -> runOnUiThread { addMessage("الطرف الآخر", message) } },
            { isConnected, peer -> runOnUiThread {
                connected = isConnected
                connectionStatus.text = if (isConnected) "متصل عبر Bluetooth: $peer" else "غير متصل"
                callButton.isEnabled = isConnected
                sendButton.isEnabled = isConnected
                messageInput.isEnabled = isConnected
                if (!isConnected) { acceptButton.visibility = View.GONE; declineButton.visibility = View.GONE; hangupButton.isEnabled = false }
            } }
        )

        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(18, 18, 18, 18) }
        val title = TextView(this).apply { text = "Seif Messages"; textSize = 26f; setPadding(4, 12, 4, 8) }
        val onlineButton = Button(this).apply {
            text = "فتح المراسلة عبر الإنترنت"
            setOnClickListener { startActivity(Intent(this@MainActivity, WebChatActivity::class.java)) }
        }
        status = TextView(this).apply { text = "اربط الهاتفين عبر Bluetooth أولًا من إعدادات Android."; textSize = 14f; setPadding(4, 8, 4, 8) }
        connectionStatus = TextView(this).apply { text = "غير متصل"; textSize = 15f; setPadding(4, 8, 4, 8) }
        bluetoothButton = Button(this).apply {
            text = "تشغيل استقبال Bluetooth"
            setOnClickListener {
                if (nearbyRunning) {
                    nearby.stop(); nearbyRunning = false; text = "تشغيل استقبال Bluetooth"
                    pairedList.removeAllViews(); connectionStatus.text = "غير متصل"
                } else if (hasBluetoothPermissions()) startNearby() else requestBluetoothPermissions()
            }
        }
        val pairButton = Button(this).apply {
            text = "فتح إعدادات إقران Bluetooth"
            setOnClickListener { startActivity(Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS)) }
        }
        val refreshButton = Button(this).apply {
            text = "تحديث الأجهزة المقترنة"
            setOnClickListener { showPairedDevices() }
        }
        pairedList = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        callButton = Button(this).apply {
            text = "بدء مكالمة صوتية Bluetooth"; isEnabled = false
            setOnClickListener { nearby.startAudioCall() }
        }
        acceptButton = Button(this).apply {
            text = "قبول المكالمة"; visibility = View.GONE
            setOnClickListener { nearby.acceptIncomingCall(); visibility = View.GONE; declineButton.visibility = View.GONE; hangupButton.isEnabled = true }
        }
        declineButton = Button(this).apply {
            text = "رفض المكالمة"; visibility = View.GONE
            setOnClickListener { nearby.declineIncomingCall(); visibility = View.GONE; acceptButton.visibility = View.GONE }
        }
        hangupButton = Button(this).apply {
            text = "إنهاء المكالمة"; isEnabled = false
            setOnClickListener { nearby.endAudioCall(); isEnabled = false }
        }
        callStatus = TextView(this).apply { text = "حالة المكالمة: لا توجد مكالمة"; setPadding(4, 8, 4, 8) }
        val chatTitle = TextView(this).apply { text = "الرسائل عبر Bluetooth"; textSize = 20f; setPadding(4, 18, 4, 8) }
        val scroll = ScrollView(this).apply {
            addView(LinearLayout(this@MainActivity).also { messagesBox = it; it.orientation = LinearLayout.VERTICAL; it.setPadding(8, 8, 8, 8) })
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        }
        messageInput = EditText(this).apply { hint = "اكتب رسالة…"; isEnabled = false; minLines = 1; maxLines = 4 }
        sendButton = Button(this).apply {
            text = "إرسال"; isEnabled = false
            setOnClickListener {
                val value = messageInput.text.toString().trim()
                if (value.isNotEmpty() && nearby.sendMessage(value)) { addMessage("أنت", value); messageInput.text.clear() }
                else if (value.isNotEmpty()) status.text = "تعذر الإرسال. تحقق من اتصال Bluetooth."
            }
        }
        root.addView(title); root.addView(onlineButton); root.addView(status); root.addView(connectionStatus)
        root.addView(bluetoothButton); root.addView(pairButton); root.addView(refreshButton); root.addView(pairedList)
        root.addView(callButton); root.addView(acceptButton); root.addView(declineButton); root.addView(hangupButton); root.addView(callStatus)
        root.addView(chatTitle); root.addView(scroll)
        root.addView(messageInput); root.addView(sendButton)
        setContentView(root)
    }

    private fun addMessage(sender: String, value: String) {
        val line = TextView(this).apply {
            text = "$sender: $value"; textSize = 16f; setPadding(10, 8, 10, 8)
        }
        messagesBox.addView(line)
    }

    private fun showPairedDevices() {
        pairedList.removeAllViews()
        val devices = nearby.pairedDevices()
        if (devices.isEmpty()) {
            pairedList.addView(TextView(this).apply { text = "لا توجد أجهزة مقترنة. افتح إعدادات Bluetooth واقرن الهاتف الآخر."; setPadding(4, 8, 4, 8) })
            return
        }
        devices.forEach { (name, address) ->
            pairedList.addView(Button(this).apply {
                text = "اتصال بـ $name"
                setOnClickListener { if (hasBluetoothPermissions()) nearby.connect(address) else requestBluetoothPermissions() }
            })
        }
    }

    private fun startNearby() {
        val adapter = BluetoothAdapter.getDefaultAdapter()
        if (adapter == null) { status.text = "هذا الهاتف لا يدعم Bluetooth."; return }
        if (!adapter.isEnabled) {
            try { enableBluetoothLauncher.launch(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)) }
            catch (_: Exception) { status.text = "شغّل Bluetooth من إعدادات الهاتف." }
            return
        }
        nearbyRunning = true
        bluetoothButton.text = "إيقاف استقبال Bluetooth"
        nearby.start()
        showPairedDevices()
    }

    private fun requiredPermissions(): Array<String> {
        val permissions = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= 31) permissions += Manifest.permission.BLUETOOTH_CONNECT
        permissions += Manifest.permission.RECORD_AUDIO
        return permissions.toTypedArray()
    }
    private fun hasBluetoothPermissions() = requiredPermissions().all {
        ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
    }
    private fun requestBluetoothPermissions() = permissionsLauncher.launch(requiredPermissions())

    override fun onDestroy() {
        nearby.stop()
        super.onDestroy()
    }
}
