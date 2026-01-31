"""
Misaka Cipher - Content Scanner
Analyzes content for restricted patterns and security threats
"""

import re
import hashlib
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass
from enum import Enum
from utils.logger import get_logger

logger = get_logger(__name__)


class ScanSeverity(Enum):
    """Severity levels for scan results."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ScanAction(Enum):
    """Actions to take based on scan results."""
    ROUTE_LOCAL = "route_local"
    BLOCK = "block"
    ALLOW = "allow"


@dataclass
class ScanResult:
    """Result of a content scan."""
    is_clean: bool
    action: ScanAction
    matches: List[Dict]
    severity: Optional[ScanSeverity] = None
    prompt_hash: Optional[str] = None
    
    def __str__(self):
        if self.is_clean:
            return "CLEAN"
        return f"FLAGGED: {self.action.value} (severity: {self.severity.value if self.severity else 'unknown'})"


class ContentScanner:
    """
    Scans content for restricted patterns and security threats.
    
    Part of the Intelligence Firewall system.
    """
    
    def __init__(self, patterns: List[Dict]):
        """
        Initialize scanner with restriction patterns.
        
        Args:
            patterns: List of pattern dictionaries from security.yaml
        """
        self.patterns = []
        
        # Compile patterns
        for pattern_config in patterns:
            try:
                flags = 0 if pattern_config.get('case_sensitive', True) else re.IGNORECASE
                compiled_pattern = re.compile(pattern_config['pattern'], flags)
                
                self.patterns.append({
                    'pattern': compiled_pattern,
                    'category': pattern_config.get('category', 'unknown'),
                    'action': ScanAction(pattern_config.get('action', 'allow')),
                    'severity': ScanSeverity(pattern_config.get('severity', 'medium')),
                    'original': pattern_config['pattern']
                })
            except Exception as e:
                logger.error(f"Failed to compile pattern {pattern_config.get('pattern')}: {str(e)}")
        
        logger.info(f"Content scanner initialized with {len(self.patterns)} patterns")
    
    def scan(self, content: str, trace_id: str) -> ScanResult:
        """
        Scan content for restricted patterns.
        
        Args:
            content: Content to scan
            trace_id: Trace ID for this scan
            
        Returns:
            ScanResult with findings
        """
        matches = []
        highest_severity = None
        recommended_action = ScanAction.ALLOW
        
        # Generate content hash for privacy
        prompt_hash = hashlib.sha256(content.encode()).hexdigest()[:16]
        
        logger.debug(f"[{trace_id}] Scanning content (hash: {prompt_hash})")
        
        # Scan against all patterns
        for pattern_info in self.patterns:
            pattern = pattern_info['pattern']
            found_matches = pattern.findall(content)
            
            if found_matches:
                match_info = {
                    'category': pattern_info['category'],
                    'action': pattern_info['action'],
                    'severity': pattern_info['severity'],
                    'match_count': len(found_matches)
                }
                matches.append(match_info)
                
                logger.warning(
                    f"[{trace_id}] Pattern match: category={pattern_info['category']}, "
                    f"severity={pattern_info['severity'].value}, matches={len(found_matches)}"
                )
                
                # Track highest severity
                if highest_severity is None or self._compare_severity(pattern_info['severity'], highest_severity) > 0:
                    highest_severity = pattern_info['severity']
                    recommended_action = pattern_info['action']
        
        # Determine final result
        is_clean = len(matches) == 0
        
        if is_clean:
            logger.info(f"[{trace_id}] Content scan: CLEAN")
        else:
            logger.warning(
                f"[{trace_id}] Content scan: FLAGGED with {len(matches)} pattern matches, "
                f"action={recommended_action.value}"
            )
        
        return ScanResult(
            is_clean=is_clean,
            action=recommended_action if not is_clean else ScanAction.ALLOW,
            matches=matches,
            severity=highest_severity,
            prompt_hash=prompt_hash
        )
    
    def _compare_severity(self, sev1: ScanSeverity, sev2: ScanSeverity) -> int:
        """
        Compare two severity levels.
        
        Returns:
            1 if sev1 > sev2, -1 if sev1 < sev2, 0 if equal
        """
        severity_order = {
            ScanSeverity.LOW: 1,
            ScanSeverity.MEDIUM: 2,
            ScanSeverity.HIGH: 3,
            ScanSeverity.CRITICAL: 4
        }
        
        rank1 = severity_order.get(sev1, 0)
        rank2 = severity_order.get(sev2, 0)
        
        if rank1 > rank2:
            return 1
        elif rank1 < rank2:
            return -1
        return 0
