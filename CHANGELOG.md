# Changelog

All notable changes to Aethvion Suite will be documented in this file.

## [v15] - 2026-04-20

### Major Additions
- **Incognito Chat Mode**: Private sessions with fully ephemeral threads that automatically wipe all data from memory on exit and bypass persistence.
- **Custom Graphical Installer**: Replaced the raw CMD installer with a clean, modern Aethvion-branded installer for a much better first-time experience.
- **Running Services Panel**: New panel to monitor and manage heavier local model servers (e.g. Trellis 2, TripoSR) running in their own isolated environments.
- **3D Models Hub & Workspace**: Dedicated section for downloading and generating 3D models locally using models like Trellis 2 and TripoSR, with export controls.

### Major Improvements
- **Agents**: Massive upgrade including token-level streaming with live thinking, automatic error recovery with repair passes, dynamic replanning, robust file editing with diff preview + undo/restore, better context handling, line-by-line shell output, improved web fetching, and a new performance dashboard.
- **Companions**: Complete rework — now fully dynamic with a unified companion engine. All companions (including custom ones) use the same backend.
- **Local Models**: Major overhaul — much cleaner UI and better organization.
- **Performance**: Significant backend improvements. Inactive tabs and non-visible panels now consume near-zero resources.
- **Data Structure**: Restructured `/data/` directories for better organization and clarity.
- **Model Registry**: Full rework with proper separation of defaults and suggested models. New users now get sensible defaults on first install.
- **Sidebar**: Now supports full hide mode and improved bottom section layout (2x2 grid).
- **Chat & Companions**: Token-level streaming everywhere + automatic thread creation when submitting a prompt with no active thread.
- **Settings**: Major UI overhaul with much better logic and user experience.
- **UX Consistency**: Large number of small improvements across all pages for a more polished and professional feel.
- **Styling & Code**: Fixed broken/default styling, cleaned up CSS and code throughout the project.
- **Desktop Overlay**: Removed the weird double border.

### Fixes
- Chat threads scrollbar flickering in empty threads
- Sidemenu missing tabs on preconfigured profiles (now shows all options correctly)
- Model selector not loading options on refresh
- Agents scrolling issues when switching/loading pages
- Many smaller stability and visual fixes

### How to Update
- Use the built-in **self-update** button in **Settings → Version Control**
- Or run `git pull` if you're using the git version

---

## [v14] - 2026-04-14

### Major UX Overhaul
- Fully dynamic sidebar with user-created profiles (Work, Leisure, Creative Studio, Companion Hub, etc.)
- Easy profile switching, customization, drag & drop reordering
- Complete Home page redesign — now a proper Mission Control dashboard
- Smooth panel transition animations and faster navigation
- Standardized panel headers, improved empty states, button animations, and consistent scrollbars across the app
- Chat now persists selected model after refresh/load

### Other Changes
- Chat: Added resend message, regenerate response, and copy options
- Code blocks in chat now include convenient copy buttons
- Many small UI fixes and polish

### How to Update
- Use the built-in **self-update** button in **Settings → Version Control**
- Or run `git pull` if you're using the git version

## [v13] and earlier
- Early development versions with rapid internal changes
- Initial implementation of agent workspaces, hybrid cloud + local support, and basic dashboard
- Everything is now significantly more polished and professional

*Older versions (v1 through v13) had very rapid internal development and are not fully documented here.*