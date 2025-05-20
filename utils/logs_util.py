
import json
import os
from datetime import datetime
import threading

class LogsManager:
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(LogsManager, cls).__new__(cls)
                cls._instance.logs = []
                cls._instance.max_logs = 1000  # Maximum number of log entries to keep
            return cls._instance
    
    def add_log(self, message, level="INFO", source="system"):
        """Add a log entry"""
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "message": message,
            "level": level,
            "source": source
        }
        
        # Maintain max logs limit
        if len(self.logs) >= self.max_logs:
            self.logs.pop(0)
            
        self.logs.append(log_entry)
    
    def get_logs(self):
        """Get all logs"""
        return self.logs
    
    def clear_logs(self):
        """Clear all logs"""
        self.logs = []
    
    def save_logs(self, filepath="logs.json"):
        """Save logs to file"""
        try:
            with open(filepath, 'w') as f:
                json.dump(self.logs, f, indent=2)
            return True
        except Exception as e:
            print(f"Error saving logs: {str(e)}")
            return False

# Initialize singleton instance
logs_manager = LogsManager()
