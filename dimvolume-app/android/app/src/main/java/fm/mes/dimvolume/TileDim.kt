package fm.mes.dimvolume

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/** Quick Settings tile: dim on / off with one tap. */
class TileDim : TileService() {
    companion object {
        fun refresh(c: Context) {
            if (Build.VERSION.SDK_INT >= 24) runCatching { requestListeningState(c, ComponentName(c, TileDim::class.java)) }
        }
    }

    override fun onStartListening() {
        Store.load(this)
        qsTile?.apply {
            state = if (Store.dimOn.value) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
            if (Build.VERSION.SDK_INT >= 29) subtitle = if (Store.dimOn.value) "${Store.dim.intValue}%" else "Off"
            updateTile()
        }
    }

    override fun onClick() {
        Store.load(this)
        if (!DimService.canOverlay(this)) {
            val i = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (Build.VERSION.SDK_INT >= 34) startActivityAndCollapse(
                android.app.PendingIntent.getActivity(this, 0, i, android.app.PendingIntent.FLAG_IMMUTABLE))
            else @Suppress("DEPRECATION") startActivityAndCollapse(i)
            return
        }
        DimService.send(this, DimService.A_DIM_TOGGLE)
        Store.dimOn.value = !Store.dimOn.value
        onStartListening()
    }
}
