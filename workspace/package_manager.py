"""
Misaka Cipher - Package Manager
Manages Python package requests, approvals, and installations
"""

import json
import subprocess
import sys
from pathlib import Path
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import List, Dict, Optional
from enum import Enum

from workspace.package_intelligence import get_package_intelligence, PackageInfo
from utils import get_logger

logger = get_logger("workspace.package_manager")


class PackageStatus(Enum):
    """Status of a package request."""
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    INSTALLED = "installed"
    FAILED = "failed"


@dataclass
class PackageRequest:
    """A request to install a Python package."""
    
    package_name: str
    requested_by: str  # Tool or agent name
    reason: str
    requested_at: str
    status: str = PackageStatus.PENDING.value
    metadata: Optional[Dict] = None  # PackageInfo as dict


class PackageManager:
    """
    Central registry for tracking and managing Python package installations.
    
    Handles package requests, user approvals/denials, and installations.
    Persists state to workspace/packages.json.
    """
    
    def __init__(self, workspace_root: Path):
        """
        Initialize package manager.
        
        Args:
            workspace_root: Root directory for workspace files
        """
        self.workspace_root = workspace_root
        self.packages_file = workspace_root / "packages.json"
        self.intelligence = get_package_intelligence()
        
        # Load existing state
        self.requests: Dict[str, PackageRequest] = {}
        self.installed: Dict[str, str] = {}  # {package: version}
        self.denied: List[str] = []
        
        self._load_state()
        logger.info(f"Package Manager initialized (workspace: {workspace_root})")
    
    def is_available(self, package_name: str) -> bool:
        """
        Check if a package is available (installed or approved).
        
        Args:
            package_name: Name of the package
            
        Returns:
            True if package is installed or approved for installation
        """
        return (
            package_name in self.installed or
            (package_name in self.requests and 
             self.requests[package_name].status == PackageStatus.APPROVED.value)
        )
    
    def request_package(
        self, 
        package_name: str, 
        reason: str, 
        requested_by: str
    ) -> bool:
        """
        Request a new package installation.
        
        Args:
            package_name: Name of the package
            reason: Justification for the request
            requested_by: Tool or agent requesting the package
            
        Returns:
            True if request was created, False if already exists
        """
        # Check if already installed
        if package_name in self.installed:
            logger.info(f"Package {package_name} already installed")
            return False
        
        # Check if already requested
        if package_name in self.requests:
            logger.info(f"Package {package_name} already requested")
            return False
        
        # Check if denied
        if package_name in self.denied:
            logger.warning(f"Package {package_name} was previously denied")
            return False
        
        # Fetch package metadata
        logger.info(f"Requesting package: {package_name} (by: {requested_by})")
        package_info = self.intelligence.get_package_info(package_name)
        
        metadata = None
        if package_info:
            # Convert PackageInfo to dict
            metadata = {
                'name': package_info.name,
                'version': package_info.version,
                'description': package_info.description,
                'author': package_info.author,
                'downloads_last_month': package_info.downloads_last_month,
                'github_stars': package_info.github_stars,
                'first_release': package_info.first_release_date.isoformat() if package_info.first_release_date else None,
                'last_release': package_info.last_release_date.isoformat() if package_info.last_release_date else None,
                'total_releases': package_info.total_releases,
                'is_actively_maintained': package_info.is_actively_maintained,
                'dependencies': package_info.dependencies,
                'dependency_count': package_info.dependency_count,
                'safety_score': package_info.safety_score,
                'safety_level': package_info.safety_level,
                'safety_reasons': package_info.safety_reasons
            }
        
        # Create request
        request = PackageRequest(
            package_name=package_name,
            requested_by=requested_by,
            reason=reason,
            requested_at=datetime.now().isoformat(),
            status=PackageStatus.PENDING.value,
            metadata=metadata
        )
        
        self.requests[package_name] = request
        self._save_state()
        
        logger.info(
            f"Package request created: {package_name} "
            f"(safety: {metadata['safety_level'] if metadata else 'UNKNOWN'})"
        )
        return True
    
    def approve_package(self, package_name: str) -> bool:
        """
        Approve a package request and attempt installation.
        
        Args:
            package_name: Name of the package to approve
            
        Returns:
            True if installation succeeded, False otherwise
        """
        if package_name not in self.requests:
            logger.error(f"No request found for package: {package_name}")
            return False
        
        request = self.requests[package_name]
        request.status = PackageStatus.APPROVED.value
        self._save_state()
        
        logger.info(f"Package approved: {package_name}, attempting installation...")
        
        # Attempt installation
        try:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", package_name],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            # Mark as installed
            version = request.metadata.get('version', 'unknown') if request.metadata else 'unknown'
            self.installed[package_name] = version
            request.status = PackageStatus.INSTALLED.value
            
            # Remove from requests
            del self.requests[package_name]
            
            self._save_state()
            logger.info(f"✓ Package installed successfully: {package_name} v{version}")
            return True
            
        except subprocess.CalledProcessError as e:
            logger.error(f"✗ Package installation failed: {package_name} - {e}")
            request.status = PackageStatus.FAILED.value
            self._save_state()
            return False
    
    def deny_package(self, package_name: str) -> None:
        """
        Deny a package request.
        
        Args:
            package_name: Name of the package to deny
        """
        if package_name in self.requests:
            logger.info(f"Package denied: {package_name}")
            del self.requests[package_name]
            self.denied.append(package_name)
            self._save_state()
    
    def get_pending_requests(self) -> List[PackageRequest]:
        """
        Get all pending package requests.
        
        Returns:
            List of pending PackageRequest objects
        """
        return [
            req for req in self.requests.values()
            if req.status == PackageStatus.PENDING.value
        ]
    
    def get_installed_packages(self) -> Dict[str, str]:
        """
        Get all installed packages tracked by this manager.
        
        Returns:
            Dictionary of {package_name: version}
        """
        return self.installed.copy()
    
    def get_denied_packages(self) -> List[str]:
        """
        Get list of denied package names.
        
        Returns:
            List of package names that were denied
        """
        return self.denied.copy()
    
    def _load_state(self) -> None:
        """Load state from packages.json."""
        if not self.packages_file.exists():
            logger.info("No existing packages.json, starting fresh")
            return
        
        try:
            with open(self.packages_file, 'r') as f:
                data = json.load(f)
            
            # Load requests
            for req_data in data.get('requests', []):
                req = PackageRequest(**req_data)
                self.requests[req.package_name] = req
            
            # Load installed
            self.installed = data.get('installed', {})
            
            # Load denied
            self.denied = data.get('denied', [])
            
            logger.info(
                f"Loaded state: {len(self.requests)} requests, "
                f"{len(self.installed)} installed, {len(self.denied)} denied"
            )
            
        except Exception as e:
            logger.error(f"Failed to load packages.json: {e}")
    
    def _save_state(self) -> None:
        """Save state to packages.json."""
        try:
            # Ensure workspace directory exists
            self.workspace_root.mkdir(parents=True, exist_ok=True)
            
            data = {
                'requests': [asdict(req) for req in self.requests.values()],
                'installed': self.installed,
                'denied': self.denied,
                'last_updated': datetime.now().isoformat()
            }
            
            with open(self.packages_file, 'w') as f:
                json.dump(data, f, indent=2)
            
            logger.debug("State saved to packages.json")
            
        except Exception as e:
            logger.error(f"Failed to save packages.json: {e}")


# Singleton instance
_manager = None

def get_package_manager() -> PackageManager:
    """Get the singleton PackageManager instance."""
    global _manager
    if _manager is None:
        from tools.standard.file_ops import WORKSPACE_ROOT
        _manager = PackageManager(WORKSPACE_ROOT)
    return _manager
