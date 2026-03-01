import asyncio
import logging
from winrt.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as SessionManager

# Setup logging
logger = logging.getLogger(__name__)

async def _get_current_session_info():
    """Internal helper to get the current media session info using WinRT."""
    try:
        sessions = await SessionManager.request_async()
        current_session = sessions.get_current_session()
        if not current_session:
            return None
        
        info = await current_session.try_get_media_properties_async()
        return {
            "title": info.title,
            "artist": info.artist,
            "album": info.album_title,
            "source": current_session.source_app_user_model_id
        }
    except Exception as e:
        logger.error(f"Error reading SMTC info: {e}")
        return None

# --- Standardized Command ---

def get_media_info(args: dict) -> str:
    """Read what's currently playing on Windows (YouTube, Spotify, etc.)."""
    try:
        # WinRT calls must be run in an event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        info = loop.run_until_complete(_get_current_session_info())
        loop.close()

        if not info:
            return "No active media playback detected on the system."
        
        title = info.get("title", "Unknown Title")
        artist = info.get("artist", "Unknown Artist")
        source = info.get("source", "System")
        
        # Clean up source app name if possible
        if "Spotify" in source: source = "Spotify"
        elif "Chrome" in source or "YouTube" in source: source = "Web Browser"
        
        return f"Currently playing: '{title}' by {artist} (via {source})"
        
    except Exception as e:
        logger.error(f"Media Sentinel Error: {e}")
        return f"Nexus Error: Could not read system media info. {str(e)}"
