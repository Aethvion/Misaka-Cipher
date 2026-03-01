import asyncio
import logging
import subprocess
import json
import re

# Setup logging
logger = logging.getLogger(__name__)

def _get_media_info_powershell() -> dict:
    """
    Tier 2 & 3 Fallback: Uses PowerShell to query SMTC first, 
    then falls back to scanning process window titles (Spotify, Chrome/YouTube).
    """
    script = """
    $OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    try {
        # Tier 2: SMTC via PowerShell
        $asyncOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]::RequestAsync()
        $timeout = 25
        while ($asyncOp.Status -eq 'Started' -and $timeout -gt 0) { Start-Sleep -Milliseconds 100; $timeout-- }
        
        if ($asyncOp.Status -eq 'Completed') {
            $mgr = $asyncOp.GetResults()
            $session = $mgr.GetCurrentSession()
            if ($session) {
                $propOp = $session.TryGetMediaPropertiesAsync()
                $timeout = 25
                while ($propOp.Status -eq 'Started' -and $timeout -gt 0) { Start-Sleep -Milliseconds 100; $timeout-- }
                if ($propOp.Status -eq 'Completed') {
                    $p = $propOp.GetResults()
                    if ($p.Title -or $p.Artist) {
                        return @{ title = $p.Title; artist = $p.Artist; source = $session.SourceAppUserModelId } | ConvertTo-Json -Compress
                    }
                }
            }
        }
    } catch {}

    # Tier 3: Window Title Fallback (For when SMTC is 'tone-deaf')
    try {
        $procs = Get-Process | Where-Object { $_.MainWindowTitle -ne "" }
        
        # 1. Spotify Check
        $spotify = $procs | Where-Object { $_.ProcessName -eq "Spotify" }
        if ($spotify -and $spotify.MainWindowTitle -ne "Spotify") {
            # Usually "Artist - Track" or "Track"
            return @{ title = $spotify.MainWindowTitle; artist = ""; source = "Spotify" } | ConvertTo-Json -Compress
        }
        
        # 2. Browser/YouTube Check
        $browser = $procs | Where-Object { $_.MainWindowTitle -match " - YouTube" }
        if ($browser) {
            $rawTitle = $browser.MainWindowTitle
            $cleanTitle = $rawTitle -replace " - YouTube.*$", ""
            return @{ title = $cleanTitle; artist = "YouTube"; source = $browser.ProcessName } | ConvertTo-Json -Compress
        }

        # 3. Generic Browser Media (SoundCloud, etc. often put name in title)
        $mediaBrowsers = $procs | Where-Object { $_.ProcessName -match "chrome|msedge|firefox" -and $_.MainWindowTitle -match "▶|Playing|Music" }
        if ($mediaBrowsers) {
            return @{ title = $mediaBrowsers[0].MainWindowTitle; artist = ""; source = $mediaBrowsers[0].ProcessName } | ConvertTo-Json -Compress
        }
    } catch {}

    return "null"
    """
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", script],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=True
        )
        output = result.stdout.strip()
        if output == "null" or not output:
            return None
        return json.loads(output)
    except Exception as e:
        logger.error(f"PowerShell fallback error: {e}")
        return None

async def _get_current_session_info():
    """Internal helper to get the current media session info using WinRT library."""
    try:
        from winrt.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as SessionManager
        sessions = await SessionManager.request_async()
        current_session = sessions.get_current_session()
        if not current_session:
            return None
        
        info = await current_session.try_get_media_properties_async()
        if not info.title and not info.artist:
            return None

        return {
            "title": info.title,
            "artist": info.artist,
            "album": info.album_title,
            "source": current_session.source_app_user_model_id
        }
    except (ImportError, Exception) as e:
        # If library missing or error, use PowerShell which handles Tiers 2 & 3
        return _get_media_info_powershell()

# --- Standardized Command ---

def get_media_info(args: dict) -> str:
    """Read what's currently playing on Windows (YouTube, Spotify, etc.)."""
    try:
        # Attempt Tier 1 (WinRT Library) which also triggers fallbacks
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            info = loop.run_until_complete(_get_current_session_info())
            loop.close()
        except Exception:
            info = _get_media_info_powershell()

        if not info:
            return "No active media playback detected on the system."
        
        title = info.get("title", "Unknown Title")
        artist = info.get("artist", "")
        source = info.get("source", "System")
        
        # Clean up source app name
        if "Spotify" in source: source = "Spotify"
        elif "chrome" in source.lower() or "YouTube" in source: source = "Web Browser"
        elif "msedge" in source.lower(): source = "Edge Browser"
        elif "Microsoft.ZuneMusic" in source: source = "Media Player"

        # Handle "Artist - Title" splitting for window title fallbacks
        if not artist and " - " in title:
            # Most window titles are "Artist - Track" or "Track - Artist"
            # We'll just present it clearly
            return f"Currently playing: {title} (via {source})"
        
        if artist:
            return f"Currently playing: '{title}' by {artist} (via {source})"
        else:
            return f"Currently playing: '{title}' (via {source})"
        
    except Exception as e:
        logger.error(f"Media Sentinel Error: {e}")
        return f"Nexus Error: Could not read system media info. {str(e)}"
