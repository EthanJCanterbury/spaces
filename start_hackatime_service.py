
#!/usr/bin/env python3
import os
import sys
import subprocess
import time
import logging
import signal

# Configure logging
logging.basicConfig(level=logging.INFO,
                   format='[%(asctime)s] [%(levelname)s] %(message)s',
                   datefmt='%Y-%m-%d %H:%M:%S')
logger = logging.getLogger('hackatime_launcher')

def run_hackatime_service():
    """
    Starts the Hackatime service as a subprocess.
    """
    try:
        logger.info("Starting Hackatime service...")
        process = subprocess.Popen(
            [sys.executable, 'hackatime_service.py'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # Wait a moment to make sure it starts
        time.sleep(2)
        
        if process.poll() is not None:
            # Process terminated immediately
            stdout, stderr = process.communicate()
            logger.error(f"Failed to start Hackatime service. Error: {stderr.decode()}")
            return None
        
        logger.info(f"Hackatime service started with PID {process.pid}")
        return process
    except Exception as e:
        logger.error(f"Error starting Hackatime service: {str(e)}")
        return None

def stop_service(process):
    """
    Stops the Hackatime service gracefully.
    """
    if process and process.poll() is None:
        logger.info(f"Stopping Hackatime service (PID {process.pid})...")
        try:
            process.send_signal(signal.SIGTERM)
            process.wait(timeout=5)
            logger.info("Hackatime service stopped gracefully")
        except subprocess.TimeoutExpired:
            logger.warning("Timeout waiting for service to stop, forcing termination")
            process.kill()
        except Exception as e:
            logger.error(f"Error stopping service: {str(e)}")
            process.kill()

if __name__ == "__main__":
    # Handle Ctrl+C gracefully
    process = None
    
    try:
        process = run_hackatime_service()
        
        if process:
            # Keep script running
            logger.info("Hackatime service launcher running. Press Ctrl+C to stop.")
            while process.poll() is None:
                time.sleep(1)
            
            # Process terminated unexpectedly
            stdout, stderr = process.communicate()
            logger.error(f"Hackatime service terminated unexpectedly. Exit code: {process.returncode}")
            logger.error(f"Error output: {stderr.decode()}")
        else:
            logger.error("Failed to start Hackatime service")
            sys.exit(1)
    
    except KeyboardInterrupt:
        logger.info("Received shutdown signal, stopping services...")
    finally:
        stop_service(process)
        logger.info("Shutdown complete")
